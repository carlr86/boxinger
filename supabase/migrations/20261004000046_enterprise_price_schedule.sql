-- Boxinger · Enterprise price in the price schedule (like Pro), so it can be scheduled from Admin
-- price_schedule rows now belong to a plan. The current Enterprise price (USD 19.99 / ARS 29.999) becomes its first
-- row. A new USD price gets its own Creem product the first time someone checks out (creem_product_id).

alter table public.price_schedule add column if not exists plan text not null default 'pro' check (plan in ('pro', 'enterprise'));
alter table public.price_schedule add column if not exists creem_product_id text;
create index if not exists price_schedule_plan_idx on public.price_schedule (plan, currency, effective_from desc);

insert into public.price_schedule (plan, currency, amount, effective_from, scope, notify, applied_at, creem_product_id)
select 'enterprise', x.cur, x.amount, now() - interval '1 minute', 'all', false, now(), x.product
from (values ('USD', 19.99, 'prod_5vBg7bDxuY1x7J7TZ8c3ql'), ('ARS', 29999.00, null)) as x(cur, amount, product)
where not exists (select 1 from public.price_schedule where plan = 'enterprise');

-- The live Creem product of the current Pro price.
update public.price_schedule p set creem_product_id = 'prod_1Q3cedVQFgJ0SwGO3vlAZ2'
where p.plan = 'pro' and p.currency = 'USD' and p.amount = 9.99 and p.creem_product_id is null;

create or replace function public.current_plan_price(p_plan text, p_currency text)
returns numeric language sql stable security definer set search_path = public as $$
  select amount from public.price_schedule
  where plan = p_plan and currency = p_currency and cancelled_at is null and effective_from <= now()
  order by effective_from desc, created_at desc
  limit 1;
$$;
grant execute on function public.current_plan_price(text, text) to anon, authenticated;

-- Pro's price, as before.
create or replace function public.current_price(p_currency text)
returns numeric language sql stable security definer set search_path = public as $$
  select public.current_plan_price('pro', p_currency);
$$;

create or replace function public.effective_amount(s public.subscriptions)
returns numeric language sql stable as $$
  select case
    when s.plan = 'enterprise' then
      case when coalesce(s.provider, 'manual') = 'manual' then 0 else coalesce(s.list_amount, public.current_plan_price('enterprise', s.currency)) end
    when s.plan <> 'pro' then 0
    when s.deal_type is not null and (s.deal_until is null or s.deal_until > now()) then
      case when s.deal_type = 'fixed' then s.deal_value
           else round(coalesce(s.list_amount, public.current_price(s.currency)) * (1 - s.deal_value / 100), 2) end
    else coalesce(s.list_amount, public.current_price(s.currency))
  end;
$$;

drop function if exists public.admin_schedule_price(text, numeric, date, text, boolean);
create or replace function public.admin_schedule_price(p_currency text, p_amount numeric, p_from date, p_scope text, p_notify boolean, p_plan text default 'pro')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_super_admin();
  cur numeric := public.current_plan_price(p_plan, p_currency);
  new_id uuid;
  v_owner uuid;
  from_ts timestamptz := (p_from::timestamp at time zone 'America/Argentina/Buenos_Aires');
begin
  if p_plan not in ('pro', 'enterprise') then raise exception 'Plan inválido.'; end if;
  if p_currency not in ('USD', 'ARS') then raise exception 'Moneda inválida.'; end if;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) <> p_amount then raise exception 'Usá un número mayor a 0, con hasta 2 decimales'; end if;
  if p_amount = cur then raise exception 'Es igual al precio vigente'; end if;
  if p_from is null then raise exception 'Elegí una fecha'; end if;
  if p_from <= (now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'La fecha tiene que ser posterior a hoy'; end if;
  if p_scope not in ('all', 'new') then raise exception 'Alcance inválido.'; end if;
  if exists (select 1 from public.price_schedule where plan = p_plan and currency = p_currency and cancelled_at is null
             and (effective_from at time zone 'America/Argentina/Buenos_Aires')::date = p_from) then
    raise exception 'Ya hay un cambio programado para ese día';
  end if;
  insert into public.price_schedule (plan, currency, amount, effective_from, scope, notify, created_by)
  values (p_plan, p_currency, p_amount, from_ts, p_scope, p_notify, uid) returning id into new_id;

  -- Only subscribers of that plan, paying in that currency at list price (Enterprise assigned by Boxinger is billed outside).
  if p_notify and p_scope = 'all' then
    for v_owner in select a.owner_id from public.accounts a join public.subscriptions s on s.account_id = a.id
                 where s.currency = p_currency and s.plan = p_plan and coalesce(s.provider, 'manual') <> 'manual'
                   and public.account_is_pro(a.id) and s.deal_type is null loop
      perform public.enqueue_email(v_owner, 'price_change', jsonb_build_object('currency', p_currency, 'old', cur, 'new', p_amount, 'from', from_ts, 'plan', p_plan),
        null, 'price:' || new_id || ':' || v_owner);
    end loop;
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'price_scheduled', 'price', new_id, jsonb_build_object('plan', p_plan, 'currency', p_currency, 'amount', p_amount, 'from', p_from, 'scope', p_scope));
  return new_id;
end $$;
grant execute on function public.admin_schedule_price(text, numeric, date, text, boolean, text) to authenticated;

-- Admin › Suscripciones: Pro (as before) and Enterprise, each with its current price, history and active subscriptions.
create or replace function public.admin_plan_prices(p_plan text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'current', jsonb_build_object('USD', public.current_plan_price(p_plan, 'USD'), 'ARS', public.current_plan_price(p_plan, 'ARS')),
    'current_since', jsonb_build_object(
      'USD', (select effective_from from public.price_schedule where plan = p_plan and currency = 'USD' and cancelled_at is null and effective_from <= now() order by effective_from desc limit 1),
      'ARS', (select effective_from from public.price_schedule where plan = p_plan and currency = 'ARS' and cancelled_at is null and effective_from <= now() order by effective_from desc limit 1)),
    -- Active subscriptions paying this plan through a provider (manual Enterprise is billed outside).
    'pro_count', jsonb_build_object(
      'USD', (select count(*) from public.subscriptions s where s.currency = 'USD' and s.plan = p_plan and (p_plan = 'pro' or s.provider in ('creem', 'paypal')) and public.account_is_pro(s.account_id)),
      'ARS', (select count(*) from public.subscriptions s where s.currency = 'ARS' and s.plan = p_plan and (p_plan = 'pro' or s.provider = 'mercadopago') and public.account_is_pro(s.account_id))),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'currency', p.currency, 'amount', p.amount, 'effective_from', p.effective_from, 'scope', p.scope,
        'notify', p.notify, 'applied_at', p.applied_at,
        'state', case
          when p.effective_from > now() then 'scheduled'
          when p.id = (select id from public.price_schedule x where x.plan = p.plan and x.currency = p.currency and x.cancelled_at is null and x.effective_from <= now()
                       order by x.effective_from desc, x.created_at desc limit 1) then 'current'
          else 'previous' end) order by p.effective_from desc)
      from public.price_schedule p where p.plan = p_plan and p.cancelled_at is null), '[]'));
$$;
revoke execute on function public.admin_plan_prices(text) from public, anon, authenticated;

create or replace function public.admin_prices()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return public.admin_plan_prices('pro') || jsonb_build_object('enterprise', public.admin_plan_prices('enterprise'));
end $$;

-- The app gets the Enterprise price too.
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
    'unread_notifications', (select count(*) from public.notifications where user_id = uid and read_at is null),
    'me', jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url, 'is_super_admin', p.is_super_admin,
      'status', p.status, 'notif', p.notif, 'admin_notif', p.admin_notif, 'created_at', p.created_at, 'providers', providers,
      'onboarding_skipped', p.onboarding_skipped_at is not null, 'locale', p.locale),
    'account', case when acc.id is null then null else jsonb_build_object(
      'id', acc.id, 'name', acc.name, 'status', acc.status, 'created_at', acc.created_at,
      'pro', public.account_is_pro(acc.id),
      'plan', public.account_plan(acc.id),
      'member_limit', public.account_member_limit(acc.id),
      'free_board', public.account_first_board(acc.id),
      'subscription', (select to_jsonb(s) - 'provider_plan_id' || jsonb_build_object('effective_amount', public.effective_amount(s))
                       from public.subscriptions s where s.account_id = acc.id)) end,
    'teams', teams,
    'guest_boards', guest_boards,
    'prices', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS')),
    'enterprise_prices', jsonb_build_object('USD', public.current_plan_price('enterprise', 'USD'), 'ARS', public.current_plan_price('enterprise', 'ARS'))
  );
end $$;
