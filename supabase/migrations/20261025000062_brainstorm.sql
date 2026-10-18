-- Boxinger · Brainstorming (entrega 2 de tipos de buzón)
-- 1) Vote scale per board: three options (as always), 1 to 5 stars, or a single «me gusta». Changed only while no
--    one has voted (and only on Brainstorming boards). Every score goes through vote_points().
-- 2) Affinity groups: the team creates named columns and drags voted ideas into them (ideas.group_id).
-- 3) accept_idea: approves an idea, which moves it to the Backlog (the end of the brainstorm).
-- Function bodies start from the production definitions (pg_get_functiondef, 2026-10-18).

alter table public.boards add column vote_scale text not null default 'tres' check (vote_scale in ('tres', 'cinco', 'like'));
alter table public.votes drop constraint votes_value_check;
alter table public.votes add constraint votes_value_check check (value in ('importante', 'interesante', 'no_importante', '1', '2', '3', '4', '5', 'like'));

create or replace function public.vote_points(p_value text)
returns int language sql immutable set search_path = public as $$
  select case p_value when 'importante' then 2 when 'interesante' then 1 when 'no_importante' then 0 when 'like' then 1
                      when '1' then 1 when '2' then 2 when '3' then 3 when '4' then 4 when '5' then 5 else 0 end;
$$;
grant execute on function public.vote_points(text) to anon, authenticated;

create or replace function public.set_vote_scale(p_board uuid, p_scale text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.boards;
begin
  perform public.require_board_admin(p_board);
  select * into b from public.boards where id = p_board;
  if b.kind <> 'brainstorm' then raise exception 'La escala de votos se elige en los buzones de Brainstorming.'; end if;
  if p_scale not in ('tres', 'cinco', 'like') then raise exception 'Escala inválida.'; end if;
  if b.vote_scale <> p_scale and exists (select 1 from public.votes v join public.ideas i on i.id = v.idea_id where i.board_id = p_board) then
    raise exception 'La escala no se puede cambiar porque ya hay votos.';
  end if;
  update public.boards set vote_scale = p_scale where id = p_board;
end $$;
grant execute on function public.set_vote_scale(uuid, text) to authenticated;

create table public.idea_groups (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index idea_groups_board_idx on public.idea_groups (board_id, position);
alter table public.idea_groups enable row level security;
alter table public.ideas add column group_id uuid references public.idea_groups (id) on delete set null;

-- The team, on a board whose type includes grouping by affinity, on a paid plan.
create or replace function public.require_affinity(p_board uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.board_ctx := public.require_team(p_board);
  b public.boards;
begin
  select * into b from public.boards where id = p_board;
  if not coalesce((public.board_modules(b) ->> 'affinity')::boolean, false) then raise exception 'Este buzón no agrupa ideas por afinidad.'; end if;
  if not c.pro then raise exception 'Disponible en los planes Pro, Team y Enterprise.'; end if;
  perform public.writable_board(p_board, auth.uid());
end $$;
revoke execute on function public.require_affinity(uuid) from public, anon, authenticated;

create or replace function public.create_group(p_board uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, ''));
  id uuid;
begin
  perform public.require_affinity(p_board);
  if n = '' or char_length(n) > 60 then raise exception 'El nombre del grupo es obligatorio (máx. 60 caracteres).'; end if;
  insert into public.idea_groups (board_id, name, position)
  values (p_board, n, coalesce((select max(position) + 1 from public.idea_groups where board_id = p_board), 0))
  returning idea_groups.id into id;
  perform public.touch_board(p_board);
  return id;
end $$;
grant execute on function public.create_group(uuid, text) to authenticated;

create or replace function public.rename_group(p_group uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.idea_groups;
  n text := trim(coalesce(p_name, ''));
begin
  select * into g from public.idea_groups where id = p_group;
  if g.id is null then raise exception 'El grupo no existe.'; end if;
  perform public.require_affinity(g.board_id);
  if n = '' or char_length(n) > 60 then raise exception 'El nombre del grupo es obligatorio (máx. 60 caracteres).'; end if;
  update public.idea_groups set name = n where id = p_group;
  perform public.touch_board(g.board_id);
end $$;
grant execute on function public.rename_group(uuid, text) to authenticated;

-- Deleting a group sends its ideas back to the list (group_id goes null).
create or replace function public.delete_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.idea_groups;
begin
  select * into g from public.idea_groups where id = p_group;
  if g.id is null then return; end if;
  perform public.require_affinity(g.board_id);
  delete from public.idea_groups where id = p_group;
  perform public.touch_board(g.board_id);
end $$;
grant execute on function public.delete_group(uuid) to authenticated;

create or replace function public.move_idea_to_group(p_idea bigint, p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.ideas;
begin
  select * into i from public.ideas where id = p_idea;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  perform public.require_affinity(i.board_id);
  if p_group is not null and not exists (select 1 from public.idea_groups where id = p_group and board_id = i.board_id) then
    raise exception 'El grupo no es de este buzón.';
  end if;
  update public.ideas set group_id = p_group, updated_at = now() where id = p_idea;
  perform public.touch_board(i.board_id);
end $$;
grant execute on function public.move_idea_to_group(bigint, uuid) to authenticated;

-- «Aceptar»: approve the idea (it moves to the Backlog). Reuses set_idea_status, which also tells the author.
create or replace function public.accept_idea(p_idea bigint)
returns void language plpgsql security definer set search_path = public as $$
declare i public.ideas;
begin
  select * into i from public.ideas where id = p_idea;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  perform public.require_affinity(i.board_id);
  if i.status = 'aprobada' then return; end if;
  perform public.set_idea_status(p_idea, 'aprobada', null);
end $$;
grant execute on function public.accept_idea(bigint) to authenticated;

CREATE OR REPLACE FUNCTION public.idea_json(i ideas, p_uid uuid, p_team boolean, p_rank integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with v as (
    select count(*) filter (where value = 'importante') as imp,
           count(*) filter (where value = 'interesante') as inte,
           count(*) filter (where value = 'no_importante') as noimp,
           count(*) as total, coalesce(sum(public.vote_points(value)), 0) as pts
    from public.votes where idea_id = i.id
  )
  , h as (select public.author_hidden(i, p_uid) as hide)
  select jsonb_build_object(
    'id', i.id, 'board_id', i.board_id, 'title', i.title, 'description', i.description, 'category_id', i.category_id,
    'origin', i.origin, 'status', i.status, 'reject_reason', i.reject_reason, 'approved_at', i.approved_at,
    'hidden', i.hidden, 'created_at', i.created_at, 'author_id', case when h.hide then null else i.author_id end, 'anonymous', i.anonymous, 'ai', i.ai_generated, 'imported', i.imported, 'image_path', i.image_path,
    'author_name', case when h.hide then 'Anónimo' else coalesce((select name from public.profiles where id = i.author_id),
                            case when i.imported then case when p_team then coalesce(i.requester_name, 'Importada') else 'Importada' end
                                 when i.source is not null then case when p_team then coalesce(i.requester_name, i.requester_email, 'Recibida por el Equipo') else 'Recibida por el Equipo' end end,
                            'Usuario eliminado') end,
    'author_avatar', case when h.hide then null else (select avatar_url from public.profiles where id = i.author_id) end,
    'votes', v.total, 'points', v.pts, 'group_id', i.group_id,
    'avg', case when v.total > 0 then round(v.pts::numeric / v.total, 1) end,
    'comments', (select count(*) from public.comments c
                 where c.idea_id = i.id and (not c.deleted or exists (select 1 from public.comment_replies r where r.comment_id = c.id))
                   and (p_team or not c.hidden)),
    'my_vote', (select value from public.votes where idea_id = i.id and user_id = p_uid),
    'rank', p_rank,
    'launched_at', case when i.dev_status = 'lanzada' then i.launched_at end
  ) || case when p_team then jsonb_build_object(
    'importante', v.imp, 'interesante', v.inte, 'no_importante', v.noimp, 'score', v.pts,
    'impact', i.impact, 'effort', i.effort, 'rm_col', i.rm_col, 'rm_order', i.rm_order, 'priority', i.priority,
    'dev_status', i.dev_status, 'dev_at', i.dev_at, 'launched_at', i.launched_at,
    'chk_design', i.chk_design, 'chk_prd', i.chk_prd, 'growth', to_jsonb(i.growth),
    'requester_name', i.requester_name, 'requester_email', i.requester_email, 'source', i.source, 'archived', i.archived_at is not null)
    when public.board_roadmap_public(i.board_id) then jsonb_build_object(
    'rm_col', i.rm_col, 'rm_order', i.rm_order, 'dev_status', i.dev_status, 'launched_at', i.launched_at)
    else '{}'::jsonb end
  from v, h;
$function$;

CREATE OR REPLACE FUNCTION public.vote(p_idea bigint, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i public.ideas;
  c public.board_ctx;
  uid uuid;
  n int;
begin
  select * into i from public.ideas where id = p_idea;
  if i.id is null or i.hidden then raise exception 'La idea no existe.'; end if;
  c := public.participate(i.board_id);
  uid := auth.uid();
  if i.status not in ('pendiente', 'en_revision') then raise exception 'La votación está cerrada. Los votos quedaron congelados.'; end if;
  if i.author_id = uid then raise exception 'No podés votar tus propias ideas.'; end if;
  if p_value is null then
    delete from public.votes where idea_id = p_idea and user_id = uid;
    return;
  end if;
  if p_value not in (select unnest(case (select vote_scale from public.boards where id = i.board_id)
                        when 'cinco' then array['1', '2', '3', '4', '5'] when 'like' then array['like']
                        else array['importante', 'interesante', 'no_importante'] end)) then
    raise exception 'Voto inválido.';
  end if;
  select count(*) into n from public.votes where user_id = uid and updated_at > now() - interval '1 minute';
  perform public.rate_limit('votos', n, 30);
  insert into public.votes (idea_id, user_id, value) values (p_idea, uid, p_value)
  on conflict (idea_id, user_id) do update set value = excluded.value, updated_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.get_board(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  b public.boards;
  c public.board_ctx;
  team boolean;
  ideas jsonb;
  me jsonb;
begin
  select * into b from public.boards where slug = lower(p_slug);
  if b.id is null then return null; end if;
  c := public.board_context(b.id, uid);
  if not public.can_see_board(c, b.visibility) then
    return jsonb_build_object('forbidden', true, 'visibility', b.visibility, 'signed_in', uid is not null,
      'can_request', public.board_takes_requests(b.id) and c.role is distinct from 'blocked',
      'request', (select status from public.board_access_requests where board_id = b.id and user_id = uid and uid is not null
                  and (status = 'pending' or (status = 'rejected' and decided_at > now() - interval '7 days'))
                  order by created_at desc limit 1));
  end if;
  team := coalesce(c.role in ('admin', 'member'), false);

  with scored as (
    select i.id,
           (select coalesce(sum(public.vote_points(value)), 0) from public.votes where idea_id = i.id) as score,
           (select count(*) filter (where value = 'importante') from public.votes where idea_id = i.id) as imp,
           (select count(*) from public.votes where idea_id = i.id) as total,
           i.created_at
    from public.ideas i
    where i.board_id = b.id and i.status in ('pendiente', 'en_revision') and not i.hidden
  ), ranked as (
    select id, row_number() over (order by score desc, imp desc, total desc, created_at asc)::int as rk from scored
  )
  select coalesce(jsonb_agg(public.idea_json(i, uid, team, r.rk) order by i.created_at desc), '[]') into ideas
  from public.ideas i left join ranked r on r.id = i.id
  where i.board_id = b.id and (team or not i.hidden);

  if uid is not null then
    select jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url, 'is_super_admin', p.is_super_admin)
      into me from public.profiles p where p.id = uid;
  end if;

  return jsonb_build_object(
    'board', jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'description', b.description, 'logo_url', b.logo_url,
      'visibility', b.visibility, 'status', b.status, 'color', b.color, 'roadmap_names', b.roadmap_names,
      'team_id', b.team_id, 'team_name', (select name from public.teams where id = b.team_id),
      'account_status', c.account_status, 'locked', c.locked, 'pro', c.pro, 'created_at', b.created_at,
      'invite_code', case when team then b.invite_code end,
      'created_by', b.created_by, 'members_can_create_ideas', b.members_can_create_ideas, 'guests_can_create_ideas', b.guests_can_create_ideas, 'allow_anonymous', b.allow_anonymous, 'use_rating', (public.board_modules(b) ->> 'rating')::boolean, 'use_growth', (public.board_modules(b) ->> 'growth')::boolean,
      'kind', b.kind, 'vote_scale', b.vote_scale,
      'groups', case when team then coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'position', g.position) order by g.position, g.created_at) from public.idea_groups g where g.board_id = b.id), '[]') end, 'modules', public.board_modules(b), 'module_states', public.board_kind_modules(b.kind),
      'guests_can_view_roadmap', public.board_roadmap_public(b.id), 'roadmap_setting', b.guests_can_view_roadmap,
      'takes_requests', public.board_takes_requests(b.id),
      'vote_labels', b.vote_labels,
      'pending_requests', case when public.board_can_manage(b.id, uid) then
        (select count(*) from public.board_access_requests r where r.board_id = b.id and r.status = 'pending'
           and not exists (select 1 from public.board_guests g where g.board_id = b.id and g.user_id = r.user_id)) end,
      'allowed_domains', case when public.board_can_manage(b.id, uid) then to_jsonb(b.allowed_domains) end,
      'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
      'version', b.last_activity_at),
    'role', coalesce(c.role, case when public.is_super_admin() then 'super' end),
    'joined', uid is not null and exists (select 1 from public.board_guests where board_id = b.id and user_id = uid),
    'me', me,
    'perms', jsonb_build_object('can_manage', public.board_can_manage(b.id, uid), 'can_create_ideas', public.board_can_create_idea(b.id, uid)),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'key', k.key) order by k.position, k.created_at)
                            from public.categories k where k.board_id = b.id), '[]'),
    'ideas', ideas
  );
end $function$;

CREATE OR REPLACE FUNCTION public.merge_ideas(p_source bigint, p_target bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not c.pro then raise exception 'Unir ideas está disponible en los planes Pro, Team y Enterprise.'; end if;
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
    values (dst.id, src.author_id, case (select vote_scale from public.boards where id = dst.board_id) when 'cinco' then '5' when 'like' then 'like' else 'importante' end, src.created_at, now())
    on conflict (idea_id, user_id) do nothing;
    author_vote := found;
  end if;

  update public.comments set idea_id = dst.id, merged_from = m where idea_id = src.id;
  get diagnostics moved_comments = row_count;
  update public.idea_merges set votes_moved = (select count(*) from public.votes where idea_id = dst.id) - before_votes, comments_moved = moved_comments where id = m;

  delete from public.notifications where payload ->> 'idea_id' = src.id::text and kind <> 'idea_merged';
  delete from public.ideas where id = src.id;
  -- the main idea keeps its own image; if it has none, it takes the duplicate's
  update public.ideas set updated_at = now(), image_path = coalesce(dst.image_path, src.image_path), group_id = coalesce(dst.group_id, src.group_id) where id = dst.id;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'ideas_merged', 'board', src.board_id, jsonb_build_object('source', src.id, 'target', dst.id, 'votes', moved_votes, 'comments', moved_comments));
  perform public.touch_board(src.board_id);
  return jsonb_build_object('votes_moved', (select votes_moved from public.idea_merges where id = m), 'comments_moved', moved_comments,
                            'author_vote', author_vote, 'notified', notified);
end $function$;

CREATE OR REPLACE FUNCTION public.empty_board(p_board uuid, p_confirm text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  b public.boards;
  ids bigint[];
begin
  select * into b from public.boards where id = p_board;
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  if not coalesce(public.board_can_manage(p_board, uid), false) then
    raise exception 'Solo el Admin del equipo puede vaciar el buzón.' using errcode = '42501';
  end if;
  perform public.writable_board(p_board, uid);
  if trim(coalesce(p_confirm, '')) <> b.name then raise exception 'El nombre no coincide'; end if;

  select coalesce(array_agg(id), '{}') into ids from public.ideas where board_id = p_board;
  delete from public.notifications where payload ->> 'idea_id' = any (select x::text from unnest(ids) x);
  delete from public.idea_merges where board_id = p_board;
  delete from public.ideas where board_id = p_board;
  delete from public.idea_groups where board_id = p_board;
  delete from public.idea_imports where board_id = p_board;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'board_emptied', 'board', p_board, jsonb_build_object('ideas', cardinality(ids)));
  perform public.touch_board(p_board);
  return cardinality(ids);
end $function$;

CREATE OR REPLACE FUNCTION public.export_ideas(p_board uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  b public.boards;
  rows jsonb;
begin
  select * into b from public.boards where id = p_board;
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  if not coalesce(public.board_can_manage(p_board, uid), false) then
    raise exception 'Solo el Admin del equipo puede exportar las ideas.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x.created_at, x.id), '[]') into rows from (
    select i.id, i.title, i.description, c.name as category, i.status, i.origin, i.reject_reason, i.hidden,
           i.imported, i.anonymous, i.ai_generated as ai, i.image_path is not null as has_image, i.requester_name, i.requester_email,
           p.name as author_name, p.email as author_email,
           i.created_at, i.approved_at, i.launched_at,
           (select coalesce(sum(public.vote_points(v.value)), 0) from public.votes v where v.idea_id = i.id) as points,
           (select count(*) from public.votes v where v.idea_id = i.id) as votes_total,
           (select name from public.idea_groups g where g.id = i.group_id) as group_name,
           (select count(*) from public.votes v where v.idea_id = i.id and v.value = 'importante') as importante,
           (select count(*) from public.votes v where v.idea_id = i.id and v.value = 'interesante') as interesante,
           (select count(*) from public.votes v where v.idea_id = i.id and v.value = 'no_importante') as no_importante,
           (select count(*) from public.comments cm where cm.idea_id = i.id and not cm.deleted) as comments,
           nullif(i.impact, 0) as impact, nullif(i.effort, 0) as effort, i.priority, i.rm_col, i.dev_status, i.growth
    from public.ideas i
    join public.categories c on c.id = i.category_id
    left join public.profiles p on p.id = i.author_id
    where i.board_id = p_board
  ) x;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'ideas_exported', 'board', p_board, jsonb_build_object('rows', jsonb_array_length(rows)));
  return jsonb_build_object('board', b.name, 'slug', b.slug, 'roadmap_names', b.roadmap_names, 'ideas', rows);
end $function$;
