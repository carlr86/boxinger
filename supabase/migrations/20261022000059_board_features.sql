-- Boxinger · Optional prioritization tools per board
-- Each board chooses whether it uses Impact / Effort (with the Matrix and the Roadmap's Value) and Growth. Both start on.
-- Turning one off only hides it in the app: ratings and growth already set on ideas stay, and come back when it's on again.
-- get_board starts from the production definition (pg_get_functiondef, 2026-10-18).

alter table public.boards add column use_rating boolean not null default true;
alter table public.boards add column use_growth boolean not null default true;

-- The board's Admin turns them on or off; null leaves that one as it is.
create or replace function public.set_board_features(p_board uuid, p_rating boolean default null, p_growth boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_board_admin(p_board);
  update public.boards set use_rating = coalesce(p_rating, use_rating), use_growth = coalesce(p_growth, use_growth) where id = p_board;
end $$;
grant execute on function public.set_board_features(uuid, boolean, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.get_board(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'created_by', b.created_by, 'members_can_create_ideas', b.members_can_create_ideas, 'guests_can_create_ideas', b.guests_can_create_ideas, 'allow_anonymous', b.allow_anonymous, 'use_rating', b.use_rating, 'use_growth', b.use_growth,
      'guests_can_view_roadmap', public.board_roadmap_public(b.id), 'roadmap_setting', b.guests_can_view_roadmap,
      'takes_requests', public.board_takes_requests(b.id),
      'vote_labels', b.vote_labels,
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
end $function$;
