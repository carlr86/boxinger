-- Boxinger · Enterprise plan
-- Everything in Pro plus unlimited members (and AI features, coming soon). Not sold on the web:
-- only the Super Admin assigns it (billed outside the platform, so it is not part of MRR).

alter table public.subscriptions drop constraint subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('free', 'pro', 'enterprise'));

-- Pro features are on for Pro and Enterprise.
create or replace function public.account_is_pro(p_account uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.account_id = p_account
      and (s.plan = 'enterprise'
           or (s.plan = 'pro' and (s.status in ('active', 'past_due') or (s.status = 'cancelled' and s.current_period_end > now()))))
  );
$$;

create or replace function public.account_plan(p_account uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.subscriptions where account_id = p_account and plan = 'enterprise') then 'enterprise'
    when public.account_is_pro(p_account) then 'pro'
    else 'free' end;
$$;

-- Members per team besides the owner: 4 on Pro, unlimited (null) on Enterprise.
create or replace function public.account_member_limit(p_account uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.account_plan(p_account) = 'enterprise' then null else 4 end;
$$;

create or replace function public.admin_update_subscription(
  p_account uuid, p_plan text, p_deal_type text default null, p_deal_value numeric default null,
  p_deal_until timestamptz default null, p_deal_note text default null, p_notify boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_super_admin();
  s public.subscriptions;
  list numeric;
  v_owner uuid;
begin
  if p_plan not in ('free', 'pro', 'enterprise') then raise exception 'Plan inválido.'; end if;
  select * into s from public.subscriptions where account_id = p_account for update;
  if s.account_id is null then raise exception 'La cuenta no existe.'; end if;
  list := coalesce(s.list_amount, public.current_price(s.currency));
  if p_plan = 'pro' and p_deal_type is not null then
    if p_deal_type not in ('pct', 'fixed') then raise exception 'Tipo de precio inválido.'; end if;
    if p_deal_value is null then raise exception 'Ingresá un valor'; end if;
    if p_deal_type = 'pct' and not (p_deal_value >= 1 and p_deal_value <= 100) then raise exception 'Entre 1 y 100 %%'; end if;
    if p_deal_type = 'fixed' and not (p_deal_value > 0 and p_deal_value < list) then
      raise exception 'Tiene que ser menor al precio de lista (% %)', s.currency, list;
    end if;
    if p_deal_until is not null and p_deal_until < now() then raise exception 'La fecha tiene que ser posterior a hoy'; end if;
  end if;

  update public.subscriptions set
    plan = p_plan,
    status = case when p_plan = 'enterprise' or (p_plan = 'pro' and plan <> 'pro') then 'active' else status end,
    provider = case when p_plan = 'free' then null when p_plan = 'enterprise' or plan <> 'pro' then 'manual' else provider end,
    provider_subscription_id = case when p_plan = 'pro' and plan = 'pro' then provider_subscription_id end,
    pro_since = case when p_plan <> 'free' and plan = 'free' then now() else pro_since end,
    free_since = case when p_plan = 'free' and plan <> 'free' then now() else free_since end,
    list_amount = coalesce(list_amount, public.current_price(currency)),
    deal_type = case when p_plan = 'pro' then p_deal_type end,
    deal_value = case when p_plan = 'pro' and p_deal_type is not null then p_deal_value end,
    deal_until = case when p_plan = 'pro' and p_deal_type is not null then p_deal_until end,
    deal_note = case when p_plan = 'pro' and p_deal_type is not null then nullif(left(trim(coalesce(p_deal_note, '')), 120), '') end,
    deal_created_at = case when p_plan = 'pro' and p_deal_type is not null then now() end,
    cancel_at_period_end = case when p_plan = 'pro' then cancel_at_period_end else false end,
    current_period_end = case when p_plan = 'pro' then current_period_end end,
    updated_at = now()
  where account_id = p_account
  returning * into s;
  update public.subscriptions set charged_amount = public.effective_amount(s) where account_id = p_account returning * into s;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'subscription_update', 'account', p_account, jsonb_build_object('plan', p_plan, 'deal_type', p_deal_type, 'deal_value', p_deal_value, 'deal_until', p_deal_until));

  if p_notify then
    select owner_id into v_owner from public.accounts where id = p_account;
    perform public.enqueue_email(v_owner, 'subscription_changed', jsonb_build_object(
      'plan', p_plan, 'currency', s.currency, 'amount', public.effective_amount(s), 'deal_type', s.deal_type,
      'deal_value', s.deal_value, 'deal_until', s.deal_until));
  end if;
  return to_jsonb(s) || jsonb_build_object('effective_amount', public.effective_amount(s));
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
  where g.user_id = uid and g.status = 'active' and b.visibility = 'public'
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

create or replace function public.get_team(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  acc public.accounts := public.require_account_owner(p_team);
  t public.teams;
begin
  select * into t from public.teams where id = p_team;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'color', t.color, 'pro', public.account_is_pro(acc.id), 'max_members', public.account_member_limit(acc.id), 'plan', public.account_plan(acc.id),
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

create or replace function public.invite_team_members(p_team uuid, p_emails text[], p_board uuid default null)
returns int language plpgsql security definer set search_path = public as $$
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
  select (select count(*) from public.team_members where team_id = p_team and role = 'member')
       + (select count(*) from public.invitations where kind = 'team' and team_id = p_team and accepted_at is null and revoked_at is null
            and expires_at > now() and not email = any (emails))
    into used;
  if public.account_member_limit(acc.id) is not null and used + array_length(emails, 1) > public.account_member_limit(acc.id) then
    raise exception 'Tu equipo puede tener hasta % miembros además de vos', public.account_member_limit(acc.id);
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
end $$;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
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
       and (select count(*) from public.team_members where team_id = inv.team_id and role = 'member') >= public.account_member_limit(acc.id) then
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
end $$;

create or replace function public.account_json(a public.accounts)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'account_id', a.id, 'name', o.name, 'email', o.email, 'owner_id', o.id, 'account_name', a.name,
    'created_at', a.created_at, 'status', a.status, 'last_activity_at', a.last_activity_at,
    'login', public.login_method(o.id),
    'activated', o.activated_at is not null,
    'invite', (select case when i.sent_at is null then 'no' else 'sent' end from public.invitations i
               where i.kind = 'client' and i.account_id = a.id and i.accepted_at is null and i.revoked_at is null
               order by i.created_at desc limit 1),
    'plan', initcap(public.account_plan(a.id)),
    'sub_status', s.status, 'provider', s.provider, 'currency', s.currency,
    'list_amount', coalesce(s.list_amount, public.current_price(s.currency)),
    'amount', public.effective_amount(s),
    'deal_type', case when s.deal_type is not null and (s.deal_until is null or s.deal_until > now()) then s.deal_type end,
    'deal_value', s.deal_value, 'deal_until', s.deal_until, 'deal_note', s.deal_note,
    'pro_since', s.pro_since, 'free_since', s.free_since, 'current_period_end', s.current_period_end,
    'cancel_at_period_end', s.cancel_at_period_end,
    'boards', (select count(*) from public.boards b join public.teams t on t.id = b.team_id where t.account_id = a.id),
    'first_board', (select jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug) from public.boards b
                    where b.id = public.account_first_board(a.id)),
    'ideas', (select count(*) from public.ideas i join public.boards b on b.id = i.board_id join public.teams t on t.id = b.team_id where t.account_id = a.id),
    'guests', (select count(distinct g.user_id) from public.board_guests g join public.boards b on b.id = g.board_id join public.teams t on t.id = b.team_id where t.account_id = a.id and g.status = 'active')
  )
  from public.profiles o
  left join public.subscriptions s on s.account_id = a.id
  where o.id = a.owner_id;
$$;

create or replace function public.admin_boards()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'board_id', b.id, 'name', b.name, 'slug', b.slug, 'visibility', b.visibility, 'status', b.status,
      'account_id', a.id, 'owner_name', o.name, 'owner_email', o.email, 'team_name', t.name,
      'plan', initcap(public.account_plan(a.id)),
      'ideas', (select count(*) from public.ideas where board_id = b.id),
      'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
      'created_at', b.created_at, 'last_activity_at', b.last_activity_at) order by b.last_activity_at desc)
    from public.boards b join public.teams t on t.id = b.team_id join public.accounts a on a.id = t.account_id
    join public.profiles o on o.id = a.owner_id), '[]');
end $$;

create or replace function public.admin_overview(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  perform public.require_super_admin();
  return jsonb_build_object(
    'accounts', (select count(*) from public.accounts),
    'active_boards', (select count(*) from public.boards where last_activity_at >= since),
    'ideas', (select count(*) from public.ideas where created_at >= since),
    'votes', (select count(*) from public.votes where created_at >= since),
    'comments', (select count(*) from public.comments where created_at >= since),
    'recent_boards', coalesce((
      select jsonb_agg(jsonb_build_object('board_id', b.id, 'name', b.name, 'slug', b.slug, 'account_id', t.account_id,
        'plan', initcap(public.account_plan(t.account_id)),
        'ideas', (select count(*) from public.ideas where board_id = b.id), 'last_activity_at', b.last_activity_at) order by b.last_activity_at desc)
      from public.boards b join public.teams t on t.id = b.team_id join public.accounts a on a.id = t.account_id
      where b.last_activity_at >= now() - interval '7 days' and b.status = 'active' and a.status = 'active'), '[]'),
    'pro', coalesce((
      select jsonb_agg(public.account_json(a) order by a.last_activity_at)
      from public.accounts a where public.account_plan(a.id) = 'pro' and a.status = 'active'), '[]'),
    'enterprise', (select count(*) from public.accounts a where public.account_plan(a.id) = 'enterprise'),
    'prices', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS'))
  );
end $$;

create or replace function public.admin_prices()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return jsonb_build_object(
    'current', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS')),
    'current_since', jsonb_build_object(
      'USD', (select effective_from from public.price_schedule where currency = 'USD' and cancelled_at is null and effective_from <= now() order by effective_from desc limit 1),
      'ARS', (select effective_from from public.price_schedule where currency = 'ARS' and cancelled_at is null and effective_from <= now() order by effective_from desc limit 1)),
    'pro_count', jsonb_build_object(
      'USD', (select count(*) from public.subscriptions s where s.currency = 'USD' and s.plan = 'pro' and public.account_is_pro(s.account_id)),
      'ARS', (select count(*) from public.subscriptions s where s.currency = 'ARS' and s.plan = 'pro' and public.account_is_pro(s.account_id))),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'currency', p.currency, 'amount', p.amount, 'effective_from', p.effective_from, 'scope', p.scope,
        'notify', p.notify, 'applied_at', p.applied_at,
        'state', case
          when p.effective_from > now() then 'scheduled'
          when p.id = (select id from public.price_schedule x where x.currency = p.currency and x.cancelled_at is null and x.effective_from <= now()
                       order by x.effective_from desc, x.created_at desc limit 1) then 'current'
          else 'previous' end) order by p.effective_from desc)
      from public.price_schedule p where p.cancelled_at is null), '[]')
  );
end $$;

create or replace function public.admin_provision_client(p_actor uuid, p_user uuid, p_team text, p_board text, p_plan text, p_send boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  acc public.accounts;
  tm public.teams;
  b public.boards;
  inv public.invitations;
  tn text := trim(coalesce(p_team, ''));
  bn text := coalesce(nullif(trim(coalesce(p_board, '')), ''), trim(coalesce(p_team, '')));
begin
  if not coalesce((select is_super_admin from public.profiles where id = p_actor), false) then raise exception 'Solo el Admin de plataforma puede crear clientes.'; end if;
  if tn = '' then raise exception 'Ingresá el nombre del equipo'; end if;
  if p_plan not in ('free', 'pro', 'enterprise') then raise exception 'Plan inválido.'; end if;
  update public.profiles set activated_at = null where id = p_user;
  insert into public.accounts (owner_id, name, created_by_admin) values (p_user, tn, true) returning * into acc;
  insert into public.subscriptions (account_id, plan, provider, currency, list_amount, pro_since, charged_amount)
  values (acc.id, p_plan, case when p_plan <> 'free' then 'manual' end, 'USD', public.current_price('USD'),
          case when p_plan <> 'free' then now() end, case when p_plan = 'pro' then public.current_price('USD') end);
  insert into public.teams (account_id, name) values (acc.id, tn) returning * into tm;
  insert into public.team_members (team_id, user_id, role) values (tm.id, p_user, 'admin');
  b := public.new_board(tm.id, bn, 'public', '');
  update public.teams set color = b.color where id = tm.id;
  insert into public.invitations (kind, email, account_id, invited_by, sent_at)
  values ('client', (select email from public.profiles where id = p_user), acc.id, p_actor, case when p_send then now() end)
  returning * into inv;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (p_actor, 'client_created', 'account', acc.id, jsonb_build_object('plan', p_plan, 'send', p_send));
  return jsonb_build_object('account_id', acc.id, 'slug', b.slug, 'token', inv.token, 'board', b.name);
end $$;

create or replace function public.weekly_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'accounts', (select count(*) from public.accounts),
    'new_accounts', (select count(*) from public.accounts where created_at >= now() - interval '7 days'),
    'new_boards', (select count(*) from public.boards where created_at >= now() - interval '7 days'),
    'ideas', (select count(*) from public.ideas where created_at >= now() - interval '7 days'),
    'votes', (select count(*) from public.votes where created_at >= now() - interval '7 days'),
    'comments', (select count(*) from public.comments where created_at >= now() - interval '7 days'),
    'pro', (select count(*) from public.accounts a where public.account_plan(a.id) = 'pro'),
    'enterprise', (select count(*) from public.accounts a where public.account_plan(a.id) = 'enterprise'),
    'mrr_usd', (select coalesce(sum(public.effective_amount(s)), 0) from public.subscriptions s where s.currency = 'USD' and public.account_is_pro(s.account_id)),
    'mrr_ars', (select coalesce(sum(public.effective_amount(s)), 0) from public.subscriptions s where s.currency = 'ARS' and public.account_is_pro(s.account_id))
  );
$$;

revoke execute on function public.account_json(public.accounts) from public, anon, authenticated;
revoke execute on function public.admin_provision_client(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.weekly_summary() from public, anon, authenticated;
