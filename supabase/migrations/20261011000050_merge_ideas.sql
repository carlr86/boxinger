-- Boxinger · Merge duplicate ideas (Pro and Enterprise, team Admin only)
-- The duplicate's votes and comments move to the main idea, its author counts as an "importante" vote there,
-- and the duplicate is deleted. What it said is kept in idea_merges ("También la pidieron como"), its old link
-- leads to the main idea, and its author and voters get a bell notice (no email).

create table public.idea_merges (
  id                 bigint generated always as identity primary key,
  board_id           uuid not null references public.boards (id) on delete cascade,
  source_id          bigint not null,          -- the duplicate (deleted, so no FK)
  target_id          bigint not null references public.ideas (id) on delete cascade,
  source_title       text not null,
  source_description text not null default '',
  source_author_id   uuid references public.profiles (id) on delete set null,
  source_created_at  timestamptz not null,
  votes_moved        int not null default 0,
  comments_moved     int not null default 0,
  merged_by          uuid references public.profiles (id) on delete set null,
  merged_at          timestamptz not null default now()
);
create index idea_merges_source_idx on public.idea_merges (source_id);
create index idea_merges_target_idx on public.idea_merges (target_id);
alter table public.idea_merges enable row level security;

alter table public.comments add column merged_from bigint references public.idea_merges (id) on delete set null;

create or replace function public.merge_ideas(p_source bigint, p_target bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  src public.ideas;
  dst public.ideas;
  c public.board_ctx;
  b public.boards;
  m bigint;
  before_votes int;
  moved_votes int;
  moved_comments int;
  author_vote boolean := false;
  notified int := 0;
  who uuid;
begin
  if p_source = p_target then raise exception 'Elegí otra idea para unir.'; end if;
  select * into src from public.ideas where id = p_source for update;
  select * into dst from public.ideas where id = p_target for update;
  if src.id is null or dst.id is null then raise exception 'La idea no existe.'; end if;
  if src.board_id <> dst.board_id then raise exception 'Solo se pueden unir ideas del mismo buzón.'; end if;
  c := public.board_context(src.board_id, uid);
  if not coalesce(public.board_can_manage(src.board_id, uid), false) then
    raise exception 'Solo el Admin del equipo puede unir ideas.' using errcode = '42501';
  end if;
  if not c.pro then raise exception 'Unir ideas está disponible en los planes Pro y Enterprise.'; end if;
  perform public.writable_board(src.board_id, uid);
  select * into b from public.boards where id = src.board_id;

  insert into public.idea_merges (board_id, source_id, target_id, source_title, source_description, source_author_id, source_created_at, merged_by)
  values (src.board_id, src.id, dst.id, src.title, src.description, src.author_id, src.created_at, uid)
  returning id into m;
  -- ideas merged into the duplicate before now belong to the main one
  update public.idea_merges set target_id = dst.id where target_id = src.id and id <> m;

  -- Bell notice for the duplicate's author and voters (before their votes move), except whoever merges and blocked people.
  for who in
    select x.u from (
      select v.user_id u from public.votes v where v.idea_id = src.id
      union select src.author_id where src.author_id is not null
    ) x
    join public.profiles p on p.id = x.u
    where x.u is distinct from uid and p.status <> 'blocked'
      and (public.board_context(src.board_id, x.u)).role is distinct from 'blocked'
  loop
    insert into public.notifications (user_id, kind, payload, dedupe_key)
    values (who, 'idea_merged', jsonb_build_object('idea_id', dst.id, 'title', dst.title, 'from_title', src.title,
              'board_name', b.name, 'slug', b.slug, 'mine', who = src.author_id), 'n:merged:' || src.id || ':' || who)
    on conflict (dedupe_key) do nothing;
    notified := notified + 1;
  end loop;

  -- Votes: whoever voted both keeps the main idea's vote; the main idea's author can't vote their own idea.
  select count(*) into before_votes from public.votes where idea_id = dst.id;
  insert into public.votes (idea_id, user_id, value, created_at, updated_at)
  select dst.id, v.user_id, v.value, v.created_at, now() from public.votes v
  where v.idea_id = src.id and v.user_id is distinct from dst.author_id
  on conflict (idea_id, user_id) do nothing;
  get diagnostics moved_votes = row_count;
  -- The duplicate's author asked for it: an "importante" vote on the main idea.
  if src.author_id is not null and src.author_id is distinct from dst.author_id then
    insert into public.votes (idea_id, user_id, value, created_at, updated_at)
    values (dst.id, src.author_id, 'importante', src.created_at, now())
    on conflict (idea_id, user_id) do nothing;
    author_vote := found;
  end if;

  update public.comments set idea_id = dst.id, merged_from = m where idea_id = src.id;
  get diagnostics moved_comments = row_count;
  update public.idea_merges set votes_moved = (select count(*) from public.votes where idea_id = dst.id) - before_votes, comments_moved = moved_comments where id = m;

  delete from public.notifications where payload ->> 'idea_id' = src.id::text and kind <> 'idea_merged';
  delete from public.ideas where id = src.id;
  update public.ideas set updated_at = now() where id = dst.id;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'ideas_merged', 'board', src.board_id, jsonb_build_object('source', src.id, 'target', dst.id, 'votes', moved_votes, 'comments', moved_comments));
  perform public.touch_board(src.board_id);
  return jsonb_build_object('votes_moved', (select votes_moved from public.idea_merges where id = m), 'comments_moved', moved_comments,
                            'author_vote', author_vote, 'notified', notified);
end $$;
grant execute on function public.merge_ideas(bigint, bigint) to authenticated;

-- get_idea: a merged (deleted) idea answers {merged_into}; the main one lists what was merged into it
-- and marks the comments that came from a duplicate.
create or replace function public.get_idea(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  i public.ideas;
  b public.boards;
  c public.board_ctx;
  team boolean;
  comments jsonb;
  into_id bigint;
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then
    select target_id into into_id from public.idea_merges where source_id = p_id order by merged_at desc limit 1;
    if into_id is not null then return jsonb_build_object('merged_into', into_id); end if;
    return null;
  end if;
  select * into b from public.boards where id = i.board_id;
  c := public.board_context(i.board_id, uid);
  if not public.can_see_board(c, b.visibility) then return null; end if;
  team := coalesce(c.role in ('admin', 'member'), false);
  if i.hidden and not team then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', cm.id,
      'author_id', cm.author_id,
      'author_name', case when cm.deleted then 'Comentario eliminado' else coalesce(pa.name, 'Usuario eliminado') end,
      'author_avatar', pa.avatar_url,
      'author_team', coalesce((public.board_context(i.board_id, cm.author_id)).role in ('admin', 'member'), false),
      'body', case when cm.deleted then null else cm.body end,
      'deleted', cm.deleted, 'edited', cm.edited, 'hidden', cm.hidden, 'created_at', cm.created_at,
      'merged_from_title', (select mg.source_title from public.idea_merges mg where mg.id = cm.merged_from),
      'likes', (select count(*) from public.reactions x where x.comment_id = cm.id and x.value = 'like'),
      'dislikes', (select count(*) from public.reactions x where x.comment_id = cm.id and x.value = 'no_like'),
      'my_reaction', (select value from public.reactions x where x.comment_id = cm.id and x.user_id = uid),
      'reply', case when r.id is null then null else jsonb_build_object(
        'id', r.id, 'author_id', r.author_id, 'author_name', coalesce(pr.name, 'Equipo'), 'body', r.body,
        'edited', r.edited, 'created_at', r.created_at,
        'likes', (select count(*) from public.reactions x where x.reply_id = r.id and x.value = 'like'),
        'dislikes', (select count(*) from public.reactions x where x.reply_id = r.id and x.value = 'no_like'),
        'my_reaction', (select value from public.reactions x where x.reply_id = r.id and x.user_id = uid)) end
    ) order by cm.created_at), '[]')
    into comments
  from public.comments cm
  left join public.comment_replies r on r.comment_id = cm.id
  left join public.profiles pa on pa.id = cm.author_id
  left join public.profiles pr on pr.id = r.author_id
  where cm.idea_id = i.id and (not cm.deleted or r.id is not null) and (team or not cm.hidden);

  return public.idea_json(i, uid, team, null) || jsonb_build_object(
    'board_slug', b.slug,
    'comment_list', comments,
    'merges', coalesce((
      select jsonb_agg(jsonb_build_object('title', mg.source_title, 'description', mg.source_description,
               'author_name', coalesce(p.name, 'Usuario eliminado'), 'created_at', mg.source_created_at, 'merged_at', mg.merged_at)
             order by mg.merged_at)
      from public.idea_merges mg left join public.profiles p on p.id = mg.source_author_id
      where mg.target_id = i.id), '[]'),
    'history', case when team then coalesce((
      select jsonb_agg(jsonb_build_object('from', s.from_status, 'to', s.to_status, 'at', s.created_at, 'reason', s.reason) order by s.created_at)
      from public.status_changes s where s.idea_id = i.id), '[]') end
  );
end $$;
grant execute on function public.get_idea(bigint) to anon, authenticated;
