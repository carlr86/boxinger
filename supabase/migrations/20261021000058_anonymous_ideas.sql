-- Boxinger · Anonymous ideas (every plan)
-- Whoever posts an idea (with a validated account, as always) can ask to show it as «Anónimo». Only whoever manages
-- the board (the team Admin) and the author see who it is; everyone else, team members included, sees «Anónimo».
-- The real author_id is kept, so the author still gets every email about the idea and still can't vote for it.
-- The author's own comments on that idea are anonymous too. Each board can turn it off (boards.allow_anonymous).
-- Function bodies below start from the production definitions (pg_get_functiondef, 2026-10-18).

alter table public.ideas add column anonymous boolean not null default false;
alter table public.boards add column allow_anonymous boolean not null default true;
alter table public.idea_merges add column source_anonymous boolean not null default false;

-- True when p_viewer must not see who wrote idea i.
create or replace function public.author_hidden(i public.ideas, p_viewer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select i.anonymous and i.author_id is distinct from p_viewer and not coalesce(public.board_can_manage(i.board_id, p_viewer), false);
$$;
revoke execute on function public.author_hidden(public.ideas, uuid) from public, anon, authenticated;

-- The board's Admin turns anonymous ideas on or off (every plan).
create or replace function public.set_board_allow_anonymous(p_board uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_board_admin(p_board);
  update public.boards set allow_anonymous = coalesce(p_on, true) where id = p_board;
end $$;
grant execute on function public.set_board_allow_anonymous(uuid, boolean) to authenticated;

-- The author (or whoever manages the board) shows or hides the author's name on an idea.
create or replace function public.set_idea_anonymous(p_id bigint, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  i public.ideas;
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  if i.author_id is distinct from uid and not coalesce(public.board_can_manage(i.board_id, uid), false) then
    raise exception 'Solo quien propuso la idea puede cambiar esto.' using errcode = '42501';
  end if;
  if p_on and not i.anonymous and not (select allow_anonymous from public.boards where id = i.board_id) then
    raise exception 'Este buzón no permite ideas anónimas.';
  end if;
  update public.ideas set anonymous = coalesce(p_on, false), updated_at = now() where id = p_id;
end $$;
grant execute on function public.set_idea_anonymous(bigint, boolean) to authenticated;

-- create_idea gets p_anonymous (default false keeps every existing call working).
drop function public.create_idea(uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_idea(p_board uuid, p_title text, p_description text, p_category uuid, p_anonymous boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.board_ctx := public.participate(p_board);
  uid uuid := auth.uid();
  t text := trim(coalesce(p_title, ''));
  d text := trim(coalesce(p_description, ''));
  n int;
  new_id bigint;
  b public.boards;
  admin_id uuid;
  who text;
begin
  if not public.board_can_create_idea(p_board, uid) then
    if c.role = 'member' then raise exception 'En este buzón el Admin no habilitó la carga de ideas para los miembros.'; end if;
    raise exception 'En este buzón solo el Equipo carga ideas. Podés votar y comentar.';
  end if;
  if char_length(t) not between 5 and 80 then raise exception 'El título debe tener entre 5 y 80 caracteres'; end if;
  if char_length(d) not between 20 and 2000 then raise exception 'La descripción debe tener entre 20 y 2.000 caracteres'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = p_board) then raise exception 'Elegí una categoría'; end if;
  if coalesce(p_anonymous, false) and not (select allow_anonymous from public.boards where id = p_board) then raise exception 'Este buzón no permite ideas anónimas.'; end if;
  select count(*) into n from public.ideas where author_id = uid and created_at > now() - interval '10 minutes';
  perform public.rate_limit('ideas', n, 5);
  insert into public.ideas (board_id, author_id, origin, title, description, category_id, anonymous)
  values (p_board, uid, case when c.role in ('admin', 'member') then 'equipo' else 'comunidad' end, t, d, p_category, coalesce(p_anonymous, false))
  returning id into new_id;

  -- In-app notice (no email) to whoever manages the board, except the author.
  select * into b from public.boards where id = p_board;
  select name into who from public.profiles where id = uid;
  for admin_id in
    select distinct x.id from (
      select a.owner_id as id from public.teams tm join public.accounts a on a.id = tm.account_id where tm.id = b.team_id
      union select m.user_id from public.team_members m where m.team_id = b.team_id and m.role = 'admin'
      union select b.created_by
    ) x where x.id is not null and x.id <> uid and public.board_can_manage(p_board, x.id)
  loop
    insert into public.notifications (user_id, kind, payload, dedupe_key)
    values (admin_id, 'new_idea', jsonb_build_object('idea_id', new_id, 'title', t, 'board_name', b.name, 'slug', b.slug, 'author', who, 'anonymous', coalesce(p_anonymous, false),
              'origin', case when c.role in ('admin', 'member') then 'equipo' else 'comunidad' end),
            'n:new_idea:' || new_id || ':' || admin_id)
    on conflict (dedupe_key) do nothing;
  end loop;
  return new_id;
end $function$
;;
grant execute on function public.create_idea(uuid, text, text, uuid, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.idea_json(i ideas, p_uid uuid, p_team boolean, p_rank integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with v as (
    select count(*) filter (where value = 'importante') as imp,
           count(*) filter (where value = 'interesante') as inte,
           count(*) filter (where value = 'no_importante') as noimp
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
    'votes', v.imp + v.inte + v.noimp,
    'comments', (select count(*) from public.comments c
                 where c.idea_id = i.id and (not c.deleted or exists (select 1 from public.comment_replies r where r.comment_id = c.id))
                   and (p_team or not c.hidden)),
    'my_vote', (select value from public.votes where idea_id = i.id and user_id = p_uid),
    'rank', p_rank,
    'launched_at', case when i.dev_status = 'lanzada' then i.launched_at end
  ) || case when p_team then jsonb_build_object(
    'importante', v.imp, 'interesante', v.inte, 'no_importante', v.noimp, 'score', 2 * v.imp + v.inte,
    'impact', i.impact, 'effort', i.effort, 'rm_col', i.rm_col, 'rm_order', i.rm_order, 'priority', i.priority,
    'dev_status', i.dev_status, 'dev_at', i.dev_at, 'launched_at', i.launched_at,
    'chk_design', i.chk_design, 'chk_prd', i.chk_prd, 'growth', to_jsonb(i.growth),
    'requester_name', i.requester_name, 'requester_email', i.requester_email, 'source', i.source, 'archived', i.archived_at is not null)
    when public.board_roadmap_public(i.board_id) then jsonb_build_object(
    'rm_col', i.rm_col, 'rm_order', i.rm_order, 'dev_status', i.dev_status, 'launched_at', i.launched_at)
    else '{}'::jsonb end
  from v, h;
$function$
;;

CREATE OR REPLACE FUNCTION public.get_idea(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  i public.ideas;
  b public.boards;
  c public.board_ctx;
  team boolean;
  comments jsonb;
  hide boolean;
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

  hide := public.author_hidden(i, uid);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', cm.id,
      'author_id', case when (hide and cm.author_id = i.author_id or exists (select 1 from public.idea_merges mg where mg.id = cm.merged_from and mg.source_anonymous and mg.source_author_id = cm.author_id and mg.source_author_id is distinct from uid and not coalesce(public.board_can_manage(i.board_id, uid), false))) then null else cm.author_id end,
      'author_name', case when cm.deleted then 'Comentario eliminado' when (hide and cm.author_id = i.author_id or exists (select 1 from public.idea_merges mg where mg.id = cm.merged_from and mg.source_anonymous and mg.source_author_id = cm.author_id and mg.source_author_id is distinct from uid and not coalesce(public.board_can_manage(i.board_id, uid), false))) then 'Anónimo (autor de la idea)' else coalesce(pa.name, 'Usuario eliminado') end,
      'author_avatar', case when (hide and cm.author_id = i.author_id or exists (select 1 from public.idea_merges mg where mg.id = cm.merged_from and mg.source_anonymous and mg.source_author_id = cm.author_id and mg.source_author_id is distinct from uid and not coalesce(public.board_can_manage(i.board_id, uid), false))) then null else pa.avatar_url end,
      'author_team', case when (hide and cm.author_id = i.author_id or exists (select 1 from public.idea_merges mg where mg.id = cm.merged_from and mg.source_anonymous and mg.source_author_id = cm.author_id and mg.source_author_id is distinct from uid and not coalesce(public.board_can_manage(i.board_id, uid), false))) then false else coalesce((public.board_context(i.board_id, cm.author_id)).role in ('admin', 'member'), false) end,
      'author_anonymous', i.anonymous and cm.author_id = i.author_id,
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
               'author_name', case when mg.source_anonymous and mg.source_author_id is distinct from uid and not coalesce(public.board_can_manage(i.board_id, uid), false) then 'Anónimo' else coalesce(p.name, 'Usuario eliminado') end, 'anonymous', mg.source_anonymous, 'created_at', mg.source_created_at, 'merged_at', mg.merged_at)
             order by mg.merged_at)
      from public.idea_merges mg left join public.profiles p on p.id = mg.source_author_id
      where mg.target_id = i.id), '[]'),
    'history', case when team then coalesce((
      select jsonb_agg(jsonb_build_object('from', s.from_status, 'to', s.to_status, 'at', s.created_at, 'reason', s.reason) order by s.created_at)
      from public.status_changes s where s.idea_id = i.id), '[]') end
  );
end $function$
;;

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
end $function$
;;

CREATE OR REPLACE FUNCTION public.slack_notice_data(p_ids bigint[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(i.id, jsonb_build_object(
    'title', i.title, 'description', i.description, 'origin', i.origin, 'source', i.source, 'hidden', i.hidden,
    'category', (select name from public.categories where id = i.category_id),
    'author', case when i.anonymous then 'Anónimo' else coalesce((select name from public.profiles where id = i.author_id), i.requester_name, i.requester_email) end,
    'votes', (select count(*) from public.votes where idea_id = i.id),
    'importante', (select count(*) from public.votes where idea_id = i.id and value = 'importante'))), '{}')
  from public.ideas i where i.id = any (p_ids);
$function$
;;

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
           (select 2 * count(*) filter (where value = 'importante') + count(*) filter (where value = 'interesante') from public.votes where idea_id = i.id) as score,
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
      'created_by', b.created_by, 'members_can_create_ideas', b.members_can_create_ideas, 'guests_can_create_ideas', b.guests_can_create_ideas, 'allow_anonymous', b.allow_anonymous,
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
end $function$
;;

-- merge_ideas keeps whether the merged idea was anonymous, so «Ideas unidas» doesn't reveal its author.
create or replace function public.idea_merges_anonymous()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.source_anonymous := coalesce((select anonymous from public.ideas where id = new.source_id), false);
  return new;
end $$;
create trigger idea_merges_anonymous before insert on public.idea_merges for each row execute function public.idea_merges_anonymous();

-- Daily comment digest (goes to the whole team): the anonymous author's comments on their own idea stay anonymous.
create or replace function public.digest_candidates(p_since timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select jsonb_build_object(
      'board_id', b.id, 'board_name', b.name, 'slug', b.slug,
      'comments', (select jsonb_agg(jsonb_build_object('idea_id', i.id, 'title', i.title,
                     'author', case when i.anonymous and c.author_id = i.author_id then 'Anónimo (autor de la idea)' else coalesce(p.name, 'Usuario eliminado') end,
                     'excerpt', left(c.body, 200)) order by c.created_at)
                   from public.comments c join public.ideas i on i.id = c.idea_id left join public.profiles p on p.id = c.author_id
                   where i.board_id = b.id and c.created_at >= p_since and not c.deleted),
      'recipients', (select coalesce(jsonb_agg(distinct u.id), '[]') from public.profiles u
                     where coalesce((u.notif ->> 'digest')::boolean, true) and u.status = 'active'
                       and (public.board_context(b.id, u.id)).role in ('admin', 'member')
                       and (u.id = a.owner_id or exists (select 1 from public.team_members m where m.team_id = b.team_id and m.user_id = u.id)))
    ) as x
    from public.boards b join public.teams t on t.id = b.team_id join public.accounts a on a.id = t.account_id
    where b.status = 'active' and a.status = 'active'
      and exists (select 1 from public.comments c join public.ideas i on i.id = c.idea_id where i.board_id = b.id and c.created_at >= p_since and not c.deleted)
  ) y;
$$;
revoke execute on function public.digest_candidates(timestamptz) from public, anon, authenticated;
