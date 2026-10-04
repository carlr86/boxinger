-- Boxinger · Enterprise can be bought on the web (Creem USD 19.99 / Mercado Pago ARS 29.999 a month)
-- A paid Enterprise follows the same rules as a paid Pro: active or past due, or cancelled until the paid period
-- ends. Enterprise assigned by the platform admin (provider 'manual') stays on until the admin changes it.

create or replace function public.account_is_pro(p_account uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.account_id = p_account
      and s.plan in ('pro', 'enterprise')
      and ((s.plan = 'enterprise' and coalesce(s.provider, 'manual') = 'manual')
           or s.status in ('active', 'past_due')
           or (s.status = 'cancelled' and s.current_period_end > now()))
  );
$$;

create or replace function public.account_plan(p_account uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when not public.account_is_pro(p_account) then 'free'
    when exists (select 1 from public.subscriptions where account_id = p_account and plan = 'enterprise') then 'enterprise'
    else 'pro' end;
$$;
