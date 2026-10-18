-- Boxinger · Board kinds (categories › types) and modules
-- A board is created «en blanco» (blank: the Admin turns modules on) or from a type, chosen once and never changed.
-- Each type marks every module as 'fixed' (always on, can't be turned off), 'optional' (the Admin decides) or 'off'
-- (not available). Every board that exists today becomes «Producto digital» and looks exactly the same.
-- Function bodies start from the production definitions (pg_get_functiondef, 2026-10-18).

alter table public.boards add column kind text not null default 'producto' check (kind in ('producto', 'brainstorm', 'blank'));
alter table public.boards
  add column use_ranking boolean not null default true,
  add column use_backlog boolean not null default true,
  add column use_roadmap boolean not null default true,
  add column use_status boolean not null default true,
  add column use_changelog boolean not null default true,
  add column use_affinity boolean not null default false;

-- The one source of truth: what each type does with each module.
create or replace function public.board_kind_modules(p_kind text)
returns jsonb language sql immutable set search_path = public as $$
  select case p_kind
    when 'brainstorm' then '{"ranking":"optional","backlog":"fixed","rating":"fixed","growth":"off","roadmap":"off","status":"off","changelog":"off","affinity":"fixed"}'::jsonb
    when 'blank' then '{"ranking":"optional","backlog":"optional","rating":"optional","growth":"optional","roadmap":"optional","status":"optional","changelog":"optional","affinity":"off"}'::jsonb
    else '{"ranking":"fixed","backlog":"fixed","rating":"optional","growth":"optional","roadmap":"fixed","status":"fixed","changelog":"fixed","affinity":"off"}'::jsonb
  end;
$$;
grant execute on function public.board_kind_modules(text) to anon, authenticated;

-- The modules a board actually shows: fixed → on, off → off, optional → what the Admin chose.
create or replace function public.board_modules(b public.boards)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_object_agg(k, case s when 'fixed' then true when 'off' then false else
    case k when 'ranking' then b.use_ranking when 'backlog' then b.use_backlog when 'rating' then b.use_rating
           when 'growth' then b.use_growth when 'roadmap' then b.use_roadmap when 'status' then b.use_status
           when 'changelog' then b.use_changelog when 'affinity' then b.use_affinity end end)
  from jsonb_each_text(public.board_kind_modules(b.kind)) as x(k, s);
$$;
revoke execute on function public.board_modules(public.boards) from public, anon, authenticated;

-- Which types can be chosen (the rest are «Próximamente» in the app) and on which plan.
create or replace function public.check_board_kind(p_kind text, p_pro boolean)
returns void language plpgsql immutable set search_path = public as $$
begin
  if p_kind not in ('producto', 'brainstorm', 'blank') then raise exception 'Ese tipo de buzón todavía no está disponible.'; end if;
  if p_kind = 'brainstorm' and not p_pro then raise exception 'Los buzones de Brainstorming están disponibles en los planes Pro, Team y Enterprise.'; end if;
end $$;
revoke execute on function public.check_board_kind(text, boolean) from public, anon, authenticated;

-- Sets a new board's type and its starting options. Blank boards start with only the Buzón and Ranking.
create or replace function public.apply_board_kind(p_board uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.boards set kind = p_kind,
    use_ranking = true,
    use_backlog = p_kind <> 'blank', use_rating = p_kind <> 'blank', use_growth = p_kind = 'producto',
    use_roadmap = p_kind = 'producto', use_status = p_kind = 'producto', use_changelog = p_kind = 'producto',
    use_affinity = p_kind = 'brainstorm',
    allow_anonymous = true
  where id = p_board;
end $$;
revoke execute on function public.apply_board_kind(uuid, text) from public, anon, authenticated;

-- The Admin turns optional modules on or off; fixed and unavailable ones can't change. Null leaves a module as it is.
drop function public.set_board_features(uuid, boolean, boolean);
create or replace function public.set_board_features(p_board uuid, p_rating boolean default null, p_growth boolean default null,
  p_ranking boolean default null, p_backlog boolean default null, p_roadmap boolean default null, p_status boolean default null, p_changelog boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.boards;
  st jsonb;
  k text;
  v boolean;
begin
  perform public.require_board_admin(p_board);
  select * into b from public.boards where id = p_board;
  st := public.board_kind_modules(b.kind);
  for k, v in select * from (values ('rating', p_rating), ('growth', p_growth), ('ranking', p_ranking), ('backlog', p_backlog),
                                    ('roadmap', p_roadmap), ('status', p_status), ('changelog', p_changelog)) x(k, v) where x.v is not null loop
    if st ->> k = 'fixed' then raise exception 'Ese módulo viene incluido en este tipo de buzón y no se puede apagar.'; end if;
    if st ->> k = 'off' then raise exception 'Ese módulo no está disponible en este tipo de buzón.'; end if;
  end loop;
  update public.boards set
    use_rating = coalesce(p_rating, use_rating), use_growth = coalesce(p_growth, use_growth),
    use_ranking = coalesce(p_ranking, use_ranking), use_backlog = coalesce(p_backlog, use_backlog),
    use_roadmap = coalesce(p_roadmap, use_roadmap), use_status = coalesce(p_status, use_status),
    use_changelog = coalesce(p_changelog, use_changelog)
  where id = p_board;
end $$;
grant execute on function public.set_board_features(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

drop function public.create_board(uuid, text, text, boolean, boolean);
drop function public.onboard(text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_board(p_team uuid, p_name text, p_visibility text DEFAULT 'public'::text, p_members_ideas boolean DEFAULT true, p_guests_ideas boolean DEFAULT true, p_kind text DEFAULT 'producto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  acc public.accounts;
  t public.teams;
  tm public.team_members;
  pro boolean;
  n text := trim(coalesce(p_name, ''));
  b public.boards;
begin
  select * into t from public.teams where id = p_team;
  if t.id is null then raise exception 'El equipo no existe.'; end if;
  select * into acc from public.accounts where id = t.account_id;
  if acc.status <> 'active' then raise exception 'La cuenta está suspendida.'; end if;
  pro := public.account_is_pro(acc.id);
  select * into tm from public.team_members where team_id = p_team and user_id = uid;
  if acc.owner_id <> uid and coalesce(tm.role, '') <> 'admin'
     and not (tm.role = 'member' and t.members_can_create_boards and pro) then
    raise exception 'Solo el Admin del equipo puede crear buzones en este equipo.' using errcode = '42501';
  end if;
  if n = '' then raise exception 'El nombre es obligatorio'; end if;
  if char_length(n) > 60 then raise exception 'Máximo 60 caracteres'; end if;
  if p_visibility not in ('public', 'invite', 'private') then raise exception 'Visibilidad inválida.'; end if;
  perform public.check_board_kind(coalesce(p_kind, 'producto'), pro);
  if not pro and exists (select 1 from public.boards x join public.teams t2 on t2.id = x.team_id where t2.account_id = acc.id) then
    raise exception 'En Free tenés 1 buzón. Pasá a Pro para crear más.';
  end if;
  if not pro and p_visibility = 'private' then raise exception 'Los buzones privados están disponibles en Pro.'; end if;
  b := public.new_board(p_team, n, p_visibility, 'Buzón nuevo. Editá la descripción desde Configuración.');
  update public.boards set created_by = uid, members_can_create_ideas = coalesce(p_members_ideas, true),
                           guests_can_create_ideas = coalesce(p_guests_ideas, true)
  where id = b.id;
  perform public.apply_board_kind(b.id, coalesce(p_kind, 'producto'));
  -- a member always sees the board they created, even without access to all boards
  if tm.role = 'member' then
    insert into public.board_member_access (board_id, user_id, has_access) values (b.id, uid, true)
    on conflict (board_id, user_id) do update set has_access = true;
  end if;
  return jsonb_build_object('id', b.id, 'slug', b.slug);
end $function$;

CREATE OR REPLACE FUNCTION public.onboard(p_team_name text, p_board_name text, p_visibility text DEFAULT 'public'::text, p_description text DEFAULT ''::text, p_kind text DEFAULT 'producto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  acc public.accounts;
  tm public.teams;
  b public.boards;
  tn text := trim(coalesce(p_team_name, ''));
  bn text := trim(coalesce(nullif(trim(p_board_name), ''), p_team_name));
begin
  if tn = '' or char_length(tn) > 60 then raise exception 'El nombre del equipo es obligatorio (máx. 60 caracteres)'; end if;
  if bn = '' or char_length(bn) > 60 then raise exception 'El nombre del buzón es obligatorio (máx. 60 caracteres)'; end if;
  select * into acc from public.accounts where owner_id = uid;
  if acc.id is not null and exists (select 1 from public.teams where account_id = acc.id) then
    raise exception 'Ya tenés un equipo. Creá nuevos buzones desde Mis Buzones.';
  end if;
  if acc.id is null then
    insert into public.accounts (owner_id, name) values (uid, tn) returning * into acc;
    insert into public.subscriptions (account_id, currency, list_amount) values (acc.id, 'USD', public.current_price('USD'));
  end if;
  if p_visibility = 'private' and not public.account_is_pro(acc.id) then raise exception 'Los buzones privados están disponibles en Pro.'; end if;
  perform public.check_board_kind(coalesce(p_kind, 'producto'), public.account_is_pro(acc.id));
  insert into public.teams (account_id, name) values (acc.id, tn) returning * into tm;
  insert into public.team_members (team_id, user_id, role) values (tm.id, uid, 'admin');
  b := public.new_board(tm.id, bn, coalesce(p_visibility, 'public'), p_description);
  update public.teams set color = b.color where id = tm.id;
  perform public.apply_board_kind(b.id, coalesce(p_kind, 'producto'));
  return jsonb_build_object('team_id', tm.id, 'board_id', b.id, 'slug', b.slug);
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
      'created_by', b.created_by, 'members_can_create_ideas', b.members_can_create_ideas, 'guests_can_create_ideas', b.guests_can_create_ideas, 'allow_anonymous', b.allow_anonymous, 'use_rating', (public.board_modules(b) ->> 'rating')::boolean, 'use_growth', (public.board_modules(b) ->> 'growth')::boolean,
      'kind', b.kind, 'modules', public.board_modules(b), 'module_states', public.board_kind_modules(b.kind),
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

grant execute on function public.create_board(uuid, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.onboard(text, text, text, text, text) to authenticated;
