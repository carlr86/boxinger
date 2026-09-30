-- Boxinger · "Solo invitados" boards.
--
-- visibility: public (anyone with the link) · invite (team + Invitados) · private (team only).
-- An invite board admits: active board_guests rows, people with a pending (not revoked) guest
-- invitation to their verified email, and, on Pro, verified emails from boards.allowed_domains.
-- Eligible people are Invitados right away (board_context); join_board/participate store the row.
-- Every existing public board becomes invite-only (they were test boards); participants already
-- have board_guests rows, so they keep access.

alter table public.boards drop constraint boards_visibility_check;
alter table public.boards add constraint boards_visibility_check check (visibility in ('public', 'invite', 'private'));
alter table public.boards alter column visibility set default 'invite';
alter table public.boards add column allowed_domains text[] not null default '{}';
alter table public.board_guests drop constraint board_guests_via_check;
alter table public.board_guests add constraint board_guests_via_check check (via in ('link', 'email', 'participation', 'domain'));

update public.boards set visibility = 'invite' where visibility = 'public';

-- How someone without a board_guests row may enter an invite board: 'email' | 'domain' | null.
create or replace function public.board_invite_via(p_board uuid, p_uid uuid, p_pro boolean)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  em text;
  doms text[];
begin
  if p_uid is null then return null; end if;
  select lower(u.email) into em from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if em is null then return null; end if;
  if exists (select 1 from public.invitations i where i.kind = 'guest' and i.board_id = p_board and i.email = em and i.revoked_at is null) then
    return 'email';
  end if;
  if p_pro then
    select allowed_domains into doms from public.boards where id = p_board;
    if split_part(em, '@', 2) = any(doms) then return 'domain'; end if;
  end if;
  return null;
end $$;

-- Stores an Invitado and marks their pending invitation to this board as used.
create or replace function public.join_guest(p_board uuid, p_uid uuid, p_via text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.board_guests (board_id, user_id, via) values (p_board, p_uid, p_via) on conflict (board_id, user_id) do nothing;
  update public.invitations i set accepted_at = now(), accepted_by = p_uid
  where i.kind = 'guest' and i.board_id = p_board and i.accepted_at is null and i.revoked_at is null
    and i.email = (select lower(email) from auth.users where id = p_uid);
end $$;

-- Allowed email domains for an invite board (Pro). Webmail domains are refused: they would open it to anyone.
create or replace function public.set_board_domains(p_board uuid, p_domains text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_board_admin(p_board);
  d text;
  res text[] := '{}';
begin
  perform public.writable_board(p_board, auth.uid());
  if coalesce(array_length(p_domains, 1), 0) > 0 and not c.pro then raise exception 'El acceso por dominio está disponible en Pro.'; end if;
  foreach d in array coalesce(p_domains, '{}') loop
    d := lower(regexp_replace(trim(d), '^@', ''));
    continue when d = '';
    if d !~ '^([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$' then raise exception 'Dominio inválido: %', d; end if;
    if d in ('gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.ar', 'outlook.com', 'outlook.com.ar', 'live.com', 'live.com.ar',
             'yahoo.com', 'yahoo.com.ar', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'msn.com') then
      raise exception '% es un email personal: cualquiera podría entrar. Usá el dominio de la empresa.', d;
    end if;
    if not d = any(res) then res := res || d; end if;
  end loop;
  if array_length(res, 1) > 10 then raise exception 'Hasta 10 dominios.'; end if;
  update public.boards set allowed_domains = res where id = p_board;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'board_domains', 'board', p_board, jsonb_build_object('domains', res));
  return res;
end $$;


create or replace function public.board_context(p_board uuid, p_uid uuid)
returns public.board_ctx language plpgsql stable security definer set search_path = public as $$
declare
  c public.board_ctx;
  tm public.team_members;
  g public.board_guests;
  acc boolean;
begin
  select b.id, b.team_id, t.account_id, a.owner_id, b.visibility, b.status, a.status
    into c.board_id, c.team_id, c.account_id, c.owner_id, c.visibility, c.board_status, c.account_status
  from public.boards b
  join public.teams t on t.id = b.team_id
  join public.accounts a on a.id = t.account_id
  where b.id = p_board;
  if c.board_id is null then return null; end if;

  c.pro := public.account_is_pro(c.account_id);
  c.locked := not c.pro and c.board_id is distinct from public.account_first_board(c.account_id);
  if p_uid is null then return c; end if;
  if p_uid = c.owner_id then c.role := 'admin'; return c; end if;

  select * into tm from public.team_members where team_id = c.team_id and user_id = p_uid;
  if found then
    if tm.role = 'admin' then c.role := 'admin'; return c; end if;
    -- members are paused while the account is on Free
    if c.pro then
      select has_access into acc from public.board_member_access where board_id = p_board and user_id = p_uid;
      if coalesce(acc, tm.all_boards) then c.role := 'member'; return c; end if;
    end if;
  end if;

  select * into g from public.board_guests where board_id = p_board and user_id = p_uid;
  if found then
    if g.status = 'blocked' then c.role := 'blocked';
    elsif c.visibility in ('public', 'invite') then c.role := 'guest';
    end if;
  elsif c.visibility = 'invite' and public.board_invite_via(p_board, p_uid, c.pro) is not null then
    c.role := 'guest';
  end if;
  return c;
end $$;

create or replace function public.can_see_board(c public.board_ctx, p_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_visibility = 'public' or coalesce(c.role in ('admin', 'member'), false)
      or (p_visibility = 'invite' and coalesce(c.role = 'guest', false)) or public.is_super_admin();
$$;

create or replace function public.participate(p_board uuid)
returns public.board_ctx language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  c public.board_ctx := public.writable_board(p_board, uid);
  confirmed timestamptz;
begin
  select email_confirmed_at into confirmed from auth.users where id = uid;
  if confirmed is null then raise exception 'Verificá tu email para participar.'; end if;
  if c.role = 'blocked' then raise exception 'El Equipo bloqueó tu participación en este buzón.'; end if;
  if c.role is null then
    if c.visibility <> 'public' then raise exception 'No tenés acceso a este buzón.' using errcode = '42501'; end if;
    perform public.join_guest(p_board, uid, 'participation');
    c.role := 'guest';
  elsif c.role = 'guest' and c.visibility = 'invite' then
    perform public.join_guest(p_board, uid, coalesce(public.board_invite_via(p_board, uid, c.pro), 'participation'));
  end if;
  return c;
end $$;

create or replace function public.board_can_create_idea(p_board uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(case
    when (c).role = 'admin' then true
    when (c).role = 'member' then b.members_can_create_ideas or b.created_by = p_uid
    when (c).role = 'blocked' then false
    else b.guests_can_create_ideas   -- Invitado, or someone who would join as one
         and (b.visibility = 'public' or (b.visibility = 'invite' and (c).role = 'guest'))
  end, false)
  from public.boards b cross join lateral (select public.board_context(b.id, p_uid) as c) x
  where b.id = p_board;
$$;

create or replace function public.join_board(p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  b public.boards;
  c public.board_ctx;
begin
  select * into b from public.boards where slug = lower(p_slug);
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  c := public.board_context(b.id, uid);
  if c.role = 'guest' then
    if b.visibility = 'invite' then perform public.join_guest(b.id, uid, coalesce(public.board_invite_via(b.id, uid, c.pro), 'link')); end if;
    return 'guest';
  end if;
  if c.role is not null then return c.role; end if;
  if b.visibility <> 'public' then raise exception 'Este buzón es solo para invitados.' using errcode = '42501'; end if;
  perform public.join_guest(b.id, uid, 'link');
  return 'guest';
end $$;

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
    return jsonb_build_object('forbidden', true, 'visibility', b.visibility, 'signed_in', uid is not null);
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
      'plan', public.account_plan(t.account_id),
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
  where g.user_id = uid and g.status = 'active' and b.visibility in ('public', 'invite')
    and (public.board_context(g.board_id, uid)).role = 'guest';

  return jsonb_build_object(
    'me', jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url, 'is_super_admin', p.is_super_admin,
      'status', p.status, 'notif', p.notif, 'admin_notif', p.admin_notif, 'created_at', p.created_at, 'providers', providers),
    'account', case when acc.id is null then null else jsonb_build_object(
      'id', acc.id, 'name', acc.name, 'status', acc.status, 'created_at', acc.created_at,
      'pro', public.account_is_pro(acc.id),
      'plan', public.account_plan(acc.id),
      'member_limit', public.account_member_limit(acc.id),
      'subscription', (select to_jsonb(s) - 'provider_plan_id' || jsonb_build_object('effective_amount', public.effective_amount(s))
                       from public.subscriptions s where s.account_id = acc.id)) end,
    'teams', teams,
    'guest_boards', guest_boards,
    'prices', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS'))
  );
end $$;

create or replace function public.invite_guests(p_board uuid, p_emails text[])
returns int language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_team(p_board);
  emails text[] := public.clean_emails(p_emails);
  e text;
  b public.boards;
  inv public.invitations;
  inviter text;
  n int := 0;
begin
  select * into b from public.boards where id = p_board;
  if b.visibility = 'private' then raise exception 'Los buzones privados no admiten invitados de la Comunidad'; end if;
  select name into inviter from public.profiles where id = auth.uid();
  foreach e in array emails loop
    if exists (select 1 from public.board_guests g join public.profiles p on p.id = g.user_id where g.board_id = p_board and p.email = e) then
      continue;
    end if;
    update public.invitations set revoked_at = now()
    where kind = 'guest' and board_id = p_board and email = e and accepted_at is null and revoked_at is null;
    insert into public.invitations (kind, email, board_id, team_id, invited_by, sent_at, expires_at)
    values ('guest', e, p_board, b.team_id, auth.uid(), now(), now() + interval '30 days') returning * into inv;
    perform public.enqueue_email_to(e, 'invite_guest', jsonb_build_object(
      'token', inv.token, 'board_name', b.name, 'slug', b.slug, 'description', b.description, 'inviter', inviter));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.set_board_visibility(p_board uuid, p_visibility text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_board_admin(p_board);
  b public.boards;
  guests int;
  revoked int := 0;
begin
  perform public.writable_board(p_board, auth.uid());
  if p_visibility not in ('public', 'invite', 'private') then raise exception 'Visibilidad inválida.'; end if;
  select * into b from public.boards where id = p_board;
  if b.visibility = p_visibility then return jsonb_build_object('visibility', p_visibility, 'guests', 0, 'revoked', 0); end if;
  if p_visibility = 'private' and not c.pro then raise exception 'Los buzones privados están disponibles en Pro.'; end if;

  select count(*) into guests from public.board_guests where board_id = p_board and status = 'active';
  if p_visibility = 'private' then
    with r as (
      update public.invitations set revoked_at = now()
      where kind = 'guest' and board_id = p_board and accepted_at is null and revoked_at is null
      returning 1)
    select count(*) into revoked from r;
  end if;
  update public.boards set visibility = p_visibility where id = p_board;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'board_visibility', 'board', p_board, jsonb_build_object('from', b.visibility, 'to', p_visibility));
  return jsonb_build_object('visibility', p_visibility, 'guests', guests, 'revoked', revoked);
end $$;

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
  if p_visibility not in ('public', 'invite', 'private') then raise exception 'Visibilidad inválida.'; end if;
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

revoke execute on function public.board_invite_via(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.join_guest(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_board_domains(uuid, text[]) to authenticated;

