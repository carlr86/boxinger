-- Boxinger · Super Admin API. Every function starts with require_super_admin().

create or replace function public.login_method(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.activated_at is null then 'Pendiente'
    when u.raw_app_meta_data -> 'providers' ? 'google' and u.raw_app_meta_data -> 'providers' ? 'email' then 'Google y email'
    when u.raw_app_meta_data -> 'providers' ? 'google' then 'Google'
    else 'Email'
  end
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = p_user;
$$;

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
    'plan', case when public.account_is_pro(a.id) then 'Pro' else 'Free' end,
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

create or replace function public.admin_clients()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return coalesce((select jsonb_agg(public.account_json(a) order by a.created_at desc) from public.accounts a), '[]');
end $$;

create or replace function public.admin_boards()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'board_id', b.id, 'name', b.name, 'slug', b.slug, 'visibility', b.visibility, 'status', b.status,
      'account_id', a.id, 'owner_name', o.name, 'owner_email', o.email, 'team_name', t.name,
      'plan', case when public.account_is_pro(a.id) then 'Pro' else 'Free' end,
      'ideas', (select count(*) from public.ideas where board_id = b.id),
      'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
      'created_at', b.created_at, 'last_activity_at', b.last_activity_at) order by b.last_activity_at desc)
    from public.boards b join public.teams t on t.id = b.team_id join public.accounts a on a.id = t.account_id
    join public.profiles o on o.id = a.owner_id), '[]');
end $$;

create or replace function public.admin_users()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', p.id, 'name', p.name, 'email', p.email, 'status', p.status, 'created_at', p.created_at,
      'last_seen_at', p.last_seen_at,
      'role', case
        when p.is_super_admin then 'Super Admin'
        when exists (select 1 from public.accounts where owner_id = p.id) then 'Admin'
        when exists (select 1 from public.team_members where user_id = p.id) then 'Miembro'
        when exists (select 1 from public.board_guests where user_id = p.id) then 'Invitado'
        else 'Sin buzón' end,
      'board', coalesce(
        (select jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug) from public.accounts a
          join public.boards b on b.id = public.account_first_board(a.id) where a.owner_id = p.id),
        (select jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug) from public.team_members m
          join public.boards b on b.team_id = m.team_id where m.user_id = p.id order by b.created_at limit 1),
        (select jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug) from public.board_guests g
          join public.boards b on b.id = g.board_id where g.user_id = p.id order by g.joined_at limit 1)),
      'boards_count', (select count(*) from public.board_guests where user_id = p.id)
    ) order by p.created_at desc)
    from public.profiles p), '[]');
end $$;

create or replace function public.admin_client_detail(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.accounts;
begin
  perform public.require_super_admin();
  select * into a from public.accounts where id = p_account;
  if a.id is null then return null; end if;
  return public.account_json(a) || jsonb_build_object(
    'billed', (select coalesce(sum(amount) filter (where currency = 'USD'), 0) from public.payments where account_id = a.id and status = 'completed'),
    'billed_ars', (select coalesce(sum(amount) filter (where currency = 'ARS'), 0) from public.payments where account_id = a.id and status = 'completed'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('provider', provider, 'amount', amount, 'currency', currency, 'status', status, 'paid_at', paid_at) order by created_at desc)
                          from (select * from public.payments where account_id = a.id order by created_at desc limit 12) x), '[]'),
    'board_list', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'visibility', b.visibility, 'status', b.status, 'team_name', t.name,
        'ideas', (select count(*) from public.ideas where board_id = b.id),
        'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
        'members', (select count(*) from public.team_members where team_id = t.id and role = 'member'),
        'created_at', b.created_at, 'last_activity_at', b.last_activity_at) order by t.created_at, b.created_at)
      from public.boards b join public.teams t on t.id = b.team_id where t.account_id = a.id), '[]'),
    'activation_token', (select token from public.invitations where kind = 'client' and account_id = a.id and accepted_at is null and revoked_at is null order by created_at desc limit 1)
  );
end $$;

create or replace function public.admin_board_detail(p_board uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  b public.boards;
  a public.accounts;
begin
  perform public.require_super_admin();
  select * into b from public.boards where id = p_board;
  if b.id is null then return null; end if;
  select a2.* into a from public.teams t join public.accounts a2 on a2.id = t.account_id where t.id = b.team_id;
  return jsonb_build_object(
    'board_id', b.id, 'name', b.name, 'slug', b.slug, 'visibility', b.visibility, 'status', b.status,
    'created_at', b.created_at, 'last_activity_at', b.last_activity_at,
    'ideas', (select count(*) from public.ideas where board_id = b.id),
    'votes', (select count(*) from public.votes v join public.ideas i on i.id = v.idea_id where i.board_id = b.id),
    'comments', (select count(*) from public.comments c join public.ideas i on i.id = c.idea_id where i.board_id = b.id),
    'guests_count', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
    'guests', coalesce((select jsonb_agg(x order by x ->> 'joined_at' desc) from (
        select jsonb_build_object('user_id', p.id, 'name', p.name, 'email', p.email, 'joined_at', g.joined_at) as x
        from public.board_guests g join public.profiles p on p.id = g.user_id
        where g.board_id = b.id and g.status = 'active' order by g.joined_at desc limit 5) y), '[]'),
    'account', public.account_json(a)
  );
end $$;

-- Dashboard numbers for the last p_days days.
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
        'plan', case when public.account_is_pro(t.account_id) then 'Pro' else 'Free' end,
        'ideas', (select count(*) from public.ideas where board_id = b.id), 'last_activity_at', b.last_activity_at) order by b.last_activity_at desc)
      from public.boards b join public.teams t on t.id = b.team_id join public.accounts a on a.id = t.account_id
      where b.last_activity_at >= now() - interval '7 days' and b.status = 'active' and a.status = 'active'), '[]'),
    'pro', coalesce((
      select jsonb_agg(public.account_json(a) order by a.last_activity_at)
      from public.accounts a where public.account_is_pro(a.id) and a.status = 'active'), '[]'),
    'prices', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS'))
  );
end $$;

-- New boards per bucket, split by the account's current plan.
create or replace function public.admin_board_signups(p_from date, p_to date, p_bucket text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare step interval := case p_bucket when 'month' then interval '1 month' when 'week' then interval '1 week' else interval '1 day' end;
begin
  perform public.require_super_admin();
  if p_bucket not in ('day', 'week', 'month') then raise exception 'Bucket inválido.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', g.d, 'pro', coalesce(x.pro, 0), 'free', coalesce(x.free, 0)) order by g.d)
    from generate_series(date_trunc(p_bucket, p_from::timestamp), p_to::timestamp, step) g(d)
    left join (
      select date_trunc(p_bucket, b.created_at at time zone 'America/Argentina/Buenos_Aires') as d,
             count(*) filter (where public.account_is_pro(t.account_id)) as pro,
             count(*) filter (where not public.account_is_pro(t.account_id)) as free
      from public.boards b join public.teams t on t.id = b.team_id
      where b.created_at >= p_from::timestamp and b.created_at < p_to::timestamp + interval '1 day'
      group by 1) x on x.d = g.d), '[]');
end $$;

create or replace function public.admin_set_account_status(p_account uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_super_admin();
begin
  if p_status not in ('active', 'suspended') then raise exception 'Estado inválido.'; end if;
  update public.accounts set status = p_status where id = p_account;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta) values (uid, 'account_status', 'account', p_account, jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_set_board_status(p_board uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_super_admin();
begin
  if p_status not in ('active', 'suspended') then raise exception 'Estado inválido.'; end if;
  update public.boards set status = p_status where id = p_board;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta) values (uid, 'board_status', 'board', p_board, jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_super_admin();
begin
  if p_status not in ('active', 'blocked') then raise exception 'Estado inválido.'; end if;
  if p_user = uid then raise exception 'No podés bloquearte a vos mismo.'; end if;
  update public.profiles set status = p_status where id = p_user;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta) values (uid, 'user_status', 'user', p_user, jsonb_build_object('status', p_status));
end $$;

-- Manual plan and deal changes. Provider-side sync (PayPal / Mercado Pago) runs in the app
-- right after this call, using the returned row.
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
  if p_plan not in ('free', 'pro') then raise exception 'Plan inválido.'; end if;
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
    status = case when p_plan = 'pro' and plan = 'free' then 'active' else status end,
    provider = case when p_plan = 'pro' and plan = 'free' then 'manual' when p_plan = 'free' then null else provider end,
    provider_subscription_id = case when p_plan = 'free' then null else provider_subscription_id end,
    pro_since = case when p_plan = 'pro' and plan = 'free' then now() else pro_since end,
    free_since = case when p_plan = 'free' and plan = 'pro' then now() else free_since end,
    list_amount = coalesce(list_amount, public.current_price(currency)),
    deal_type = case when p_plan = 'pro' then p_deal_type end,
    deal_value = case when p_plan = 'pro' and p_deal_type is not null then p_deal_value end,
    deal_until = case when p_plan = 'pro' and p_deal_type is not null then p_deal_until end,
    deal_note = case when p_plan = 'pro' and p_deal_type is not null then nullif(left(trim(coalesce(p_deal_note, '')), 120), '') end,
    deal_created_at = case when p_plan = 'pro' and p_deal_type is not null then now() end,
    cancel_at_period_end = case when p_plan = 'free' then false else cancel_at_period_end end,
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
      'USD', (select count(*) from public.subscriptions s where s.currency = 'USD' and public.account_is_pro(s.account_id)),
      'ARS', (select count(*) from public.subscriptions s where s.currency = 'ARS' and public.account_is_pro(s.account_id))),
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

create or replace function public.admin_schedule_price(p_currency text, p_amount numeric, p_from date, p_scope text, p_notify boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_super_admin();
  cur numeric := public.current_price(p_currency);
  new_id uuid;
  v_owner uuid;
  from_ts timestamptz := (p_from::timestamp at time zone 'America/Argentina/Buenos_Aires');
begin
  if p_currency not in ('USD', 'ARS') then raise exception 'Moneda inválida.'; end if;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) <> p_amount then raise exception 'Usá un número mayor a 0, con hasta 2 decimales'; end if;
  if p_amount = cur then raise exception 'Es igual al precio vigente'; end if;
  if p_from is null then raise exception 'Elegí una fecha'; end if;
  if p_from <= (now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'La fecha tiene que ser posterior a hoy'; end if;
  if p_scope not in ('all', 'new') then raise exception 'Alcance inválido.'; end if;
  if exists (select 1 from public.price_schedule where currency = p_currency and cancelled_at is null
             and (effective_from at time zone 'America/Argentina/Buenos_Aires')::date = p_from) then
    raise exception 'Ya hay un cambio programado para ese día';
  end if;
  insert into public.price_schedule (currency, amount, effective_from, scope, notify, created_by)
  values (p_currency, p_amount, from_ts, p_scope, p_notify, uid) returning id into new_id;

  if p_notify and p_scope = 'all' then
    for v_owner in select a.owner_id from public.accounts a join public.subscriptions s on s.account_id = a.id
                 where s.currency = p_currency and public.account_is_pro(a.id) and s.deal_type is null loop
      perform public.enqueue_email(v_owner, 'price_change', jsonb_build_object('currency', p_currency, 'old', cur, 'new', p_amount, 'from', from_ts),
        null, 'price:' || new_id || ':' || v_owner);
    end loop;
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'price_scheduled', 'price', new_id, jsonb_build_object('currency', p_currency, 'amount', p_amount, 'from', p_from, 'scope', p_scope));
  return new_id;
end $$;

create or replace function public.admin_cancel_price(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_super_admin();
begin
  update public.price_schedule set cancelled_at = now() where id = p_id and effective_from > now() and cancelled_at is null;
  if not found then raise exception 'Solo se pueden cancelar precios programados.'; end if;
  delete from public.email_outbox where dedupe_key like 'price:' || p_id || ':%' and status = 'pending';
  insert into public.audit_log (actor_id, action, target_type, target_id) values (uid, 'price_cancelled', 'price', p_id);
end $$;

-- Called by the app with the service role right after it creates the auth user.
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
  if p_plan not in ('free', 'pro') then raise exception 'Plan inválido.'; end if;
  update public.profiles set activated_at = null where id = p_user;
  insert into public.accounts (owner_id, name, created_by_admin) values (p_user, tn, true) returning * into acc;
  insert into public.subscriptions (account_id, plan, provider, currency, list_amount, pro_since, charged_amount)
  values (acc.id, p_plan, case when p_plan = 'pro' then 'manual' end, 'USD', public.current_price('USD'),
          case when p_plan = 'pro' then now() end, case when p_plan = 'pro' then public.current_price('USD') end);
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

-- Re-issues (and optionally marks as sent) the activation link of a client.
create or replace function public.admin_client_activation(p_account uuid, p_mark_sent boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_super_admin();
  inv public.invitations;
begin
  select * into inv from public.invitations
  where kind = 'client' and account_id = p_account and accepted_at is null and revoked_at is null
  order by created_at desc limit 1;
  if inv.id is null or inv.expires_at < now() then
    update public.invitations set revoked_at = now() where id = inv.id;
    insert into public.invitations (kind, email, account_id, invited_by)
    values ('client', (select p.email from public.accounts a join public.profiles p on p.id = a.owner_id where a.id = p_account), p_account, uid)
    returning * into inv;
  end if;
  if p_mark_sent then update public.invitations set sent_at = now() where id = inv.id; end if;
  return inv.token;
end $$;

revoke execute on function public.account_json(public.accounts) from public, anon, authenticated;
revoke execute on function public.login_method(uuid) from public, anon, authenticated;
revoke execute on function public.admin_provision_client(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
