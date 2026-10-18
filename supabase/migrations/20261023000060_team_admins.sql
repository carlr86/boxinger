-- Boxinger · Team Admins (Team and Enterprise)
-- Note: the owner also has a team_members row with role 'admin' (since onboarding); counts and demotions skip it.
-- Three roles on a team: the Admin Owner (the account owner: subscription, deleting the team, giving and taking the
-- Admin role), Admins (manage boards and people, like the owner, but no billing and they can't remove other Admins)
-- and Members. Admins take a seat like members. Admins go back to members when the account leaves Team/Enterprise.
-- The Admin Owner gets an email when someone else deletes or empties a board, exports ideas or connects an integration.
-- Function bodies start from the production definitions (pg_get_functiondef, 2026-10-18).

-- The Admin Owner gives or takes the Admin role (Team and Enterprise, i.e. plan 'enterprise').
create or replace function public.set_team_member_role(p_team uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare acc public.accounts;
begin
  select a.* into acc from public.teams t join public.accounts a on a.id = t.account_id where t.id = p_team;
  if acc.id is null then raise exception 'El equipo no existe.'; end if;
  if acc.owner_id is distinct from public.require_user() then raise exception 'Solo el Admin Owner puede cambiar los roles del equipo.' using errcode = '42501'; end if;
  if acc.status <> 'active' then raise exception 'La cuenta está suspendida.'; end if;
  if p_role not in ('member', 'admin') then raise exception 'Rol inválido.'; end if;
  if p_role = 'admin' and public.account_plan(acc.id) <> 'enterprise' then raise exception 'Sumar Admins al equipo está disponible en los planes Team y Enterprise.'; end if;
  if p_user = acc.owner_id then raise exception 'El Admin Owner no cambia de rol.'; end if;
  update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
  if not found then raise exception 'La persona no es parte del equipo.'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'team_role', 'user', p_user, jsonb_build_object('team', p_team, 'role', p_role));
end $$;
grant execute on function public.set_team_member_role(uuid, uuid, text) to authenticated;

-- Leaving Team / Enterprise: Admins go back to members.
create or replace function public.subscriptions_team_admins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.plan = 'enterprise' and new.plan is distinct from 'enterprise' then
    -- (the owner's own row is 'admin' too and stays: they are the Admin Owner on every plan)
    update public.team_members set role = 'member'
    where role = 'admin' and team_id in (select id from public.teams where account_id = new.account_id)
      and user_id is distinct from (select owner_id from public.accounts where id = new.account_id);
  end if;
  return new;
end $$;
create trigger subscriptions_team_admins after update of plan on public.subscriptions
  for each row execute function public.subscriptions_team_admins();

-- The Admin Owner hears about sensitive actions done by someone else on their boards.
create or replace function public.audit_owner_notice()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b public.boards;
  owner uuid;
  team_name text;
  board_name text;
begin
  if new.target_type <> 'board' or new.actor_id is null
     or new.action not in ('board_deleted', 'board_emptied', 'ideas_exported', 'api_key_created', 'api_key_rotated', 'slack_connected') then
    return null;
  end if;
  select * into b from public.boards where id = new.target_id::uuid;
  select a.owner_id, t.name into owner, team_name from public.teams t join public.accounts a on a.id = t.account_id
  where t.id = coalesce(b.team_id, (new.meta ->> 'team_id')::uuid);
  if owner is null or owner = new.actor_id then return null; end if;
  board_name := coalesce(b.name, new.meta ->> 'name');
  perform public.enqueue_email(owner, 'owner_admin_action', jsonb_build_object(
    'action', new.action, 'actor', (select coalesce(name, email) from public.profiles where id = new.actor_id),
    'actor_email', (select email from public.profiles where id = new.actor_id),
    'board_name', board_name, 'team_name', team_name, 'slug', b.slug), null, null);
  return null;
end $$;
create trigger audit_owner_notice after insert on public.audit_log for each row execute function public.audit_owner_notice();


CREATE OR REPLACE FUNCTION public.invite_team_members(p_team uuid, p_emails text[], p_board uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  acc public.accounts := public.require_account_owner(p_team);
  emails text[] := public.clean_emails(p_emails);
  e text;
  used int;
  inv public.invitations;
  t public.teams;
  inviter text;
  board_name text;
begin
  if not public.account_is_pro(acc.id) then raise exception 'Sumar miembros al equipo está disponible en Pro'; end if;
  if p_board is not null and not exists (select 1 from public.boards where id = p_board and team_id = p_team) then raise exception 'El buzón no es de este equipo.'; end if;
  if exists (select 1 from unnest(emails) x(em)
             where x.em = (select email from public.profiles where id = acc.owner_id)
                or exists (select 1 from public.team_members m join public.profiles p on p.id = m.user_id where m.team_id = p_team and p.email = x.em)) then
    raise exception 'Ese email ya es parte del equipo';
  end if;
  select (select count(*) from public.team_members where team_id = p_team and role in ('member', 'admin') and user_id <> acc.owner_id)
       + (select count(*) from public.invitations where kind = 'team' and team_id = p_team and accepted_at is null and revoked_at is null
            and expires_at > now() and not email = any (emails))
    into used;
  if public.account_member_limit(acc.id) is not null and used + array_length(emails, 1) > public.account_member_limit(acc.id) then
    raise exception 'Tu equipo puede tener hasta % personas además de vos (miembros y Admins)', public.account_member_limit(acc.id);
  end if;

  select * into t from public.teams where id = p_team;
  select name into inviter from public.profiles where id = auth.uid();
  select name into board_name from public.boards where id = p_board;
  foreach e in array emails loop
    update public.invitations set revoked_at = now()
    where kind = 'team' and team_id = p_team and email = e and accepted_at is null and revoked_at is null;
    insert into public.invitations (kind, email, team_id, board_id, invited_by, sent_at)
    values ('team', e, p_team, p_board, auth.uid(), now()) returning * into inv;
    perform public.enqueue_email_to(e, 'invite_team', jsonb_build_object(
      'token', inv.token, 'team_name', t.name, 'inviter', inviter, 'board_name', board_name));
  end loop;
  return array_length(emails, 1);
end $function$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  my_email text;
  inv public.invitations;
  acc public.accounts;
  v_slug text;
begin
  select * into inv from public.invitations where token = p_token for update;
  if inv.id is null or inv.revoked_at is not null then raise exception 'La invitación no es válida.'; end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = uid then
      return jsonb_build_object('kind', inv.kind, 'slug', (select bb.slug from public.boards bb where bb.id = coalesce(inv.board_id, (select b2.id from public.boards b2 where b2.team_id = inv.team_id order by b2.created_at limit 1))));
    end if;
    raise exception 'La invitación ya fue usada.';
  end if;
  if inv.expires_at < now() then raise exception 'La invitación venció. Pedí una nueva.'; end if;
  select email into my_email from public.profiles where id = uid;

  if inv.kind = 'team' then
    if my_email <> inv.email then raise exception 'Esta invitación es para %. Ingresá con ese email.', inv.email; end if;
    select a.* into acc from public.teams t join public.accounts a on a.id = t.account_id where t.id = inv.team_id;
    if not public.account_is_pro(acc.id) then raise exception 'El equipo ya no tiene el plan Pro.'; end if;
    if public.account_member_limit(acc.id) is not null
       and (select count(*) from public.team_members where team_id = inv.team_id and role in ('member', 'admin') and user_id <> acc.owner_id) >= public.account_member_limit(acc.id) then
      raise exception 'El equipo está completo.';
    end if;
    insert into public.team_members (team_id, user_id, role, all_boards) values (inv.team_id, uid, 'member', inv.board_id is null)
    on conflict (team_id, user_id) do nothing;
    if inv.board_id is not null then
      insert into public.board_member_access (board_id, user_id, has_access) values (inv.board_id, uid, true)
      on conflict (board_id, user_id) do update set has_access = true;
    end if;
    select b.slug into v_slug from public.boards b where b.id = coalesce(inv.board_id, (select id from public.boards where team_id = inv.team_id order by created_at limit 1));
  elsif inv.kind = 'guest' then
    insert into public.board_guests (board_id, user_id, via, invited_by) values (inv.board_id, uid, 'email', inv.invited_by)
    on conflict (board_id, user_id) do nothing;
    select b.slug into v_slug from public.boards b where b.id = inv.board_id;
  else
    if my_email <> inv.email then raise exception 'Esta invitación es para %.', inv.email; end if;
    update public.profiles set activated_at = coalesce(activated_at, now()) where id = uid;
    select b.slug into v_slug from public.boards b join public.teams t on t.id = b.team_id where t.account_id = inv.account_id order by b.created_at limit 1;
  end if;

  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return jsonb_build_object('kind', inv.kind, 'slug', v_slug);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user uuid, p_board uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_super_admin();
  b public.boards;
  acc public.accounts;
  lim int;
begin
  if p_role not in ('member', 'guest') then raise exception 'Rol inválido.'; end if;
  select * into b from public.boards where id = p_board;
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  select a.* into acc from public.teams t join public.accounts a on a.id = t.account_id where t.id = b.team_id;
  if p_user = acc.owner_id or exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user and role = 'admin') then
    raise exception 'Es el Admin de la cuenta: su rol no se puede cambiar.';
  end if;

  if p_role = 'member' then
    if exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user) then raise exception 'Ya es Miembro de este equipo.'; end if;
    if not public.account_is_pro(acc.id) then raise exception 'La cuenta es Free: necesita Pro, Team o Enterprise para tener miembros.'; end if;
    lim := public.account_member_limit(acc.id);
    if lim is not null and (select count(*) from public.team_members where team_id = b.team_id and role in ('member', 'admin') and user_id <> acc.owner_id) >= lim then
      raise exception 'El equipo ya tiene % miembros, el máximo de su plan.', lim;
    end if;
    insert into public.team_members (team_id, user_id, role, all_boards) values (b.team_id, p_user, 'member', true);
    -- As a member they see the team's boards: their guest seats there are no longer needed.
    delete from public.board_guests where user_id = p_user and board_id in (select id from public.boards where team_id = b.team_id);
    update public.board_access_requests set status = 'approved', decided_by = uid, decided_at = now()
    where user_id = p_user and status = 'pending' and board_id in (select id from public.boards where team_id = b.team_id);
  else
    if not exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user) then raise exception 'Ya es Invitado de este buzón.'; end if;
    delete from public.board_member_access where user_id = p_user and board_id in (select id from public.boards where team_id = b.team_id);
    delete from public.team_members where team_id = b.team_id and user_id = p_user;
    insert into public.board_guests (board_id, user_id, via, invited_by) values (b.id, p_user, 'email', uid)
    on conflict (board_id, user_id) do update set status = 'active';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'user_role', 'user', p_user, jsonb_build_object('board', b.id, 'role', p_role));
end $function$;

CREATE OR REPLACE FUNCTION public.pro_usage(p_account uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bs as (
    select b.id, b.name, b.visibility, t.id as team_id, b.id = public.account_first_board(p_account) as kept,
           (select count(*) from public.ideas i where i.board_id = b.id) as ideas
    from public.boards b join public.teams t on t.id = b.team_id where t.account_id = p_account
  ), kept as (select * from bs where kept)
  select jsonb_build_object(
    'kept', (select jsonb_build_object('id', id, 'name', name, 'ideas', ideas) from kept),
    'boards', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'ideas', ideas, 'kept', kept) order by kept desc, name) from bs), '[]'),
    'locked_boards', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'ideas', ideas) order by name) from bs where not kept), '[]'),
    'teams_locked', (select count(*) from public.teams t where t.account_id = p_account and t.id is distinct from (select team_id from kept)),
    'members', (select count(distinct m.user_id) from public.team_members m join public.teams t on t.id = m.team_id where t.account_id = p_account and m.role in ('member', 'admin') and m.user_id is distinct from (select owner_id from public.accounts where id = p_account)),
    'roadmap_ideas', (select count(*) from public.ideas i join bs on bs.id = i.board_id where i.rm_col is not null and i.status = 'aprobada'),
    'rated_ideas', (select count(*) from public.ideas i join bs on bs.id = i.board_id where i.impact > 0 or i.effort > 0),
    'domains', (select coalesce(sum(cardinality(b.allowed_domains)), 0) from public.boards b join bs on bs.id = b.id),
    'private_boards', (select count(*) from bs where visibility = 'private')
  );
$function$;

CREATE OR REPLACE FUNCTION public.admin_client_detail(p_account uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.accounts;
begin
  perform public.require_super_admin();
  select * into a from public.accounts where id = p_account;
  if a.id is null then return null; end if;
  return public.account_json(a) || jsonb_build_object(
    'billed', (select coalesce(sum(amount - refunded_amount) filter (where currency = 'USD'), 0) from public.payments where account_id = a.id and status in ('completed', 'refunded')),
    'billed_ars', (select coalesce(sum(amount - refunded_amount) filter (where currency = 'ARS'), 0) from public.payments where account_id = a.id and status in ('completed', 'refunded')),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('provider', provider, 'amount', amount, 'refunded_amount', refunded_amount, 'currency', currency, 'status', status, 'paid_at', paid_at) order by created_at desc)
                          from (select * from public.payments where account_id = a.id order by created_at desc limit 12) x), '[]'),
    'board_list', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'visibility', b.visibility, 'status', b.status, 'team_name', t.name,
        'ideas', (select count(*) from public.ideas where board_id = b.id),
        'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
        'members', (select count(*) from public.team_members m where m.team_id = t.id and m.role in ('member', 'admin') and m.user_id is distinct from (select owner_id from public.accounts where id = t.account_id)),
        'created_at', b.created_at, 'last_activity_at', b.last_activity_at) order by t.created_at, b.created_at)
      from public.boards b join public.teams t on t.id = b.team_id where t.account_id = a.id), '[]'),
    'cancel', (select jsonb_build_object('reason', cancel_reason, 'note', cancel_note, 'at', cancelled_at) from public.subscriptions where account_id = a.id and cancelled_at is not null),
    'activation_token', (select token from public.invitations where kind = 'client' and account_id = a.id and accepted_at is null and revoked_at is null order by created_at desc limit 1)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.remove_team_member(p_team uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare acc public.accounts := public.require_account_owner(p_team);
begin
  if p_user = acc.owner_id then raise exception 'No podés quitar al Admin Owner del equipo.'; end if;
  -- Only the Admin Owner removes another Admin (an Admin can still leave the team).
  if p_user is distinct from auth.uid() and acc.owner_id is distinct from auth.uid()
     and exists (select 1 from public.team_members where team_id = p_team and user_id = p_user and role = 'admin') then
    raise exception 'Solo el Admin Owner puede quitar a otro Admin.' using errcode = '42501';
  end if;
  delete from public.board_member_access where user_id = p_user and board_id in (select id from public.boards where team_id = p_team);
  delete from public.team_members where team_id = p_team and user_id = p_user;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_team(p_team uuid, p_confirm text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  acc public.accounts := public.require_account_owner(p_team);
  t public.teams;
  n int;
begin
  if acc.owner_id is distinct from auth.uid() then
    raise exception 'Solo el Admin Owner puede eliminar un equipo.' using errcode = '42501';
  end if;
  select * into t from public.teams where id = p_team;
  if trim(coalesce(p_confirm, '')) <> t.name then raise exception 'El nombre no coincide'; end if;
  select count(*) into n from public.boards where team_id = p_team;
  delete from public.teams where id = p_team;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'team_deleted', 'team', p_team, jsonb_build_object('name', t.name, 'boards', n));
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_board(p_board uuid, p_confirm text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.board_ctx := public.require_board_admin(p_board);
  b public.boards;
begin
  if c.role <> 'admin' then raise exception 'Solo el Admin del equipo puede eliminar buzones.' using errcode = '42501'; end if;
  select * into b from public.boards where id = p_board;
  if trim(coalesce(p_confirm, '')) <> b.name then raise exception 'El nombre no coincide'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'board_deleted', 'board', p_board, jsonb_build_object('name', b.name, 'team_id', b.team_id));
  delete from public.boards where id = p_board;
end $function$;

CREATE OR REPLACE FUNCTION public.get_team(p_team uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  acc public.accounts := public.require_account_owner(p_team);
  t public.teams;
begin
  select * into t from public.teams where id = p_team;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'color', t.color, 'pro', public.account_is_pro(acc.id), 'max_members', public.account_member_limit(acc.id), 'plan', public.account_plan(acc.id),
    'members_can_create_boards', t.members_can_create_boards, 'is_owner', acc.owner_id = auth.uid(),
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
end $function$;
