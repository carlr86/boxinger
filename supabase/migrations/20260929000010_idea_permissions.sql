-- Boxinger · who can create ideas (per board) and whether members can create boards (per team)
--
-- boards.members_can_create_ideas / guests_can_create_ideas: the team owner and the board's creator
--   can always create ideas; members and Invitados only when enabled (Invitados only on public boards).
-- teams.members_can_create_boards: members may create boards in that team (Pro). A member who creates
--   a board can configure it (name, logo, categories, visibility, idea permissions); deleting it and
--   managing other members' access stay with the team owner.

alter table public.boards
  add column created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  add column members_can_create_ideas boolean not null default true,
  add column guests_can_create_ideas boolean not null default true;
alter table public.teams add column members_can_create_boards boolean not null default false;

update public.boards b set created_by = a.owner_id
from public.teams t join public.accounts a on a.id = t.account_id
where t.id = b.team_id and b.created_by is null;

-- ───────────────────────── permission helpers ─────────────────────────
create or replace function public.board_can_manage(p_board uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((c).role = 'admin' or ((c).role = 'member' and b.created_by = p_uid), false)
  from public.boards b cross join lateral (select public.board_context(b.id, p_uid) as c) x
  where b.id = p_board;
$$;

create or replace function public.board_can_create_idea(p_board uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(case
    when (c).role = 'admin' then true
    when (c).role = 'member' then b.members_can_create_ideas or b.created_by = p_uid
    when (c).role = 'blocked' then false
    else b.guests_can_create_ideas and b.visibility = 'public'   -- Invitado, or someone who would join as one
  end, false)
  from public.boards b cross join lateral (select public.board_context(b.id, p_uid) as c) x
  where b.id = p_board;
$$;

-- Board settings: team owner, or the member who created the board.
create or replace function public.require_board_admin(p_board uuid)
returns public.board_ctx language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  c public.board_ctx := public.board_context(p_board, uid);
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if not public.board_can_manage(p_board, uid) then raise exception 'Solo el Admin del equipo puede hacer esto.' using errcode = '42501'; end if;
  return c;
end $$;

-- These two stay with the team owner only.
create or replace function public.set_board_access(p_board uuid, p_user uuid, p_has boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.board_ctx := public.require_board_admin(p_board);
begin
  if c.role <> 'admin' then raise exception 'Solo el Admin del equipo puede gestionar el acceso de los miembros.' using errcode = '42501'; end if;
  if not c.pro then raise exception 'Sumar miembros al equipo está disponible en Pro'; end if;
  if not exists (select 1 from public.team_members where team_id = c.team_id and user_id = p_user and role = 'member') then
    raise exception 'La persona no es miembro del equipo.';
  end if;
  insert into public.board_member_access (board_id, user_id, has_access) values (p_board, p_user, p_has)
  on conflict (board_id, user_id) do update set has_access = excluded.has_access;
end $$;

create or replace function public.delete_board(p_board uuid, p_confirm text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_board_admin(p_board);
  b public.boards;
begin
  if c.role <> 'admin' then raise exception 'Solo el Admin del equipo puede eliminar buzones.' using errcode = '42501'; end if;
  select * into b from public.boards where id = p_board;
  if trim(coalesce(p_confirm, '')) <> b.name then raise exception 'El nombre no coincide'; end if;
  delete from public.boards where id = p_board;
end $$;

create or replace function public.can_admin_board(p_board text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(public.board_can_manage(p_board::uuid, auth.uid()), false);
exception when invalid_text_representation then
  return false;
end $$;

create or replace function public.set_board_idea_permissions(p_board uuid, p_members boolean, p_guests boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_board_admin(p_board);
  perform public.writable_board(p_board, auth.uid());
  update public.boards set members_can_create_ideas = coalesce(p_members, members_can_create_ideas),
                           guests_can_create_ideas = coalesce(p_guests, guests_can_create_ideas)
  where id = p_board;
end $$;

-- ───────────────────────── teams ─────────────────────────
drop function public.create_team(text);
create or replace function public.create_team(p_name text, p_members_create_boards boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  acc public.accounts;
  n text := trim(coalesce(p_name, ''));
  new_id uuid;
  palette text[] := array['#7c5cbf', '#5b8a3a', '#a8487a', '#4f6d8a', '#c2703d', '#3a78b5'];
begin
  select * into acc from public.accounts where owner_id = uid;
  if acc.id is null then raise exception 'Primero creá tu primer buzón.'; end if;
  if acc.status <> 'active' then raise exception 'La cuenta está suspendida.'; end if;
  if n = '' or char_length(n) > 60 then raise exception 'El nombre es obligatorio'; end if;
  if not public.account_is_pro(acc.id) and exists (select 1 from public.teams where account_id = acc.id) then
    raise exception 'Equipos ilimitados en el plan Pro';
  end if;
  insert into public.teams (account_id, name, color, members_can_create_boards)
  values (acc.id, n, palette[1 + (select count(*) from public.teams where account_id = acc.id) % array_length(palette, 1)], coalesce(p_members_create_boards, false))
  returning id into new_id;
  insert into public.team_members (team_id, user_id, role) values (new_id, uid, 'admin');
  return new_id;
end $$;

create or replace function public.set_team_settings(p_team uuid, p_members_create_boards boolean)
returns void language plpgsql security definer set search_path = public as $$
declare acc public.accounts := public.require_account_owner(p_team);
begin
  if acc.owner_id is distinct from auth.uid() then raise exception 'Solo el dueño de la cuenta puede cambiar esto.' using errcode = '42501'; end if;
  update public.teams set members_can_create_boards = coalesce(p_members_create_boards, false) where id = p_team;
end $$;

-- ───────────────────────── boards ─────────────────────────
drop function public.create_board(uuid, text, text);
create or replace function public.create_board(p_team uuid, p_name text, p_visibility text default 'public',
                                               p_members_ideas boolean default true, p_guests_ideas boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  if p_visibility not in ('public', 'private') then raise exception 'Visibilidad inválida.'; end if;
  if not pro and exists (select 1 from public.boards x join public.teams t2 on t2.id = x.team_id where t2.account_id = acc.id) then
    raise exception 'En Free tenés 1 buzón. Pasá a Pro para crear más.';
  end if;
  if not pro and p_visibility = 'private' then raise exception 'Los buzones privados están disponibles en Pro.'; end if;
  b := public.new_board(p_team, n, p_visibility, 'Buzón nuevo. Editá la descripción desde Configuración.');
  update public.boards set created_by = uid, members_can_create_ideas = coalesce(p_members_ideas, true),
                           guests_can_create_ideas = coalesce(p_guests_ideas, true)
  where id = b.id;
  -- a member always sees the board they created, even without access to all boards
  if tm.role = 'member' then
    insert into public.board_member_access (board_id, user_id, has_access) values (b.id, uid, true)
    on conflict (board_id, user_id) do update set has_access = true;
  end if;
  return jsonb_build_object('id', b.id, 'slug', b.slug);
end $$;

-- ───────────────────────── reads & ideas (same as before + permissions) ─────────────────────────
create or replace function public.get_board(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
    return jsonb_build_object('forbidden', true, 'name', b.name);
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
      'created_by', b.created_by, 'members_can_create_ideas', b.members_can_create_ideas, 'guests_can_create_ideas', b.guests_can_create_ideas,
      'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
      'version', b.last_activity_at),
    'role', coalesce(c.role, case when public.is_super_admin() then 'super' end),
    'me', me,
    'perms', jsonb_build_object('can_manage', public.board_can_manage(b.id, uid), 'can_create_ideas', public.board_can_create_idea(b.id, uid)),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'key', k.key) order by k.position, k.created_at)
                            from public.categories k where k.board_id = b.id), '[]'),
    'ideas', ideas
  );
end $$;

create or replace function public.get_my_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  acc public.accounts;
  providers jsonb;
  teams jsonb;
  guest_boards jsonb;
begin
  if uid is null then return null; end if;
  select * into p from public.profiles where id = uid;
  if p.id is null then return null; end if;
  select coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) into providers from auth.users u where u.id = uid;
  select * into acc from public.accounts where owner_id = uid;

  select coalesce(jsonb_agg(tj order by (tj ->> 'own')::boolean desc, tj ->> 'created_at'), '[]') into teams
  from (
    select jsonb_build_object(
      'id', t.id, 'name', t.name, 'color', t.color, 'account_id', t.account_id, 'created_at', t.created_at,
      'own', a.owner_id = uid,
      'is_admin', a.owner_id = uid or tm.role = 'admin',
      'pro', public.account_is_pro(t.account_id),
      'members_can_create_boards', t.members_can_create_boards,
      'can_create_boards', a.owner_id = uid or tm.role = 'admin' or (tm.role = 'member' and t.members_can_create_boards and public.account_is_pro(t.account_id)),
      'locked', not public.account_is_pro(t.account_id)
                and t.id is distinct from (select team_id from public.boards where id = public.account_first_board(t.account_id))
                and exists (select 1 from public.teams t2 where t2.account_id = t.account_id and t2.created_at < t.created_at),
      'owner', jsonb_build_object('id', o.id, 'name', o.name, 'email', o.email, 'avatar_url', o.avatar_url),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', mp.name, 'email', mp.email, 'avatar_url', mp.avatar_url, 'role', m.role) order by m.joined_at)
        from public.team_members m join public.profiles mp on mp.id = m.user_id
        where m.team_id = t.id and m.user_id <> a.owner_id), '[]'),
      'pending', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email) order by i.created_at)
        from public.invitations i
        where i.kind = 'team' and i.team_id = t.id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'),
      'boards', coalesce((
        select jsonb_agg(public.board_card(b.id, uid) order by b.created_at)
        from public.boards b
        where b.team_id = t.id
          and (a.owner_id = uid or tm.role = 'admin' or (public.board_context(b.id, uid)).role in ('admin', 'member'))), '[]')
    ) as tj
    from public.teams t
    join public.accounts a on a.id = t.account_id
    join public.profiles o on o.id = a.owner_id
    left join public.team_members tm on tm.team_id = t.id and tm.user_id = uid
    where a.owner_id = uid or tm.user_id is not null
  ) x;

  select coalesce(jsonb_agg(public.board_card(g.board_id, uid) || jsonb_build_object('joined_at', g.joined_at) order by g.joined_at desc), '[]')
    into guest_boards
  from public.board_guests g
  join public.boards b on b.id = g.board_id
  where g.user_id = uid and g.status = 'active' and b.visibility = 'public'
    and (public.board_context(g.board_id, uid)).role = 'guest';

  return jsonb_build_object(
    'me', jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url, 'is_super_admin', p.is_super_admin,
      'status', p.status, 'notif', p.notif, 'admin_notif', p.admin_notif, 'created_at', p.created_at, 'providers', providers),
    'account', case when acc.id is null then null else jsonb_build_object(
      'id', acc.id, 'name', acc.name, 'status', acc.status, 'created_at', acc.created_at,
      'pro', public.account_is_pro(acc.id),
      'subscription', (select to_jsonb(s) - 'provider_plan_id' || jsonb_build_object('effective_amount', public.effective_amount(s))
                       from public.subscriptions s where s.account_id = acc.id)) end,
    'teams', teams,
    'guest_boards', guest_boards,
    'prices', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS'))
  );
end $$;

create or replace function public.get_team(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  acc public.accounts := public.require_account_owner(p_team);
  t public.teams;
begin
  select * into t from public.teams where id = p_team;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'color', t.color, 'pro', public.account_is_pro(acc.id), 'max_members', 4,
    'members_can_create_boards', t.members_can_create_boards,
    'owner', (select jsonb_build_object('id', id, 'name', name, 'email', email, 'avatar_url', avatar_url) from public.profiles where id = acc.owner_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url,
                                          'role', m.role, 'all_boards', m.all_boards, 'joined_at', m.joined_at) order by m.joined_at)
      from public.team_members m join public.profiles p on p.id = m.user_id
      where m.team_id = p_team and m.user_id <> acc.owner_id), '[]'),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'created_at', i.created_at, 'board_id', i.board_id) order by i.created_at)
      from public.invitations i
      where i.kind = 'team' and i.team_id = p_team and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'),
    'boards', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'color', b.color, 'visibility', b.visibility,
        'access', coalesce((select jsonb_object_agg(m.user_id::text, coalesce(a.has_access, m.all_boards))
                            from public.team_members m
                            left join public.board_member_access a on a.board_id = b.id and a.user_id = m.user_id
                            where m.team_id = p_team and m.user_id <> acc.owner_id), '{}')) order by b.created_at)
      from public.boards b where b.team_id = p_team), '[]')
  );
end $$;

create or replace function public.create_idea(p_board uuid, p_title text, p_description text, p_category uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.participate(p_board);
  uid uuid := auth.uid();
  t text := trim(coalesce(p_title, ''));
  d text := trim(coalesce(p_description, ''));
  n int;
  new_id bigint;
begin
  if not public.board_can_create_idea(p_board, uid) then
    if c.role = 'member' then raise exception 'En este buzón el Admin no habilitó la carga de ideas para los miembros.'; end if;
    raise exception 'En este buzón solo el Equipo carga ideas. Podés votar y comentar.';
  end if;
  if char_length(t) not between 5 and 80 then raise exception 'El título debe tener entre 5 y 80 caracteres'; end if;
  if char_length(d) not between 20 and 2000 then raise exception 'La descripción debe tener entre 20 y 2.000 caracteres'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = p_board) then raise exception 'Elegí una categoría'; end if;
  select count(*) into n from public.ideas where author_id = uid and created_at > now() - interval '10 minutes';
  perform public.rate_limit('ideas', n, 5);
  insert into public.ideas (board_id, author_id, origin, title, description, category_id)
  values (p_board, uid, case when c.role in ('admin', 'member') then 'equipo' else 'comunidad' end, t, d, p_category)
  returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.board_can_manage(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.board_can_create_idea(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_board(text) to anon, authenticated;
