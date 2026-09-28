-- Boxinger · app API (RPC). Every function checks permissions itself.

-- ───────────────────────── reads ─────────────────────────

create or replace function public.board_card(p_board uuid, p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'description', b.description, 'logo_url', b.logo_url,
    'visibility', b.visibility, 'status', b.status, 'color', b.color, 'team_id', b.team_id, 'team_name', t.name,
    'created_at', b.created_at,
    'last_activity_at', greatest(b.last_activity_at, (select max(created_at) from public.ideas where board_id = b.id)),
    'ideas', (select count(*) from public.ideas where board_id = b.id and not hidden),
    'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
    'fav', exists (select 1 from public.board_favorites f where f.board_id = b.id and f.user_id = p_uid),
    'locked', (x.c).locked,
    'account_status', (x.c).account_status,
    'role', (x.c).role
  )
  from public.boards b
  join public.teams t on t.id = b.team_id
  cross join lateral (select public.board_context(b.id, p_uid) as c) x
  where b.id = p_board;
$$;

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
  where g.user_id = uid and g.status = 'active' and b.visibility = 'public'
    and (public.board_context(g.board_id, uid)).role = 'guest';

  return jsonb_build_object(
    'me', jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url, 'is_super_admin', p.is_super_admin,
      'status', p.status, 'notif', p.notif, 'admin_notif', p.admin_notif, 'created_at', p.created_at, 'providers', providers),
    'account', case when acc.id is null then null else jsonb_build_object(
      'id', acc.id, 'name', acc.name, 'status', acc.status, 'created_at', acc.created_at,
      'pro', public.account_is_pro(acc.id),
      'subscription', (select to_jsonb(s) - 'provider_plan_id' || jsonb_build_object('effective_amount', public.effective_amount(s))
                       from public.subscriptions s where s.account_id = acc.id)) end,
    'teams', teams,
    'guest_boards', guest_boards,
    'prices', jsonb_build_object('USD', public.current_price('USD'), 'ARS', public.current_price('ARS'))
  );
end $$;

create or replace function public.can_see_board(c public.board_ctx, p_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_visibility = 'public' or coalesce(c.role in ('admin', 'member'), false) or public.is_super_admin();
$$;

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
    'chk_design', i.chk_design, 'chk_prd', i.chk_prd) else '{}'::jsonb end
  from v;
$$;

-- Everything the board screen needs: board, role, categories and ideas with counts.
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
    return jsonb_build_object('forbidden', true, 'name', b.name);
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
      'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
      'version', b.last_activity_at),
    'role', coalesce(c.role, case when public.is_super_admin() then 'super' end),
    'me', me,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'key', k.key) order by k.position, k.created_at)
                            from public.categories k where k.board_id = b.id), '[]'),
    'ideas', ideas
  );
end $$;

create or replace function public.board_version(p_board uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select last_activity_at from public.boards where id = p_board;
$$;

create or replace function public.get_idea(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  i public.ideas;
  b public.boards;
  c public.board_ctx;
  team boolean;
  comments jsonb;
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then return null; end if;
  select * into b from public.boards where id = i.board_id;
  c := public.board_context(i.board_id, uid);
  if not public.can_see_board(c, b.visibility) then return null; end if;
  team := coalesce(c.role in ('admin', 'member'), false);
  if i.hidden and not team then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', cm.id,
      'author_id', cm.author_id,
      'author_name', case when cm.deleted then 'Comentario eliminado' else coalesce(pa.name, 'Usuario eliminado') end,
      'author_avatar', pa.avatar_url,
      'author_team', coalesce((public.board_context(i.board_id, cm.author_id)).role in ('admin', 'member'), false),
      'body', case when cm.deleted then null else cm.body end,
      'deleted', cm.deleted, 'edited', cm.edited, 'hidden', cm.hidden, 'created_at', cm.created_at,
      'likes', (select count(*) from public.reactions x where x.comment_id = cm.id and x.value = 'like'),
      'dislikes', (select count(*) from public.reactions x where x.comment_id = cm.id and x.value = 'no_like'),
      'my_reaction', (select value from public.reactions x where x.comment_id = cm.id and x.user_id = uid),
      'reply', case when r.id is null then null else jsonb_build_object(
        'id', r.id, 'author_id', r.author_id, 'author_name', coalesce(pr.name, 'Equipo'), 'body', r.body,
        'edited', r.edited, 'created_at', r.created_at,
        'likes', (select count(*) from public.reactions x where x.reply_id = r.id and x.value = 'like'),
        'dislikes', (select count(*) from public.reactions x where x.reply_id = r.id and x.value = 'no_like'),
        'my_reaction', (select value from public.reactions x where x.reply_id = r.id and x.user_id = uid)) end
    ) order by cm.created_at), '[]')
    into comments
  from public.comments cm
  left join public.comment_replies r on r.comment_id = cm.id
  left join public.profiles pa on pa.id = cm.author_id
  left join public.profiles pr on pr.id = r.author_id
  where cm.idea_id = i.id and (not cm.deleted or r.id is not null) and (team or not cm.hidden);

  return public.idea_json(i, uid, team, null) || jsonb_build_object(
    'board_slug', b.slug,
    'comment_list', comments,
    'history', case when team then coalesce((
      select jsonb_agg(jsonb_build_object('from', s.from_status, 'to', s.to_status, 'at', s.created_at, 'reason', s.reason) order by s.created_at)
      from public.status_changes s where s.idea_id = i.id), '[]') end
  );
end $$;

-- ───────────────────────── ideas ─────────────────────────

create or replace function public.create_idea(p_board uuid, p_title text, p_description text, p_category uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.participate(p_board);
  uid uuid := auth.uid();
  t text := trim(coalesce(p_title, ''));
  d text := trim(coalesce(p_description, ''));
  n int;
  new_id bigint;
begin
  if char_length(t) not between 5 and 80 then raise exception 'El título debe tener entre 5 y 80 caracteres'; end if;
  if char_length(d) not between 20 and 2000 then raise exception 'La descripción debe tener entre 20 y 2.000 caracteres'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = p_board) then raise exception 'Elegí una categoría'; end if;
  select count(*) into n from public.ideas where author_id = uid and created_at > now() - interval '10 minutes';
  perform public.rate_limit('ideas', n, 5);
  insert into public.ideas (board_id, author_id, origin, title, description, category_id)
  values (p_board, uid, case when c.role in ('admin', 'member') then 'equipo' else 'comunidad' end, t, d, p_category)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.update_idea(p_id bigint, p_title text, p_description text, p_category uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  t text := trim(coalesce(p_title, ''));
  d text := trim(coalesce(p_description, ''));
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  perform public.require_team(i.board_id);
  if char_length(t) not between 5 and 80 then raise exception 'El título debe tener entre 5 y 80 caracteres'; end if;
  if char_length(d) not between 20 and 2000 then raise exception 'La descripción debe tener entre 20 y 2.000 caracteres'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = i.board_id) then raise exception 'Elegí una categoría'; end if;
  update public.ideas set title = t, description = d, category_id = p_category, updated_at = now() where id = p_id;
end $$;

create or replace function public.set_idea_hidden(p_id bigint, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare i public.ideas;
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  perform public.require_team(i.board_id);
  update public.ideas set hidden = p_hidden, updated_at = now() where id = p_id;
end $$;

create or replace function public.set_idea_status(p_id bigint, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  b public.boards;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into i from public.ideas where id = p_id for update;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  perform public.require_team(i.board_id);
  if p_status not in ('pendiente', 'en_revision', 'aprobada', 'rechazada') then raise exception 'Estado inválido.'; end if;
  if i.status = p_status then return; end if;
  if p_status = 'rechazada' and reason is null then raise exception 'El motivo es obligatorio'; end if;

  update public.ideas set
    status = p_status,
    reject_reason = case when p_status = 'rechazada' then reason end,
    approved_at = case when p_status = 'aprobada' then now() else approved_at end,
    rm_col = case when p_status = 'aprobada' then rm_col end,
    rm_order = case when p_status = 'aprobada' then rm_order end,
    updated_at = now()
  where id = p_id;

  insert into public.status_changes (idea_id, from_status, to_status, reason, user_id)
  values (p_id, i.status, p_status, case when p_status = 'rechazada' then reason end, auth.uid());

  if i.author_id is not null and i.author_id <> auth.uid() then
    select * into b from public.boards where id = i.board_id;
    perform public.enqueue_email(i.author_id, 'idea_status', jsonb_build_object(
      'idea_id', i.id, 'title', i.title, 'board_name', b.name, 'slug', b.slug,
      'from', i.status, 'to', p_status, 'reason', reason), 'status');
  end if;
end $$;

create or replace function public.vote(p_idea bigint, p_value text)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  c public.board_ctx;
  uid uuid;
  n int;
begin
  select * into i from public.ideas where id = p_idea;
  if i.id is null or i.hidden then raise exception 'La idea no existe.'; end if;
  c := public.participate(i.board_id);
  uid := auth.uid();
  if i.status not in ('pendiente', 'en_revision') then raise exception 'La votación está cerrada. Los votos quedaron congelados.'; end if;
  if c.role in ('admin', 'member') and i.origin = 'equipo' then raise exception 'El Equipo no vota ideas cargadas por el Equipo.'; end if;
  if i.author_id = uid then raise exception 'No podés votar tus propias ideas.'; end if;
  if p_value is null then
    delete from public.votes where idea_id = p_idea and user_id = uid;
    return;
  end if;
  if p_value not in ('importante', 'interesante', 'no_importante') then raise exception 'Voto inválido.'; end if;
  select count(*) into n from public.votes where user_id = uid and updated_at > now() - interval '1 minute';
  perform public.rate_limit('votos', n, 30);
  insert into public.votes (idea_id, user_id, value) values (p_idea, uid, p_value)
  on conflict (idea_id, user_id) do update set value = excluded.value, updated_at = now();
end $$;

-- Pro prioritization fields: impact, effort, priority, dev_status, chk_design, chk_prd.
create or replace function public.update_idea_plan(p_id bigint, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  c public.board_ctx;
  b public.boards;
  new_dev text;
  voter uuid;
begin
  select * into i from public.ideas where id = p_id for update;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  c := public.require_team(i.board_id);
  if not c.pro then raise exception 'Disponible en el plan Pro.'; end if;
  new_dev := coalesce(p_patch ->> 'dev_status', i.dev_status);
  if new_dev not in ('por_empezar', 'en_curso', 'lanzada') then raise exception 'Estado de desarrollo inválido.'; end if;
  if p_patch ? 'priority' and nullif(p_patch ->> 'priority', '') not in ('alta', 'media', 'baja') then raise exception 'Prioridad inválida.'; end if;

  update public.ideas set
    impact = coalesce((p_patch ->> 'impact')::smallint, impact),
    effort = coalesce((p_patch ->> 'effort')::smallint, effort),
    priority = case when p_patch ? 'priority' then nullif(p_patch ->> 'priority', '') else priority end,
    chk_design = coalesce((p_patch ->> 'chk_design')::boolean, chk_design),
    chk_prd = coalesce((p_patch ->> 'chk_prd')::boolean, chk_prd),
    dev_status = new_dev,
    dev_at = case when new_dev <> i.dev_status then now() else dev_at end,
    launched_at = case when new_dev = 'lanzada' then coalesce(case when i.dev_status = 'lanzada' then launched_at end, now()) else null end,
    updated_at = now()
  where id = p_id;

  if new_dev = 'lanzada' and i.dev_status <> 'lanzada' then
    select * into b from public.boards where id = i.board_id;
    for voter in select user_id from public.votes where idea_id = p_id loop
      perform public.enqueue_email(voter, 'idea_launched', jsonb_build_object('idea_id', i.id, 'title', i.title, 'board_name', b.name, 'slug', b.slug),
        'status', 'launch:' || p_id || ':' || voter);
    end loop;
  end if;
end $$;

create or replace function public.move_roadmap(p_id bigint, p_col text, p_before bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  c public.board_ctx;
  ids bigint[];
  pos int;
begin
  select * into i from public.ideas where id = p_id for update;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  c := public.require_team(i.board_id);
  if not c.pro then raise exception 'Disponible en el plan Pro.'; end if;
  if p_col is null then
    update public.ideas set rm_col = null, rm_order = null, updated_at = now() where id = p_id;
    return;
  end if;
  if i.status <> 'aprobada' then raise exception 'Solo las ideas aprobadas pasan al Roadmap.'; end if;
  if p_col not in ('ahora', 'siguiente', 'despues', 'no') then raise exception 'Columna inválida.'; end if;

  select coalesce(array_agg(id order by rm_order nulls last, id), '{}') into ids
  from public.ideas where board_id = i.board_id and rm_col = p_col and id <> p_id;
  pos := case when p_before is null then null else array_position(ids, p_before) end;
  if pos is null then ids := ids || p_id; else ids := ids[1:pos - 1] || p_id || ids[pos:]; end if;
  update public.ideas set rm_col = p_col, rm_order = array_position(ids, id), updated_at = now() where id = any (ids);
end $$;

create or replace function public.rename_roadmap_column(p_board uuid, p_col text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_team(p_board);
  n text := left(trim(coalesce(p_name, '')), 24);
begin
  if not c.pro then raise exception 'Disponible en el plan Pro.'; end if;
  if p_col not in ('ahora', 'siguiente', 'despues', 'no') then raise exception 'Columna inválida.'; end if;
  update public.boards set roadmap_names = case when n = '' then roadmap_names - p_col else roadmap_names || jsonb_build_object(p_col, n) end
  where id = p_board;
end $$;

-- ───────────────────────── comments ─────────────────────────

create or replace function public.add_comment(p_idea bigint, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  b public.boards;
  c public.board_ctx;
  uid uuid;
  v_body text := trim(coalesce(p_body, ''));
  n int;
  new_id bigint;
begin
  select * into i from public.ideas where id = p_idea;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  c := public.participate(i.board_id);
  uid := auth.uid();
  if i.hidden and c.role not in ('admin', 'member') then raise exception 'La idea no existe.'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'El comentario debe tener entre 1 y 1.000 caracteres'; end if;
  select count(*) into n from public.comments where author_id = uid and created_at > now() - interval '1 minute';
  perform public.rate_limit('comentarios', n, 10);
  insert into public.comments (idea_id, author_id, body) values (p_idea, uid, v_body) returning id into new_id;

  if i.author_id is not null and i.author_id <> uid then
    select * into b from public.boards where id = i.board_id;
    perform public.enqueue_email(i.author_id, 'new_comment', jsonb_build_object(
      'idea_id', i.id, 'title', i.title, 'board_name', b.name, 'slug', b.slug,
      'author', (select name from public.profiles where id = uid), 'excerpt', left(v_body, 280)), 'comments');
  end if;
  return new_id;
end $$;

create or replace function public.edit_comment(p_id bigint, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  cm public.comments;
  v_body text := trim(coalesce(p_body, ''));
begin
  select * into cm from public.comments where id = p_id;
  if cm.id is null or cm.deleted then raise exception 'El comentario no existe.'; end if;
  if cm.author_id is distinct from public.require_user() then raise exception 'Solo podés editar tus comentarios.'; end if;
  perform public.writable_board((select board_id from public.ideas where id = cm.idea_id), auth.uid());
  if char_length(v_body) not between 1 and 1000 then raise exception 'El comentario debe tener entre 1 y 1.000 caracteres'; end if;
  update public.comments set body = v_body, edited = true, updated_at = now() where id = p_id;
end $$;

create or replace function public.delete_comment(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare cm public.comments;
begin
  select * into cm from public.comments where id = p_id;
  if cm.id is null or cm.deleted then raise exception 'El comentario no existe.'; end if;
  if cm.author_id is distinct from public.require_user() then raise exception 'Solo podés borrar tus comentarios.'; end if;
  if exists (select 1 from public.comment_replies where comment_id = p_id) then
    update public.comments set deleted = true, updated_at = now() where id = p_id;
  else
    delete from public.comments where id = p_id;
  end if;
end $$;

create or replace function public.set_comment_hidden(p_id bigint, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare cm public.comments;
begin
  select * into cm from public.comments where id = p_id;
  if cm.id is null then raise exception 'El comentario no existe.'; end if;
  perform public.require_team((select board_id from public.ideas where id = cm.idea_id));
  if cm.author_id = auth.uid() then raise exception 'No podés ocultar tu propio comentario.'; end if;
  update public.comments set hidden = p_hidden, updated_at = now() where id = p_id;
end $$;

create or replace function public.reply_comment(p_comment bigint, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  cm public.comments;
  i public.ideas;
  b public.boards;
  v_body text := trim(coalesce(p_body, ''));
  new_id bigint;
begin
  select * into cm from public.comments where id = p_comment;
  if cm.id is null or cm.deleted then raise exception 'El comentario no existe.'; end if;
  select * into i from public.ideas where id = cm.idea_id;
  perform public.require_team(i.board_id);
  if cm.author_id = auth.uid() then raise exception 'No podés responder tu propio comentario.'; end if;
  if exists (select 1 from public.comment_replies where comment_id = p_comment) then raise exception 'Este comentario ya tiene una respuesta del Equipo.'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'La respuesta debe tener entre 1 y 1.000 caracteres'; end if;
  insert into public.comment_replies (comment_id, author_id, body) values (p_comment, auth.uid(), v_body) returning id into new_id;

  if cm.author_id is not null then
    select * into b from public.boards where id = i.board_id;
    perform public.enqueue_email(cm.author_id, 'team_reply', jsonb_build_object(
      'idea_id', i.id, 'title', i.title, 'board_name', b.name, 'slug', b.slug,
      'comment', left(cm.body, 280), 'reply', left(v_body, 500)), 'replies');
  end if;
  return new_id;
end $$;

create or replace function public.edit_reply(p_id bigint, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.comment_replies;
  v_body text := trim(coalesce(p_body, ''));
begin
  select * into r from public.comment_replies where id = p_id;
  if r.id is null then raise exception 'La respuesta no existe.'; end if;
  if r.author_id is distinct from public.require_user() then raise exception 'Solo podés editar tus respuestas.'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'La respuesta debe tener entre 1 y 1.000 caracteres'; end if;
  update public.comment_replies set body = v_body, edited = true, updated_at = now() where id = p_id;
end $$;

create or replace function public.delete_reply(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare r public.comment_replies;
begin
  select * into r from public.comment_replies where id = p_id;
  if r.id is null then raise exception 'La respuesta no existe.'; end if;
  if r.author_id is distinct from public.require_user() then raise exception 'Solo podés borrar tus respuestas.'; end if;
  delete from public.comment_replies where id = p_id;
  delete from public.comments where id = r.comment_id and deleted;
end $$;

-- Toggle: the same value again removes the reaction.
create or replace function public.react(p_comment bigint, p_reply bigint, p_value text)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  idea bigint;
  uid uuid;
  cur text;
begin
  if p_value not in ('like', 'no_like') then raise exception 'Reacción inválida.'; end if;
  if (p_comment is null) = (p_reply is null) then raise exception 'Reacción inválida.'; end if;
  if p_comment is not null then
    select author_id, idea_id into author, idea from public.comments where id = p_comment and not deleted;
  else
    select r.author_id, c.idea_id into author, idea from public.comment_replies r join public.comments c on c.id = r.comment_id where r.id = p_reply;
  end if;
  if idea is null then raise exception 'El comentario no existe.'; end if;
  perform public.participate((select board_id from public.ideas where id = idea));
  uid := auth.uid();
  if author = uid then raise exception 'No podés reaccionar a tu propio comentario'; end if;

  select value into cur from public.reactions
  where user_id = uid and ((p_comment is not null and comment_id = p_comment) or (p_reply is not null and reply_id = p_reply));
  delete from public.reactions
  where user_id = uid and ((p_comment is not null and comment_id = p_comment) or (p_reply is not null and reply_id = p_reply));
  if cur is distinct from p_value then
    insert into public.reactions (comment_id, reply_id, user_id, value) values (p_comment, p_reply, uid, p_value);
  end if;
end $$;

-- ───────────────────────── categories ─────────────────────────

create or replace function public.add_category(p_board uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  n text := trim(coalesce(p_name, ''));
  new_id uuid;
begin
  perform public.require_board_admin(p_board);
  perform public.writable_board(p_board, auth.uid());
  if n = '' then raise exception 'Escribí un nombre'; end if;
  if char_length(n) > 40 then raise exception 'Máximo 40 caracteres'; end if;
  if exists (select 1 from public.categories where board_id = p_board and lower(name) = lower(n)) then raise exception 'Ya existe una categoría con ese nombre'; end if;
  if (select count(*) from public.categories where board_id = p_board) >= 12 then raise exception 'Máximo 12 categorías'; end if;
  insert into public.categories (board_id, name, position)
  values (p_board, n, coalesce((select max(position) + 1 from public.categories where board_id = p_board), 0))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.rename_category(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  k public.categories;
  n text := trim(coalesce(p_name, ''));
begin
  select * into k from public.categories where id = p_id;
  if k.id is null then raise exception 'La categoría no existe.'; end if;
  perform public.require_board_admin(k.board_id);
  if n = '' then raise exception 'El nombre no puede quedar vacío'; end if;
  if char_length(n) > 40 then raise exception 'Máximo 40 caracteres'; end if;
  if exists (select 1 from public.categories where board_id = k.board_id and id <> p_id and lower(name) = lower(n)) then raise exception 'Ya existe una categoría con ese nombre'; end if;
  update public.categories set name = n where id = p_id;
end $$;

create or replace function public.delete_category(p_id uuid, p_move_to uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  k public.categories;
  moved int;
begin
  select * into k from public.categories where id = p_id;
  if k.id is null then raise exception 'La categoría no existe.'; end if;
  perform public.require_board_admin(k.board_id);
  if (select count(*) from public.categories where board_id = k.board_id) <= 1 then raise exception 'El buzón necesita al menos 1 categoría'; end if;
  select count(*) into moved from public.ideas where category_id = p_id;
  if moved > 0 then
    if p_move_to is null or p_move_to = p_id or not exists (select 1 from public.categories where id = p_move_to and board_id = k.board_id) then
      raise exception 'Elegí a qué categoría mover las ideas';
    end if;
    update public.ideas set category_id = p_move_to where category_id = p_id;
  end if;
  delete from public.categories where id = p_id;
  return moved;
end $$;

create or replace function public.reset_categories(p_board uuid)
returns int language plpgsql security definer set search_path = public as $$
declare added int;
begin
  perform public.require_board_admin(p_board);
  with d(name, key, pos) as (values ('Feature', 'feature', -3), ('Mejora funcional', 'mejora', -2), ('Propuesta', 'propuesta', -1)),
  ins as (
    insert into public.categories (board_id, name, key, position)
    select p_board, d.name, d.key, d.pos from d
    where not exists (select 1 from public.categories k where k.board_id = p_board and (k.key = d.key or lower(k.name) = lower(d.name)))
    returning 1)
  select count(*) into added from ins;
  return added;
end $$;

-- ───────────────────────── teams & boards ─────────────────────────

create or replace function public.require_account_owner(p_team uuid)
returns public.accounts language plpgsql security definer set search_path = public as $$
declare a public.accounts;
begin
  select a2.* into a from public.teams t join public.accounts a2 on a2.id = t.account_id where t.id = p_team;
  if a.id is null then raise exception 'El equipo no existe.'; end if;
  if a.owner_id is distinct from public.require_user()
     and not exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid() and role = 'admin') then
    raise exception 'Solo el Admin del equipo puede hacer esto.' using errcode = '42501';
  end if;
  if a.status <> 'active' then raise exception 'La cuenta está suspendida.'; end if;
  return a;
end $$;

create or replace function public.new_board(p_team uuid, p_name text, p_visibility text, p_description text default '')
returns public.boards language plpgsql security definer set search_path = public as $$
declare
  b public.boards;
  palette text[] := array['#5a6b8c', '#c2703d', '#3a78b5', '#7c5cbf', '#5b8a3a', '#a8487a', '#4f6d8a'];
begin
  insert into public.boards (team_id, name, slug, description, visibility, color)
  values (p_team, trim(p_name), public.make_slug(p_name), left(trim(coalesce(p_description, '')), 200), p_visibility,
          palette[1 + (select count(*) from public.boards x join public.teams t on t.id = x.team_id
                          where t.account_id = (select account_id from public.teams where id = p_team)) % array_length(palette, 1)])
  returning * into b;
  perform public.seed_categories(b.id);
  return b;
end $$;

-- Onboarding: first account, team and board of a new Admin.
create or replace function public.onboard(p_team_name text, p_board_name text, p_visibility text default 'public', p_description text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  acc public.accounts;
  tm public.teams;
  b public.boards;
  tn text := trim(coalesce(p_team_name, ''));
  bn text := trim(coalesce(nullif(trim(p_board_name), ''), p_team_name));
begin
  if tn = '' or char_length(tn) > 60 then raise exception 'El nombre del equipo es obligatorio (máx. 60 caracteres)'; end if;
  if bn = '' or char_length(bn) > 60 then raise exception 'El nombre del buzón es obligatorio (máx. 60 caracteres)'; end if;
  select * into acc from public.accounts where owner_id = uid;
  if acc.id is not null and exists (select 1 from public.teams where account_id = acc.id) then
    raise exception 'Ya tenés un equipo. Creá nuevos buzones desde Mis Buzones.';
  end if;
  if acc.id is null then
    insert into public.accounts (owner_id, name) values (uid, tn) returning * into acc;
    insert into public.subscriptions (account_id, currency, list_amount) values (acc.id, 'USD', public.current_price('USD'));
  end if;
  if p_visibility = 'private' and not public.account_is_pro(acc.id) then raise exception 'Los buzones privados están disponibles en Pro.'; end if;
  insert into public.teams (account_id, name) values (acc.id, tn) returning * into tm;
  insert into public.team_members (team_id, user_id, role) values (tm.id, uid, 'admin');
  b := public.new_board(tm.id, bn, coalesce(p_visibility, 'public'), p_description);
  update public.teams set color = b.color where id = tm.id;
  return jsonb_build_object('team_id', tm.id, 'board_id', b.id, 'slug', b.slug);
end $$;

create or replace function public.create_team(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  acc public.accounts;
  n text := trim(coalesce(p_name, ''));
  new_id uuid;
  palette text[] := array['#7c5cbf', '#5b8a3a', '#a8487a', '#4f6d8a', '#c2703d', '#3a78b5'];
begin
  select * into acc from public.accounts where owner_id = uid;
  if acc.id is null then raise exception 'Primero creá tu primer buzón.'; end if;
  if acc.status <> 'active' then raise exception 'La cuenta está suspendida.'; end if;
  if n = '' or char_length(n) > 60 then raise exception 'El nombre es obligatorio'; end if;
  if not public.account_is_pro(acc.id) and exists (select 1 from public.teams where account_id = acc.id) then
    raise exception 'Equipos ilimitados en el plan Pro';
  end if;
  insert into public.teams (account_id, name, color)
  values (acc.id, n, palette[1 + (select count(*) from public.teams where account_id = acc.id) % array_length(palette, 1)])
  returning id into new_id;
  insert into public.team_members (team_id, user_id, role) values (new_id, uid, 'admin');
  return new_id;
end $$;

create or replace function public.rename_team(p_team uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, ''));
begin
  perform public.require_account_owner(p_team);
  if n = '' or char_length(n) > 60 then raise exception 'El nombre es obligatorio'; end if;
  update public.teams set name = n where id = p_team;
end $$;

create or replace function public.create_board(p_team uuid, p_name text, p_visibility text default 'public')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  acc public.accounts := public.require_account_owner(p_team);
  pro boolean := public.account_is_pro(acc.id);
  n text := trim(coalesce(p_name, ''));
  b public.boards;
begin
  if n = '' then raise exception 'El nombre es obligatorio'; end if;
  if char_length(n) > 60 then raise exception 'Máximo 60 caracteres'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Visibilidad inválida.'; end if;
  if not pro and exists (select 1 from public.boards x join public.teams t on t.id = x.team_id where t.account_id = acc.id) then
    raise exception 'En Free tenés 1 buzón. Pasá a Pro para crear más.';
  end if;
  if not pro and p_visibility = 'private' then raise exception 'Los buzones privados están disponibles en Pro.'; end if;
  b := public.new_board(p_team, n, p_visibility, 'Buzón nuevo. Editá la descripción desde Configuración.');
  return jsonb_build_object('id', b.id, 'slug', b.slug);
end $$;

create or replace function public.update_board(p_board uuid, p_name text default null, p_description text default null, p_logo_url text default null, p_clear_logo boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, ''));
begin
  perform public.require_board_admin(p_board);
  if p_name is not null and (n = '' or char_length(n) > 60) then raise exception 'El nombre es obligatorio (máx. 60 caracteres)'; end if;
  if p_description is not null and char_length(p_description) > 200 then raise exception 'La descripción admite hasta 200 caracteres'; end if;
  update public.boards set
    name = case when p_name is null then name else n end,
    description = coalesce(p_description, description),
    logo_url = case when p_clear_logo then null else coalesce(p_logo_url, logo_url) end
  where id = p_board;
end $$;

create or replace function public.delete_board(p_board uuid, p_confirm text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.boards;
begin
  perform public.require_board_admin(p_board);
  select * into b from public.boards where id = p_board;
  if trim(coalesce(p_confirm, '')) <> b.name then raise exception 'El nombre no coincide'; end if;
  delete from public.boards where id = p_board;
end $$;

create or replace function public.toggle_favorite(p_board uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_user();
begin
  if exists (select 1 from public.board_favorites where user_id = uid and board_id = p_board) then
    delete from public.board_favorites where user_id = uid and board_id = p_board;
    return false;
  end if;
  insert into public.board_favorites (user_id, board_id) values (uid, p_board);
  return true;
end $$;

create or replace function public.get_team(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  acc public.accounts := public.require_account_owner(p_team);
  t public.teams;
begin
  select * into t from public.teams where id = p_team;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'color', t.color, 'pro', public.account_is_pro(acc.id), 'max_members', 4,
    'owner', (select jsonb_build_object('id', id, 'name', name, 'email', email, 'avatar_url', avatar_url) from public.profiles where id = acc.owner_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.name, 'email', p.email, 'avatar_url', p.avatar_url,
                                          'role', m.role, 'all_boards', m.all_boards, 'joined_at', m.joined_at) order by m.joined_at)
      from public.team_members m join public.profiles p on p.id = m.user_id
      where m.team_id = p_team and m.user_id <> acc.owner_id), '[]'),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'created_at', i.created_at, 'board_id', i.board_id) order by i.created_at)
      from public.invitations i
      where i.kind = 'team' and i.team_id = p_team and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'),
    'boards', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'color', b.color, 'visibility', b.visibility,
        'access', coalesce((select jsonb_object_agg(m.user_id::text, coalesce(a.has_access, m.all_boards))
                            from public.team_members m
                            left join public.board_member_access a on a.board_id = b.id and a.user_id = m.user_id
                            where m.team_id = p_team and m.user_id <> acc.owner_id), '{}')) order by b.created_at)
      from public.boards b where b.team_id = p_team), '[]')
  );
end $$;

create or replace function public.set_board_access(p_board uuid, p_user uuid, p_has boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.board_ctx := public.require_board_admin(p_board);
begin
  if not c.pro then raise exception 'Sumar miembros al equipo está disponible en Pro'; end if;
  if not exists (select 1 from public.team_members where team_id = c.team_id and user_id = p_user and role = 'member') then
    raise exception 'La persona no es miembro del equipo.';
  end if;
  insert into public.board_member_access (board_id, user_id, has_access) values (p_board, p_user, p_has)
  on conflict (board_id, user_id) do update set has_access = excluded.has_access;
end $$;

create or replace function public.remove_team_member(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare acc public.accounts := public.require_account_owner(p_team);
begin
  if p_user = acc.owner_id then raise exception 'No podés quitar al Admin del equipo.'; end if;
  delete from public.board_member_access where user_id = p_user and board_id in (select id from public.boards where team_id = p_team);
  delete from public.team_members where team_id = p_team and user_id = p_user;
end $$;

-- ───────────────────────── invitations ─────────────────────────

create or replace function public.clean_emails(p_emails text[])
returns text[] language plpgsql immutable as $$
declare
  res text[] := '{}';
  e text;
begin
  foreach e in array coalesce(p_emails, '{}') loop
    e := lower(trim(e));
    if e = '' then continue; end if;
    if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email inválido: %', e; end if;
    if not e = any (res) then res := res || e; end if;
  end loop;
  if array_length(res, 1) is null then raise exception 'Agregá al menos un email'; end if;
  return res;
end $$;

-- Pro: invite members to the team (all boards) or to a single board of the team.
create or replace function public.invite_team_members(p_team uuid, p_emails text[], p_board uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  acc public.accounts := public.require_account_owner(p_team);
  emails text[] := public.clean_emails(p_emails);
  e text;
  used int;
  inv public.invitations;
  t public.teams;
  inviter text;
  board_name text;
begin
  if not public.account_is_pro(acc.id) then raise exception 'Sumar miembros al equipo está disponible en Pro'; end if;
  if p_board is not null and not exists (select 1 from public.boards where id = p_board and team_id = p_team) then raise exception 'El buzón no es de este equipo.'; end if;
  if exists (select 1 from unnest(emails) x(em)
             where x.em = (select email from public.profiles where id = acc.owner_id)
                or exists (select 1 from public.team_members m join public.profiles p on p.id = m.user_id where m.team_id = p_team and p.email = x.em)) then
    raise exception 'Ese email ya es parte del equipo';
  end if;
  select (select count(*) from public.team_members where team_id = p_team and role = 'member')
       + (select count(*) from public.invitations where kind = 'team' and team_id = p_team and accepted_at is null and revoked_at is null
            and expires_at > now() and not email = any (emails))
    into used;
  if used + array_length(emails, 1) > 4 then raise exception 'Tu equipo puede tener hasta 4 miembros además de vos'; end if;

  select * into t from public.teams where id = p_team;
  select name into inviter from public.profiles where id = auth.uid();
  select name into board_name from public.boards where id = p_board;
  foreach e in array emails loop
    update public.invitations set revoked_at = now()
    where kind = 'team' and team_id = p_team and email = e and accepted_at is null and revoked_at is null;
    insert into public.invitations (kind, email, team_id, board_id, invited_by, sent_at)
    values ('team', e, p_team, p_board, auth.uid(), now()) returning * into inv;
    perform public.enqueue_email_to(e, 'invite_team', jsonb_build_object(
      'token', inv.token, 'team_name', t.name, 'inviter', inviter, 'board_name', board_name));
  end loop;
  return array_length(emails, 1);
end $$;

create or replace function public.invite_guests(p_board uuid, p_emails text[])
returns int language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_team(p_board);
  emails text[] := public.clean_emails(p_emails);
  e text;
  b public.boards;
  inv public.invitations;
  inviter text;
  n int := 0;
begin
  select * into b from public.boards where id = p_board;
  if b.visibility <> 'public' then raise exception 'Los buzones privados no admiten invitados de la Comunidad'; end if;
  select name into inviter from public.profiles where id = auth.uid();
  foreach e in array emails loop
    if exists (select 1 from public.board_guests g join public.profiles p on p.id = g.user_id where g.board_id = p_board and p.email = e) then
      continue;
    end if;
    update public.invitations set revoked_at = now()
    where kind = 'guest' and board_id = p_board and email = e and accepted_at is null and revoked_at is null;
    insert into public.invitations (kind, email, board_id, team_id, invited_by, sent_at, expires_at)
    values ('guest', e, p_board, b.team_id, auth.uid(), now(), now() + interval '30 days') returning * into inv;
    perform public.enqueue_email_to(e, 'invite_guest', jsonb_build_object(
      'token', inv.token, 'board_name', b.name, 'slug', b.slug, 'description', b.description, 'inviter', inviter));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations where id = p_id;
  if inv.id is null then raise exception 'La invitación no existe.'; end if;
  if inv.kind = 'team' then perform public.require_account_owner(inv.team_id);
  elsif inv.kind = 'guest' then perform public.require_team(inv.board_id);
  else perform public.require_super_admin();
  end if;
  update public.invitations set revoked_at = now() where id = p_id;
end $$;

-- Public: what the invitation page shows before signing in.
create or replace function public.get_invitation(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kind', i.kind, 'email', i.email,
    'team_name', t.name, 'board_name', b.name, 'board_slug', b.slug,
    'inviter', p.name,
    'expired', i.expires_at < now(), 'accepted', i.accepted_at is not null, 'revoked', i.revoked_at is not null)
  from public.invitations i
  left join public.teams t on t.id = coalesce(i.team_id, (select team_id from public.boards where id = i.board_id))
  left join public.boards b on b.id = i.board_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = p_token;
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  my_email text;
  inv public.invitations;
  acc public.accounts;
  v_slug text;
begin
  select * into inv from public.invitations where token = p_token for update;
  if inv.id is null or inv.revoked_at is not null then raise exception 'La invitación no es válida.'; end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = uid then
      return jsonb_build_object('kind', inv.kind, 'slug', (select bb.slug from public.boards bb where bb.id = coalesce(inv.board_id, (select b2.id from public.boards b2 where b2.team_id = inv.team_id order by b2.created_at limit 1))));
    end if;
    raise exception 'La invitación ya fue usada.';
  end if;
  if inv.expires_at < now() then raise exception 'La invitación venció. Pedí una nueva.'; end if;
  select email into my_email from public.profiles where id = uid;

  if inv.kind = 'team' then
    if my_email <> inv.email then raise exception 'Esta invitación es para %. Ingresá con ese email.', inv.email; end if;
    select a.* into acc from public.teams t join public.accounts a on a.id = t.account_id where t.id = inv.team_id;
    if not public.account_is_pro(acc.id) then raise exception 'El equipo ya no tiene el plan Pro.'; end if;
    if (select count(*) from public.team_members where team_id = inv.team_id and role = 'member') >= 4 then raise exception 'El equipo está completo.'; end if;
    insert into public.team_members (team_id, user_id, role, all_boards) values (inv.team_id, uid, 'member', inv.board_id is null)
    on conflict (team_id, user_id) do nothing;
    if inv.board_id is not null then
      insert into public.board_member_access (board_id, user_id, has_access) values (inv.board_id, uid, true)
      on conflict (board_id, user_id) do update set has_access = true;
    end if;
    select b.slug into v_slug from public.boards b where b.id = coalesce(inv.board_id, (select id from public.boards where team_id = inv.team_id order by created_at limit 1));
  elsif inv.kind = 'guest' then
    insert into public.board_guests (board_id, user_id, via, invited_by) values (inv.board_id, uid, 'email', inv.invited_by)
    on conflict (board_id, user_id) do nothing;
    select b.slug into v_slug from public.boards b where b.id = inv.board_id;
  else
    if my_email <> inv.email then raise exception 'Esta invitación es para %.', inv.email; end if;
    update public.profiles set activated_at = coalesce(activated_at, now()) where id = uid;
    select b.slug into v_slug from public.boards b join public.teams t on t.id = b.team_id where t.account_id = inv.account_id order by b.created_at limit 1;
  end if;

  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return jsonb_build_object('kind', inv.kind, 'slug', v_slug);
end $$;

-- A signed-in user who arrives through the board's link joins as Invitado.
create or replace function public.join_board(p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  b public.boards;
  c public.board_ctx;
begin
  select * into b from public.boards where slug = lower(p_slug);
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  c := public.board_context(b.id, uid);
  if c.role is not null then return c.role; end if;
  if b.visibility <> 'public' then raise exception 'No tenés acceso a este buzón.'; end if;
  insert into public.board_guests (board_id, user_id, via) values (b.id, uid, 'link') on conflict do nothing;
  return 'guest';
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
    'invite_code', (select invite_code from public.boards where id = p_board)
  );
end $$;

create or replace function public.set_guest_status(p_board uuid, p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_team(p_board);
  if p_status not in ('active', 'blocked') then raise exception 'Estado inválido.'; end if;
  update public.board_guests set status = p_status where board_id = p_board and user_id = p_user;
  if not found then raise exception 'La persona no es parte de la Comunidad del buzón.'; end if;
end $$;

-- ───────────────────────── profile ─────────────────────────

create or replace function public.update_profile(p_name text, p_avatar_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, ''));
begin
  if n = '' then raise exception 'Ingresá tu nombre'; end if;
  if char_length(n) > 60 then raise exception 'Máximo 60 caracteres'; end if;
  update public.profiles set name = n, avatar_url = coalesce(p_avatar_url, avatar_url) where id = public.require_user();
end $$;

create or replace function public.update_notifications(p_notif jsonb, p_admin boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  keys text[] := case when p_admin then array['clients', 'payfail', 'churn', 'weekly'] else array['comments', 'replies', 'status', 'digest'] end;
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

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
$$;

-- Helpers stay private.
revoke execute on function public.board_card(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.idea_json(public.ideas, uuid, boolean, int) from public, anon, authenticated;
revoke execute on function public.can_see_board(public.board_ctx, text) from public, anon, authenticated;
revoke execute on function public.new_board(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.require_account_owner(uuid) from public, anon, authenticated;
grant execute on function public.get_board(text) to anon, authenticated;
grant execute on function public.get_idea(bigint) to anon, authenticated;
grant execute on function public.board_version(uuid) to anon, authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
