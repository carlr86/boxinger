-- Refunds (Creem and Mercado Pago) on a recorded charge: the amount stays as charged and refunded_amount
-- says how much went back. Fully refunded charges have status 'refunded'. Billed = amount − refunded.
alter table public.payments add column refunded_amount numeric(12, 2) not null default 0;

create or replace function public.admin_client_detail(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        'members', (select count(*) from public.team_members where team_id = t.id and role = 'member'),
        'created_at', b.created_at, 'last_activity_at', b.last_activity_at) order by t.created_at, b.created_at)
      from public.boards b join public.teams t on t.id = b.team_id where t.account_id = a.id), '[]'),
    'activation_token', (select token from public.invitations where kind = 'client' and account_id = a.id and accepted_at is null and revoked_at is null order by created_at desc limit 1)
  );
end $$;
