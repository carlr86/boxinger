-- Boxinger · MRR y segmentos de clientes (Producto digital y En blanco; Pro, Team y Enterprise)
-- Two optional modules, off by default: the team notes how much MRR the customers asking for each idea represent
-- (in the board's currency) and which customer segments ask for it (a list the Admin edits). Only the team sees them;
-- the Admin can also show them on the cards of the Buzón, the Roadmap and the Matrix.
-- Function bodies start from the production definitions (pg_get_functiondef, 2026-10-21).

alter table public.boards
  add column use_mrr boolean not null default false,
  add column use_segments boolean not null default false,
  add column segments_on_cards boolean not null default false,
  add column mrr_currency text not null default 'USD'
    check (mrr_currency in ('USD', 'ARS', 'EUR', 'BRL', 'MXN', 'CLP', 'COP', 'UYU', 'PEN', 'GBP'));
alter table public.ideas
  add column mrr numeric(14, 2) check (mrr >= 0),
  add column segments uuid[] not null default '{}';

create table public.board_segments (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create unique index board_segments_name_idx on public.board_segments (board_id, lower(name));
alter table public.board_segments enable row level security; -- read through get_board (team only)

CREATE OR REPLACE FUNCTION public.board_kind_modules(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_kind
    when 'brainstorm' then '{"ranking":"optional","backlog":"fixed","rating":"fixed","growth":"off","roadmap":"off","status":"off","changelog":"off","affinity":"fixed","mrr":"off","segments":"off"}'::jsonb
    when 'blank' then '{"ranking":"optional","backlog":"optional","rating":"optional","growth":"optional","roadmap":"optional","status":"optional","changelog":"optional","affinity":"off","mrr":"optional","segments":"optional"}'::jsonb
    else '{"ranking":"fixed","backlog":"fixed","rating":"optional","growth":"optional","roadmap":"fixed","status":"fixed","changelog":"fixed","affinity":"off","mrr":"optional","segments":"optional"}'::jsonb
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.board_modules(b boards)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_object_agg(k, case s when 'fixed' then true when 'off' then false else
    case k when 'ranking' then b.use_ranking when 'backlog' then b.use_backlog when 'rating' then b.use_rating
           when 'growth' then b.use_growth when 'roadmap' then b.use_roadmap when 'status' then b.use_status
           when 'changelog' then b.use_changelog when 'affinity' then b.use_affinity
           when 'mrr' then b.use_mrr when 'segments' then b.use_segments end end)
  from jsonb_each_text(public.board_kind_modules(b.kind)) as x(k, s);
$function$
;

-- p_mrr / p_segments: the new optional modules (paid plans); p_cards: show them on the cards too.
drop function public.set_board_features(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
create or replace function public.set_board_features(p_board uuid, p_rating boolean default null, p_growth boolean default null,
  p_ranking boolean default null, p_backlog boolean default null, p_roadmap boolean default null, p_status boolean default null,
  p_changelog boolean default null, p_mrr boolean default null, p_segments boolean default null, p_cards boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.boards;
  st jsonb;
  k text;
  v boolean;
  es boolean;
begin
  perform public.require_board_admin(p_board);
  select * into b from public.boards where id = p_board;
  st := public.board_kind_modules(b.kind);
  for k, v in select * from (values ('rating', p_rating), ('growth', p_growth), ('ranking', p_ranking), ('backlog', p_backlog),
                                    ('roadmap', p_roadmap), ('status', p_status), ('changelog', p_changelog),
                                    ('mrr', p_mrr), ('segments', p_segments)) x(k, v) where x.v is not null loop
    if st ->> k = 'fixed' then raise exception 'Ese módulo viene incluido en este tipo de buzón y no se puede apagar.'; end if;
    if st ->> k = 'off' then raise exception 'Ese módulo no está disponible en este tipo de buzón.'; end if;
  end loop;
  if (coalesce(p_mrr, false) or coalesce(p_segments, false)) and not (public.board_context(p_board, auth.uid())).pro then
    raise exception 'MRR y segmentos de clientes están disponibles en los planes Pro, Team y Enterprise.';
  end if;
  update public.boards set
    use_rating = coalesce(p_rating, use_rating), use_growth = coalesce(p_growth, use_growth),
    use_ranking = coalesce(p_ranking, use_ranking), use_backlog = coalesce(p_backlog, use_backlog),
    use_roadmap = coalesce(p_roadmap, use_roadmap), use_status = coalesce(p_status, use_status),
    use_changelog = coalesce(p_changelog, use_changelog),
    use_mrr = coalesce(p_mrr, use_mrr), use_segments = coalesce(p_segments, use_segments),
    segments_on_cards = coalesce(p_cards, segments_on_cards)
  where id = p_board;
  -- The first time segments are turned on, the board gets a starting list (in the Admin's language) to edit.
  if p_segments and not exists (select 1 from public.board_segments where board_id = p_board) then
    es := coalesce((select locale from public.profiles where id = auth.uid()), 'es') <> 'en';
    insert into public.board_segments (board_id, name, position)
    select p_board, n, o - 1 from unnest(case when es then array['Startup', 'Small Business', 'Mediana empresa', 'Gran empresa', 'BPO']
                                         else array['Startup', 'Small business', 'Mid-size company', 'Large company', 'BPO'] end) with ordinality x(n, o);
  end if;
  perform public.touch_board(p_board);
end $$;
grant execute on function public.set_board_features(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.set_mrr_currency(p_board uuid, p_currency text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_board_admin(p_board);
  if p_currency not in ('USD', 'ARS', 'EUR', 'BRL', 'MXN', 'CLP', 'COP', 'UYU', 'PEN', 'GBP') then raise exception 'Moneda inválida.'; end if;
  update public.boards set mrr_currency = p_currency where id = p_board;
  perform public.touch_board(p_board);
end $$;
grant execute on function public.set_mrr_currency(uuid, text) to authenticated;

-- The segment list: the board's Admin, on a paid plan. Up to 12, like categories.
create or replace function public.require_segments_admin(p_board uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_board_admin(p_board);
  perform public.writable_board(p_board, auth.uid());
  if not (public.board_context(p_board, auth.uid())).pro then
    raise exception 'MRR y segmentos de clientes están disponibles en los planes Pro, Team y Enterprise.';
  end if;
end $$;
revoke execute on function public.require_segments_admin(uuid) from public, anon, authenticated;

create or replace function public.add_segment(p_board uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  n text := trim(coalesce(p_name, ''));
  new_id uuid;
begin
  perform public.require_segments_admin(p_board);
  if n = '' then raise exception 'Escribí un nombre'; end if;
  if char_length(n) > 40 then raise exception 'Máximo 40 caracteres'; end if;
  if exists (select 1 from public.board_segments where board_id = p_board and lower(name) = lower(n)) then raise exception 'Ya existe un segmento con ese nombre'; end if;
  if (select count(*) from public.board_segments where board_id = p_board) >= 12 then raise exception 'Máximo 12 segmentos'; end if;
  insert into public.board_segments (board_id, name, position)
  values (p_board, n, coalesce((select max(position) + 1 from public.board_segments where board_id = p_board), 0))
  returning id into new_id;
  perform public.touch_board(p_board);
  return new_id;
end $$;
grant execute on function public.add_segment(uuid, text) to authenticated;

create or replace function public.rename_segment(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.board_segments;
  n text := trim(coalesce(p_name, ''));
begin
  select * into s from public.board_segments where id = p_id;
  if s.id is null then raise exception 'El segmento no existe.'; end if;
  perform public.require_segments_admin(s.board_id);
  if n = '' then raise exception 'Escribí un nombre'; end if;
  if char_length(n) > 40 then raise exception 'Máximo 40 caracteres'; end if;
  if exists (select 1 from public.board_segments where board_id = s.board_id and lower(name) = lower(n) and id <> p_id) then raise exception 'Ya existe un segmento con ese nombre'; end if;
  update public.board_segments set name = n where id = p_id;
  perform public.touch_board(s.board_id);
end $$;
grant execute on function public.rename_segment(uuid, text) to authenticated;

-- Deleting a segment takes it off the ideas that had it. Returns how many ideas had it.
create or replace function public.delete_segment(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  s public.board_segments;
  n int;
begin
  select * into s from public.board_segments where id = p_id;
  if s.id is null then raise exception 'El segmento no existe.'; end if;
  perform public.require_segments_admin(s.board_id);
  update public.ideas set segments = array_remove(segments, p_id) where board_id = s.board_id and p_id = any (segments);
  get diagnostics n = row_count;
  delete from public.board_segments where id = p_id;
  perform public.touch_board(s.board_id);
  return n;
end $$;
grant execute on function public.delete_segment(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.update_idea_plan(p_id bigint, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i public.ideas;
  c public.board_ctx;
  new_dev text;
  new_growth text[];
  new_seg uuid[];
  new_mrr numeric;
begin
  select * into i from public.ideas where id = p_id for update;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  c := public.require_team(i.board_id);
  if not c.pro then raise exception 'Disponible en el plan Pro.'; end if;
  new_dev := coalesce(p_patch ->> 'dev_status', i.dev_status);
  if new_dev not in ('por_empezar', 'en_curso', 'lanzada') then raise exception 'Estado de desarrollo inválido.'; end if;
  if p_patch ? 'priority' and nullif(p_patch ->> 'priority', '') not in ('alta', 'media', 'baja') then raise exception 'Prioridad inválida.'; end if;
  if p_patch ? 'growth' then
    if jsonb_typeof(p_patch -> 'growth') <> 'array' then raise exception 'Growth inválido.'; end if;
    new_growth := array(select distinct g from jsonb_array_elements_text(p_patch -> 'growth') g order by 1);
    if not new_growth <@ array['adquisicion', 'activacion', 'retencion', 'monetizacion', 'churn'] then raise exception 'Growth inválido.'; end if;
  end if;
  if p_patch ? 'segments' then
    if jsonb_typeof(p_patch -> 'segments') <> 'array' then raise exception 'Segmentos inválidos.'; end if;
    if exists (select 1 from jsonb_array_elements_text(p_patch -> 'segments') x
               where x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  or not exists (select 1 from public.board_segments s where s.id = x::uuid and s.board_id = i.board_id)) then
      raise exception 'Segmentos inválidos.';
    end if;
    new_seg := array(select distinct x::uuid from jsonb_array_elements_text(p_patch -> 'segments') x);
  end if;
  if p_patch ? 'mrr' then
    if jsonb_typeof(p_patch -> 'mrr') not in ('number', 'null') then raise exception 'Escribí el MRR con números.'; end if;
    new_mrr := round((p_patch ->> 'mrr')::numeric, 2);
    if new_mrr < 0 then raise exception 'El MRR no puede ser negativo.'; end if;
    if new_mrr >= 1e12 then raise exception 'El MRR es demasiado grande.'; end if;
  end if;

  update public.ideas set
    impact = coalesce((p_patch ->> 'impact')::smallint, impact),
    effort = coalesce((p_patch ->> 'effort')::smallint, effort),
    priority = case when p_patch ? 'priority' then nullif(p_patch ->> 'priority', '') else priority end,
    chk_design = coalesce((p_patch ->> 'chk_design')::boolean, chk_design),
    chk_prd = coalesce((p_patch ->> 'chk_prd')::boolean, chk_prd),
    growth = case when p_patch ? 'growth' then new_growth else growth end,
    segments = case when p_patch ? 'segments' then new_seg else segments end,
    mrr = case when p_patch ? 'mrr' then new_mrr else mrr end,
    dev_status = new_dev,
    dev_at = case when new_dev <> i.dev_status then now() else dev_at end,
    launched_at = case when new_dev = 'lanzada' then coalesce(case when i.dev_status = 'lanzada' then launched_at end, now()) else null end,
    updated_at = now()
  where id = p_id;

  if new_dev = 'lanzada' and i.dev_status <> 'lanzada' then
    perform public.notify_idea_step(p_id, 'launch', 'idea_launched');
    perform public.notify_board_update(p_id);
  end if;
end $function$
;

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
    'mrr', i.mrr, 'segments', to_jsonb(i.segments),
    'requester_name', i.requester_name, 'requester_email', i.requester_email, 'source', i.source, 'archived', i.archived_at is not null)
    when public.board_roadmap_public(i.board_id) then jsonb_build_object(
    'rm_col', i.rm_col, 'rm_order', i.rm_order, 'dev_status', i.dev_status, 'launched_at', i.launched_at)
    else '{}'::jsonb end
  from v, h;
$function$
;

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
      'kind', b.kind, 'vote_scale', b.vote_scale, 'mrr_currency', b.mrr_currency, 'segments_on_cards', b.segments_on_cards,
      'segments', case when team then coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.position, s.created_at) from public.board_segments s where s.board_id = b.id), '[]') end,
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
end $function$
;

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
  -- the main idea keeps its own image and MRR; if it has none, it takes the duplicate's. Segments add up.
  update public.ideas set updated_at = now(), image_path = coalesce(dst.image_path, src.image_path), group_id = coalesce(dst.group_id, src.group_id),
    mrr = coalesce(dst.mrr, src.mrr), segments = array(select distinct x from unnest(dst.segments || src.segments) x)
  where id = dst.id;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'ideas_merged', 'board', src.board_id, jsonb_build_object('source', src.id, 'target', dst.id, 'votes', moved_votes, 'comments', moved_comments));
  perform public.touch_board(src.board_id);
  return jsonb_build_object('votes_moved', (select votes_moved from public.idea_merges where id = m), 'comments_moved', moved_comments,
                            'author_vote', author_vote, 'notified', notified);
end $function$
;

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
           nullif(i.impact, 0) as impact, nullif(i.effort, 0) as effort, i.priority, i.rm_col, i.dev_status, i.growth,
           i.mrr, (select string_agg(s.name, ', ' order by s.position, s.created_at) from public.board_segments s where s.id = any (i.segments)) as segments
    from public.ideas i
    join public.categories c on c.id = i.category_id
    left join public.profiles p on p.id = i.author_id
    where i.board_id = p_board
  ) x;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'ideas_exported', 'board', p_board, jsonb_build_object('rows', jsonb_array_length(rows)));
  return jsonb_build_object('board', b.name, 'slug', b.slug, 'roadmap_names', b.roadmap_names, 'mrr_currency', b.mrr_currency, 'ideas', rows);
end $function$
;
