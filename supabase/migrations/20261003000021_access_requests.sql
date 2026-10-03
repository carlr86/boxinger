-- Boxinger · "Solicitar acceso" for invite-only boards (Pro).
-- Someone without access asks to join; whoever manages the board (owner, team admins, the member
-- who created it) approves or rejects. Approved people become Invitados (via 'request').
-- Nothing about the board is revealed to the requester.

create table public.board_access_requests (
  id          bigint generated always as identity primary key,
  board_id    uuid not null references public.boards (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  message     text check (char_length(message) <= 500),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles (id) on delete set null
);
create unique index board_access_requests_pending on public.board_access_requests (board_id, user_id) where status = 'pending';
create index board_access_requests_user on public.board_access_requests (user_id, created_at desc);
alter table public.board_access_requests enable row level security;

alter table public.board_guests drop constraint board_guests_via_check;
alter table public.board_guests add constraint board_guests_via_check check (via in ('link', 'email', 'participation', 'domain', 'request'));

-- Whether a board takes access requests: invite-only, on Pro.
create or replace function public.board_takes_requests(p_board uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(b.visibility = 'invite' and public.account_is_pro(t.account_id), false)
  from public.boards b join public.teams t on t.id = b.team_id where b.id = p_board;
$$;

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
      'board_name', b.name, 'slug', b.slug, 'name', me.name, 'email', me.email, 'message', msg),
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
  if p_approve then
    perform public.join_guest(r.board_id, r.user_id, 'request');
    select * into b from public.boards where id = r.board_id;
    perform public.enqueue_email(r.user_id, 'access_granted', jsonb_build_object('board_name', b.name, 'slug', b.slug), null, 'access_ok:' || p_id);
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), case when p_approve then 'access_approved' else 'access_rejected' end, 'board', r.board_id, jsonb_build_object('user', r.user_id));
end $$;


create or replace function public.get_board(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b public.boards;
  c public.board_ctx;
  team boolean;
  ideas jsonb;
  me jsonb;
begin
  select * into b from public.boards where slug = lower(p_slug);
  if b.id is null then return null; end if;
  c := public.board_context(b.id, uid);
  if not public.can_see_board(c, b.visibility) then
    return jsonb_build_object('forbidden', true, 'visibility', b.visibility, 'signed_in', uid is not null,
      'can_request', public.board_takes_requests(b.id) and c.role is distinct from 'blocked',
      'request', (select status from public.board_access_requests where board_id = b.id and user_id = uid and uid is not null
                  and (status = 'pending' or (status = 'rejected' and decided_at > now() - interval '7 days'))
                  order by created_at desc limit 1));
  end if;
  team := coalesce(c.role in ('admin', 'member'), false);

  with scored as (
    select i.id,
           (select 2 * count(*) filter (where value = 'importante') + count(*) filter (where value = 'interesante') from public.votes where idea_id = i.id) as score,
           (select count(*) filter (where value = 'importante') from public.votes where idea_id = i.id) as imp,
           (select count(*) from public.votes where idea_id = i.id) as total,
           i.created_at
    from public.ideas i
    where i.board_id = b.id and i.status in ('pendiente', 'en_revision') and not i.hidden
  ), ranked as (
    select id, row_number() over (order by score desc, imp desc, total desc, created_at asc)::int as rk from scored
  )
  select coalesce(jsonb_agg(public.idea_json(i, uid, team, r.rk) order by i.created_at desc), '[]') into ideas
  from public.ideas i left join ranked r on r.id = i.id
  where i.board_id = b.id and (team or not i.hidden);

  if uid is not null then
    select jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url, 'is_super_admin', p.is_super_admin)
      into me from public.profiles p where p.id = uid;
  end if;

  return jsonb_build_object(
    'board', jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'description', b.description, 'logo_url', b.logo_url,
      'visibility', b.visibility, 'status', b.status, 'color', b.color, 'roadmap_names', b.roadmap_names,
      'team_id', b.team_id, 'team_name', (select name from public.teams where id = b.team_id),
      'account_status', c.account_status, 'locked', c.locked, 'pro', c.pro, 'created_at', b.created_at,
      'invite_code', case when team then b.invite_code end,
      'created_by', b.created_by, 'members_can_create_ideas', b.members_can_create_ideas, 'guests_can_create_ideas', b.guests_can_create_ideas,
      'guests_can_view_roadmap', public.board_roadmap_public(b.id), 'roadmap_setting', b.guests_can_view_roadmap,
      'takes_requests', public.board_takes_requests(b.id),
      'pending_requests', case when public.board_can_manage(b.id, uid) then
        (select count(*) from public.board_access_requests r where r.board_id = b.id and r.status = 'pending'
           and not exists (select 1 from public.board_guests g where g.board_id = b.id and g.user_id = r.user_id)) end,
      'allowed_domains', case when public.board_can_manage(b.id, uid) then to_jsonb(b.allowed_domains) end,
      'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
      'version', b.last_activity_at),
    'role', coalesce(c.role, case when public.is_super_admin() then 'super' end),
    'joined', uid is not null and exists (select 1 from public.board_guests where board_id = b.id and user_id = uid),
    'me', me,
    'perms', jsonb_build_object('can_manage', public.board_can_manage(b.id, uid), 'can_create_ideas', public.board_can_create_idea(b.id, uid)),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'key', k.key) order by k.position, k.created_at)
                            from public.categories k where k.board_id = b.id), '[]'),
    'ideas', ideas
  );
end $$;

create or replace function public.get_board_community(p_board uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.board_ctx := public.board_context(p_board, public.require_user());
begin
  if c.role not in ('admin', 'member') or c.role is null then raise exception 'Solo el Equipo puede ver la Comunidad.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'guests', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', g.user_id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url,
                                          'joined_at', g.joined_at, 'status', g.status) order by g.joined_at desc)
      from public.board_guests g join public.profiles p on p.id = g.user_id where g.board_id = p_board), '[]'),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'created_at', i.created_at) order by i.created_at desc)
      from public.invitations i where i.kind = 'guest' and i.board_id = p_board and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'),
    'invite_code', (select invite_code from public.boards where id = p_board),
    'requests', case when public.board_can_manage(p_board, auth.uid()) then coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'user_id', r.user_id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url,
                                          'message', r.message, 'created_at', r.created_at) order by r.created_at)
      from public.board_access_requests r join public.profiles p on p.id = r.user_id
      where r.board_id = p_board and r.status = 'pending'
        and not exists (select 1 from public.board_guests g where g.board_id = p_board and g.user_id = r.user_id)), '[]') end
  );
end $$;

create or replace function public.update_notifications(p_notif jsonb, p_admin boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  keys text[] := case when p_admin then array['clients', 'payfail', 'churn', 'weekly'] else array['comments', 'replies', 'status', 'digest', 'requests'] end;
  clean jsonb := '{}';
  k text;
begin
  if p_admin then perform public.require_super_admin(); end if;
  foreach k in array keys loop
    if p_notif ? k then clean := clean || jsonb_build_object(k, (p_notif ->> k)::boolean); end if;
  end loop;
  if p_admin then
    update public.profiles set admin_notif = admin_notif || clean where id = uid;
  else
    update public.profiles set notif = notif || clean where id = uid;
  end if;
end $$;

revoke execute on function public.board_takes_requests(uuid) from public, anon, authenticated;
grant execute on function public.request_board_access(text, text) to authenticated;
grant execute on function public.decide_access_request(bigint, boolean) to authenticated;

