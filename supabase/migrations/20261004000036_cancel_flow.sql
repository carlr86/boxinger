-- Cancellation flow and coming back:
-- * The owner chooses which board stays active on Free (accounts.free_board_id); otherwise the oldest one.
-- * Why they cancelled (reason + note) is kept for the platform admin.
-- * pro_usage(): what the account loses on Free and gets back with Pro (retention popup and emails).
alter table public.accounts add column free_board_id uuid references public.boards (id) on delete set null;
alter table public.accounts add column free_board_set_at timestamptz;
alter table public.subscriptions add column cancel_reason text;
alter table public.subscriptions add column cancel_note text;
alter table public.subscriptions add column cancelled_at timestamptz;

-- The board that stays active on Free: the chosen one if it still belongs to the account, else the oldest.
create or replace function public.account_first_board(p_account uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select b.id from public.accounts a join public.boards b on b.id = a.free_board_id join public.teams t on t.id = b.team_id
      where a.id = p_account and t.account_id = p_account),
    (select b.id from public.boards b join public.teams t on t.id = b.team_id
      where t.account_id = p_account order by t.created_at, b.created_at, b.id limit 1));
$$;

-- Owner only. While Pro (also when cancelled) any time; on Free once every 30 days.
create or replace function public.set_free_board(p_board uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  acc public.accounts;
begin
  select a.* into acc from public.accounts a join public.teams t on t.account_id = a.id join public.boards b on b.team_id = t.id
  where b.id = p_board and a.owner_id = public.require_user();
  if acc.id is null then raise exception 'Solo el dueño de la cuenta puede cambiar esto.'; end if;
  if public.account_first_board(acc.id) = p_board then return; end if;
  if not public.account_is_pro(acc.id) and acc.free_board_set_at > now() - interval '30 days' then
    raise exception 'En Free podés cambiar el buzón activo una vez cada 30 días.';
  end if;
  update public.accounts set free_board_id = p_board, free_board_set_at = now() where id = acc.id;
end $$;
revoke execute on function public.set_free_board(uuid) from public, anon;
grant execute on function public.set_free_board(uuid) to authenticated;

create or replace function public.pro_usage(p_account uuid)
returns jsonb language sql stable security definer set search_path = public as $$
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
    'members', (select count(distinct m.user_id) from public.team_members m join public.teams t on t.id = m.team_id where t.account_id = p_account and m.role = 'member'),
    'roadmap_ideas', (select count(*) from public.ideas i join bs on bs.id = i.board_id where i.rm_col is not null and i.status = 'aprobada'),
    'rated_ideas', (select count(*) from public.ideas i join bs on bs.id = i.board_id where i.impact > 0 or i.effort > 0),
    'domains', (select coalesce(sum(cardinality(b.allowed_domains)), 0) from public.boards b join bs on bs.id = b.id),
    'private_boards', (select count(*) from bs where visibility = 'private')
  );
$$;
revoke execute on function public.pro_usage(uuid) from public, anon, authenticated;

create or replace function public.my_pro_usage()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare acc uuid;
begin
  select id into acc from public.accounts where owner_id = public.require_user();
  if acc is null then return null; end if;
  return public.pro_usage(acc);
end $$;
revoke execute on function public.my_pro_usage() from public, anon;
grant execute on function public.my_pro_usage() to authenticated;

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
    'cancel', (select jsonb_build_object('reason', cancel_reason, 'note', cancel_note, 'at', cancelled_at) from public.subscriptions where account_id = a.id and cancelled_at is not null),
    'activation_token', (select token from public.invitations where kind = 'client' and account_id = a.id and accepted_at is null and revoked_at is null order by created_at desc limit 1)
  );
end $$;

-- The board that stays active on Free, for the selector in Mis Buzones / Mi perfil.
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
    'prices', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS'))
  );
end $$;
