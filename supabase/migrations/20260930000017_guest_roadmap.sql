-- Boxinger · Invitados can see the Roadmap (read only) when the board allows it.
-- boards.guests_can_view_roadmap (default off) only works on Pro boards, like the Roadmap itself.
-- Non-team viewers then get each idea's roadmap column and development status, never the team's
-- internal planning fields (priority, impact, effort, score, design/PRD, growth).

alter table public.boards add column guests_can_view_roadmap boolean not null default false;

create or replace function public.board_roadmap_public(p_board uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(b.guests_can_view_roadmap and b.visibility <> 'private' and public.account_is_pro(t.account_id), false)
  from public.boards b join public.teams t on t.id = b.team_id where b.id = p_board;
$$;

create or replace function public.set_board_roadmap_public(p_board uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.board_ctx := public.require_board_admin(p_board);
begin
  perform public.writable_board(p_board, auth.uid());
  if p_on and not c.pro then raise exception 'El Roadmap está disponible en Pro.'; end if;
  if p_on and c.visibility = 'private' then raise exception 'Los buzones privados no tienen invitados.'; end if;
  update public.boards set guests_can_view_roadmap = coalesce(p_on, false) where id = p_board;
end $$;


create or replace function public.idea_json(i public.ideas, p_uid uuid, p_team boolean, p_rank int)
returns jsonb language sql stable security definer set search_path = public as $$
  with v as (
    select count(*) filter (where value = 'importante') as imp,
           count(*) filter (where value = 'interesante') as inte,
           count(*) filter (where value = 'no_importante') as noimp
    from public.votes where idea_id = i.id
  )
  select jsonb_build_object(
    'id', i.id, 'board_id', i.board_id, 'title', i.title, 'description', i.description, 'category_id', i.category_id,
    'origin', i.origin, 'status', i.status, 'reject_reason', i.reject_reason, 'approved_at', i.approved_at,
    'hidden', i.hidden, 'created_at', i.created_at, 'author_id', i.author_id,
    'author_name', coalesce((select name from public.profiles where id = i.author_id), 'Usuario eliminado'),
    'votes', v.imp + v.inte + v.noimp,
    'comments', (select count(*) from public.comments c
                 where c.idea_id = i.id and (not c.deleted or exists (select 1 from public.comment_replies r where r.comment_id = c.id))
                   and (p_team or not c.hidden)),
    'my_vote', (select value from public.votes where idea_id = i.id and user_id = p_uid),
    'rank', p_rank
  ) || case when p_team then jsonb_build_object(
    'importante', v.imp, 'interesante', v.inte, 'no_importante', v.noimp, 'score', 2 * v.imp + v.inte,
    'impact', i.impact, 'effort', i.effort, 'rm_col', i.rm_col, 'rm_order', i.rm_order, 'priority', i.priority,
    'dev_status', i.dev_status, 'dev_at', i.dev_at, 'launched_at', i.launched_at,
    'chk_design', i.chk_design, 'chk_prd', i.chk_prd, 'growth', to_jsonb(i.growth))
    when public.board_roadmap_public(i.board_id) then jsonb_build_object(
    'rm_col', i.rm_col, 'rm_order', i.rm_order, 'dev_status', i.dev_status, 'launched_at', i.launched_at)
    else '{}'::jsonb end
  from v;
$$;

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
    return jsonb_build_object('forbidden', true, 'visibility', b.visibility, 'signed_in', uid is not null);
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

revoke execute on function public.board_roadmap_public(uuid) from public, anon, authenticated;
revoke execute on function public.idea_json(public.ideas, uuid, boolean, int) from public, anon, authenticated;
grant execute on function public.set_board_roadmap_public(uuid, boolean) to authenticated;

