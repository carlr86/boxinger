-- Boxinger · in-app notifications (the bell).
-- Every event that already emails someone through enqueue_email also lands here for the kinds below,
-- before the email preference is checked: turning an email off never hides the in-app notice.

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  payload     jsonb not null default '{}',
  dedupe_key  text unique,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;


create or replace function public.enqueue_email(p_user uuid, p_template text, p_payload jsonb, p_pref text default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  e text; n jsonb; st text;
begin
  select email, notif, status into e, n, st from public.profiles where id = p_user;
  if e is null or st = 'blocked' then return; end if;
  if p_template in ('access_request', 'access_granted', 'new_comment', 'team_reply', 'idea_status', 'idea_launched') then
    insert into public.notifications (user_id, kind, payload, dedupe_key)
    values (p_user, p_template, coalesce(p_payload, '{}'), case when p_dedupe is not null then 'n:' || p_dedupe end)
    on conflict (dedupe_key) do nothing;
  end if;
  if p_pref is not null and coalesce((n ->> p_pref)::boolean, true) = false then return; end if;
  insert into public.email_outbox (to_email, user_id, template, payload, dedupe_key)
  values (e, p_user, p_template, coalesce(p_payload, '{}'), p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function public.request_board_access(p_slug text, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  b public.boards;
  c public.board_ctx;
  r public.board_access_requests;
  n int;
  msg text := nullif(left(trim(coalesce(p_message, '')), 500), '');
  me public.profiles;
  admin_id uuid;
begin
  if (select email_confirmed_at from auth.users where id = uid) is null then raise exception 'Verificá tu email para solicitar acceso.'; end if;
  select * into b from public.boards where slug = lower(p_slug);
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  c := public.board_context(b.id, uid);
  if c.role = 'blocked' then raise exception 'No podés solicitar acceso a este buzón.' using errcode = '42501'; end if;
  if c.role is not null then return c.role; end if;
  if not public.board_takes_requests(b.id) then raise exception 'Este buzón no recibe solicitudes de acceso.'; end if;
  if exists (select 1 from public.board_access_requests where board_id = b.id and user_id = uid and status = 'pending') then return 'pending'; end if;
  if exists (select 1 from public.board_access_requests where board_id = b.id and user_id = uid and status = 'rejected' and decided_at > now() - interval '7 days') then
    raise exception 'El equipo no aprobó tu solicitud. Podés volver a pedir acceso más adelante.';
  end if;
  select count(*) into n from public.board_access_requests where user_id = uid and created_at > now() - interval '1 day';
  perform public.rate_limit('solicitudes de acceso', n, 10);

  insert into public.board_access_requests (board_id, user_id, message) values (b.id, uid, msg) returning * into r;
  select * into me from public.profiles where id = uid;
  for admin_id in
    select distinct x.id from (
      select a.owner_id as id from public.teams t join public.accounts a on a.id = t.account_id where t.id = b.team_id
      union select tm.user_id from public.team_members tm where tm.team_id = b.team_id and tm.role = 'admin'
      union select b.created_by
    ) x where x.id is not null and public.board_can_manage(b.id, x.id)
  loop
    perform public.enqueue_email(admin_id, 'access_request', jsonb_build_object(
      'board_name', b.name, 'slug', b.slug, 'name', me.name, 'email', me.email, 'message', msg, 'request_id', r.id),
      'requests', 'access_req:' || r.id || ':' || admin_id);
  end loop;
  return 'pending';
end $$;

create or replace function public.decide_access_request(p_id bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.board_access_requests;
  c public.board_ctx;
  b public.boards;
begin
  select * into r from public.board_access_requests where id = p_id;
  if r.id is null then raise exception 'La solicitud no existe.'; end if;
  c := public.require_board_admin(r.board_id);
  if r.status <> 'pending' then raise exception 'La solicitud ya fue respondida.'; end if;
  update public.board_access_requests set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = auth.uid()
  where id = p_id;
  -- the notice is resolved for every admin who got it
  update public.notifications set read_at = coalesce(read_at, now()),
         payload = payload || jsonb_build_object('resolved', case when p_approve then 'approved' else 'rejected' end)
  where kind = 'access_request' and payload ->> 'request_id' = p_id::text;
  if p_approve then
    perform public.join_guest(r.board_id, r.user_id, 'request');
    select * into b from public.boards where id = r.board_id;
    perform public.enqueue_email(r.user_id, 'access_granted', jsonb_build_object('board_name', b.name, 'slug', b.slug), null, 'access_ok:' || p_id);
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), case when p_approve then 'access_approved' else 'access_rejected' end, 'board', r.board_id, jsonb_build_object('user', r.user_id));
end $$;

create or replace function public.update_idea_plan(p_id bigint, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  c public.board_ctx;
  b public.boards;
  new_dev text;
  new_growth text[];
  voter uuid;
begin
  select * into i from public.ideas where id = p_id for update;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  c := public.require_team(i.board_id);
  if not c.pro then raise exception 'Disponible en el plan Pro.'; end if;
  new_dev := coalesce(p_patch ->> 'dev_status', i.dev_status);
  if new_dev not in ('por_empezar', 'en_curso', 'lanzada') then raise exception 'Estado de desarrollo inválido.'; end if;
  if p_patch ? 'priority' and nullif(p_patch ->> 'priority', '') not in ('alta', 'media', 'baja') then raise exception 'Prioridad inválida.'; end if;
  if p_patch ? 'growth' then
    if jsonb_typeof(p_patch -> 'growth') <> 'array' then raise exception 'Growth inválido.'; end if;
    new_growth := array(select distinct g from jsonb_array_elements_text(p_patch -> 'growth') g order by 1);
    if not new_growth <@ array['adquisicion', 'activacion', 'retencion', 'monetizacion', 'churn'] then raise exception 'Growth inválido.'; end if;
  end if;

  update public.ideas set
    impact = coalesce((p_patch ->> 'impact')::smallint, impact),
    effort = coalesce((p_patch ->> 'effort')::smallint, effort),
    priority = case when p_patch ? 'priority' then nullif(p_patch ->> 'priority', '') else priority end,
    chk_design = coalesce((p_patch ->> 'chk_design')::boolean, chk_design),
    chk_prd = coalesce((p_patch ->> 'chk_prd')::boolean, chk_prd),
    growth = case when p_patch ? 'growth' then new_growth else growth end,
    dev_status = new_dev,
    dev_at = case when new_dev <> i.dev_status then now() else dev_at end,
    launched_at = case when new_dev = 'lanzada' then coalesce(case when i.dev_status = 'lanzada' then launched_at end, now()) else null end,
    updated_at = now()
  where id = p_id;

  if new_dev = 'lanzada' and i.dev_status <> 'lanzada' then
    select * into b from public.boards where id = i.board_id;
    -- voters and whoever proposed it
    for voter in select user_id from public.votes where idea_id = p_id union select i.author_id where i.author_id is not null loop
      perform public.enqueue_email(voter, 'idea_launched', jsonb_build_object('idea_id', i.id, 'title', i.title, 'board_name', b.name, 'slug', b.slug, 'mine', voter = i.author_id),
        'status', 'launch:' || p_id || ':' || voter);
    end loop;
  end if;
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
    'unread_notifications', (select count(*) from public.notifications where user_id = uid and read_at is null),
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

create or replace function public.get_notifications(p_limit int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'payload', n.payload, 'created_at', n.created_at, 'read', n.read_at is not null)
                            order by n.created_at desc), '[]')
  from (select * from public.notifications where user_id = public.require_user()
        order by created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)) n;
$$;

create or replace function public.notifications_unread()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_user(); n int;
begin
  update public.notifications set read_at = now()
  where user_id = uid and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.get_notifications(int) to authenticated;
grant execute on function public.notifications_unread() to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
revoke execute on function public.enqueue_email(uuid, text, jsonb, text, text) from public, anon, authenticated;

