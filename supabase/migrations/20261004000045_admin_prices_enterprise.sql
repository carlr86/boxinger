-- Boxinger · Admin › Suscripciones shows Enterprise next to Pro in each payment provider's card.

create or replace function public.admin_prices()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return jsonb_build_object(
    'current', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS')),
    'current_since', jsonb_build_object(
      'USD', (select effective_from from public.price_schedule where currency = 'USD' and cancelled_at is null and effective_from <= now() order by effective_from desc limit 1),
      'ARS', (select effective_from from public.price_schedule where currency = 'ARS' and cancelled_at is null and effective_from <= now() order by effective_from desc limit 1)),
    -- Enterprise bought on the web (Creem in USD, Mercado Pago in ARS); manual Enterprise is billed outside.
    'enterprise_count', jsonb_build_object(
      'USD', (select count(*) from public.subscriptions s where s.currency = 'USD' and s.plan = 'enterprise' and s.provider in ('creem', 'paypal') and public.account_is_pro(s.account_id)),
      'ARS', (select count(*) from public.subscriptions s where s.currency = 'ARS' and s.plan = 'enterprise' and s.provider = 'mercadopago' and public.account_is_pro(s.account_id))),
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
