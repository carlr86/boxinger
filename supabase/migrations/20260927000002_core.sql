-- Boxinger · helpers, triggers and RLS read policies

-- ───────────────────────── profiles from auth ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)), 60),
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ───────────────────────── plan & access ─────────────────────────
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.account_is_pro(p_account uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.account_id = p_account and s.plan = 'pro'
      and (s.status in ('active', 'past_due') or (s.status = 'cancelled' and s.current_period_end > now()))
  );
$$;

-- On Free only the account's first board (first team, oldest board) stays unlocked.
create or replace function public.account_first_board(p_account uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select b.id from public.boards b join public.teams t on t.id = b.team_id
  where t.account_id = p_account
  order by t.created_at, b.created_at, b.id
  limit 1;
$$;

create type public.board_ctx as (
  board_id uuid,
  team_id uuid,
  account_id uuid,
  owner_id uuid,
  visibility text,
  board_status text,
  account_status text,
  pro boolean,
  locked boolean,
  role text          -- admin | member | guest | blocked | null
);

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
    elsif c.visibility = 'public' then c.role := 'guest';
    end if;
  end if;
  return c;
end $$;

create or replace function public.require_user()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  st text;
begin
  if uid is null then raise exception 'Necesitás iniciar sesión.' using errcode = '28000'; end if;
  select status into st from public.profiles where id = uid;
  if st is null then raise exception 'Tu cuenta no existe.' using errcode = '28000'; end if;
  if st = 'blocked' then raise exception 'Tu cuenta está bloqueada.'; end if;
  return uid;
end $$;

create or replace function public.require_super_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.require_user();
begin
  if not public.is_super_admin() then raise exception 'Solo el Admin de plataforma puede hacer esto.' using errcode = '42501'; end if;
  return uid;
end $$;

-- Board that must accept writes: active board, active account, not locked by the plan.
create or replace function public.writable_board(p_board uuid, p_uid uuid)
returns public.board_ctx language plpgsql stable security definer set search_path = public as $$
declare c public.board_ctx := public.board_context(p_board, p_uid);
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if c.board_status <> 'active' or c.account_status <> 'active' then
    raise exception 'Este buzón está suspendido y queda en solo lectura.';
  end if;
  if c.locked then raise exception 'Este buzón requiere el plan Pro.'; end if;
  return c;
end $$;

create or replace function public.require_team(p_board uuid)
returns public.board_ctx language plpgsql security definer set search_path = public as $$
declare c public.board_ctx := public.writable_board(p_board, public.require_user());
begin
  if c.role not in ('admin', 'member') or c.role is null then raise exception 'Solo el Equipo puede hacer esto.' using errcode = '42501'; end if;
  return c;
end $$;

create or replace function public.require_board_admin(p_board uuid)
returns public.board_ctx language plpgsql security definer set search_path = public as $$
declare c public.board_ctx := public.board_context(p_board, public.require_user());
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if c.role is distinct from 'admin' then raise exception 'Solo el Admin del equipo puede hacer esto.' using errcode = '42501'; end if;
  return c;
end $$;

-- Community participation (vote, comment, idea). Registered, verified, not blocked.
-- A signed-in user who participates in a public board becomes an Invitado of it.
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
    insert into public.board_guests (board_id, user_id, via) values (p_board, uid, 'participation')
      on conflict (board_id, user_id) do nothing;
    c.role := 'guest';
  end if;
  return c;
end $$;

create or replace function public.rate_limit(p_what text, p_count int, p_max int)
returns void language plpgsql as $$
begin
  if p_count >= p_max then
    raise exception 'Demasiadas acciones seguidas (%). Esperá un momento y volvé a intentar.', p_what using errcode = '54000';
  end if;
end $$;

-- ───────────────────────── activity ─────────────────────────
create or replace function public.touch_board(p_board uuid)
returns void language sql security definer set search_path = public as $$
  with b as (update public.boards set last_activity_at = now() where id = p_board returning team_id)
  update public.accounts a set last_activity_at = now()
  from public.teams t, b where t.id = b.team_id and a.id = t.account_id;
$$;

create or replace function public.trg_touch_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'ideas' then
    perform public.touch_board(new.board_id);
  else
    perform public.touch_board((select board_id from public.ideas where id = new.idea_id));
  end if;
  return null;
end $$;

create trigger ideas_activity after insert or update on public.ideas for each row execute function public.trg_touch_activity();
create trigger votes_activity after insert or update on public.votes for each row execute function public.trg_touch_activity();
create trigger comments_activity after insert on public.comments for each row execute function public.trg_touch_activity();

-- ───────────────────────── email outbox ─────────────────────────
create or replace function public.enqueue_email(p_user uuid, p_template text, p_payload jsonb, p_pref text default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  e text; n jsonb; st text;
begin
  select email, notif, status into e, n, st from public.profiles where id = p_user;
  if e is null or st = 'blocked' then return; end if;
  if p_pref is not null and coalesce((n ->> p_pref)::boolean, true) = false then return; end if;
  insert into public.email_outbox (to_email, user_id, template, payload, dedupe_key)
  values (e, p_user, p_template, coalesce(p_payload, '{}'), p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function public.enqueue_email_to(p_email text, p_template text, p_payload jsonb, p_dedupe text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.email_outbox (to_email, template, payload, dedupe_key)
  values (lower(p_email), p_template, coalesce(p_payload, '{}'), p_dedupe)
  on conflict (dedupe_key) do nothing;
$$;

-- Claims pending emails for the dispatcher (service role only).
create or replace function public.claim_outbox(p_limit int default 50)
returns setof public.email_outbox language sql security definer set search_path = public as $$
  update public.email_outbox o set status = 'sending', attempts = o.attempts + 1
  where o.id in (
    select id from public.email_outbox
    where (status = 'pending' and send_after <= now())
       or (status = 'sending' and attempts < 5 and send_after <= now() - interval '10 minutes')
    order by id
    limit p_limit
    for update skip locked
  )
  returning o.*;
$$;

-- ───────────────────────── boards: slugs & defaults ─────────────────────────
create or replace function public.make_slug(p_name text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  base text;
  s text;
  n int := 1;
begin
  base := trim(both '-' from regexp_replace(lower(unaccent(coalesce(p_name, ''))), '[^a-z0-9]+', '-', 'g'));
  base := trim(both '-' from left(base, 50));
  if base = '' then base := 'buzon'; end if;
  s := base;
  while exists (select 1 from public.boards where slug = s) or s in ('admin', 'nuevo', 'api', 'app') loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end $$;

create or replace function public.seed_categories(p_board uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (board_id, name, key, position) values
    (p_board, 'Feature', 'feature', 0),
    (p_board, 'Mejora funcional', 'mejora', 1),
    (p_board, 'Propuesta', 'propuesta', 2)
  on conflict do nothing;
$$;

-- ───────────────────────── pricing ─────────────────────────
create or replace function public.current_price(p_currency text)
returns numeric language sql stable security definer set search_path = public as $$
  select amount from public.price_schedule
  where currency = p_currency and cancelled_at is null and effective_from <= now()
  order by effective_from desc, created_at desc
  limit 1;
$$;

create or replace function public.effective_amount(s public.subscriptions)
returns numeric language sql stable as $$
  select case
    when s.plan <> 'pro' then 0
    when s.deal_type is not null and (s.deal_until is null or s.deal_until > now()) then
      case when s.deal_type = 'fixed' then s.deal_value
           else round(coalesce(s.list_amount, public.current_price(s.currency)) * (1 - s.deal_value / 100), 2) end
    else coalesce(s.list_amount, public.current_price(s.currency))
  end;
$$;

insert into public.price_schedule (currency, amount, effective_from, scope, notify, applied_at) values
  ('USD', 9.99, '2026-01-01', 'all', false, now()),
  ('ARS', 14999, '2026-01-01', 'all', false, now());

-- ───────────────────────── RLS read policies ─────────────────────────
-- Reads for the app go through SECURITY DEFINER functions; these policies only cover
-- what the browser reads directly.
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_super_admin());
create policy "public prices" on public.price_schedule for select to anon, authenticated using (cancelled_at is null);
create policy "own account" on public.accounts for select using (owner_id = auth.uid() or public.is_super_admin());
create policy "own subscription" on public.subscriptions for select using (
  exists (select 1 from public.accounts a where a.id = account_id and a.owner_id = auth.uid()) or public.is_super_admin()
);
create policy "own favorites" on public.board_favorites for select using (user_id = auth.uid());

-- Functions are callable by signed-in users; internal helpers are revoked below.
revoke execute on function public.claim_outbox(int) from public, anon, authenticated;
revoke execute on function public.enqueue_email(uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.enqueue_email_to(text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.touch_board(uuid) from public, anon, authenticated;
revoke execute on function public.make_slug(text) from public, anon, authenticated;
revoke execute on function public.seed_categories(uuid) from public, anon, authenticated;
revoke execute on function public.participate(uuid) from public, anon, authenticated;
revoke execute on function public.require_team(uuid) from public, anon, authenticated;
revoke execute on function public.require_board_admin(uuid) from public, anon, authenticated;
revoke execute on function public.writable_board(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.board_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.current_price(text) to anon, authenticated;
