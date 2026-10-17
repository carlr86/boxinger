-- Boxinger · New plan names: Free · Pro · Team · Enterprise
-- Team is the plan bought on the web (internally still plan 'enterprise', provider creem or mercadopago) and Enterprise
-- is the custom one Boxinger assigns. Only the messages change: these are the production definitions of the functions
-- whose errors named the plans (taken with pg_get_functiondef on 2026-10-18), with the new names. No logic changes.

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user uuid, p_board uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_super_admin();
  b public.boards;
  acc public.accounts;
  lim int;
begin
  if p_role not in ('member', 'guest') then raise exception 'Rol inválido.'; end if;
  select * into b from public.boards where id = p_board;
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  select a.* into acc from public.teams t join public.accounts a on a.id = t.account_id where t.id = b.team_id;
  if p_user = acc.owner_id or exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user and role = 'admin') then
    raise exception 'Es el Admin de la cuenta: su rol no se puede cambiar.';
  end if;

  if p_role = 'member' then
    if exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user) then raise exception 'Ya es Miembro de este equipo.'; end if;
    if not public.account_is_pro(acc.id) then raise exception 'La cuenta es Free: necesita Pro, Team o Enterprise para tener miembros.'; end if;
    lim := public.account_member_limit(acc.id);
    if lim is not null and (select count(*) from public.team_members where team_id = b.team_id and role = 'member') >= lim then
      raise exception 'El equipo ya tiene % miembros, el máximo de su plan.', lim;
    end if;
    insert into public.team_members (team_id, user_id, role, all_boards) values (b.team_id, p_user, 'member', true);
    -- As a member they see the team's boards: their guest seats there are no longer needed.
    delete from public.board_guests where user_id = p_user and board_id in (select id from public.boards where team_id = b.team_id);
    update public.board_access_requests set status = 'approved', decided_by = uid, decided_at = now()
    where user_id = p_user and status = 'pending' and board_id in (select id from public.boards where team_id = b.team_id);
  else
    if not exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user) then raise exception 'Ya es Invitado de este buzón.'; end if;
    delete from public.board_member_access where user_id = p_user and board_id in (select id from public.boards where team_id = b.team_id);
    delete from public.team_members where team_id = b.team_id and user_id = p_user;
    insert into public.board_guests (board_id, user_id, via, invited_by) values (b.id, p_user, 'email', uid)
    on conflict (board_id, user_id) do update set status = 'active';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'user_role', 'user', p_user, jsonb_build_object('board', b.id, 'role', p_role));
end $function$;

CREATE OR REPLACE FUNCTION public.ai_begin(p_board uuid, p_uid uuid, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.board_ctx := public.board_context(p_board, p_uid);
  lim jsonb := public.ai_limits();
  b public.boards;
  ideas jsonb;
begin
  if p_kind not in ('suggest', 'rank') then raise exception 'Acción inválida.'; end if;
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'super') then raise exception 'El asistente de IA es solo para el Admin del equipo.' using errcode = '42501'; end if;
  if public.account_plan(c.account_id) <> 'enterprise' then raise exception 'El asistente de IA está disponible en los planes Team y Enterprise.'; end if;
  select * into b from public.boards where id = p_board;
  if coalesce(char_length(b.ai_context), 0) < 30 then raise exception 'Primero contá de qué se trata tu producto (al menos 30 caracteres).'; end if;
  if (public.ai_used(p_board) ->> p_kind)::int >= (lim ->> p_kind)::int then
    raise exception 'Ya usaste el asistente todas las veces de este mes en este buzón. Se renueva el día 1.';
  end if;
  if (public.ai_account_used(c.account_id) ->> p_kind)::int >= (public.ai_account_limits(c.account_id) ->> p_kind)::int then
    if p_kind = 'rank' then raise exception 'Tu equipo ya usó todos los análisis de este mes. Se renuevan el día 1.'; end if;
    raise exception 'Tu equipo ya usó todas las sugerencias de este mes. Se renuevan el día 1.';
  end if;
  if (select count(*) from public.ai_runs where created_at > now() - interval '1 day') >= (lim ->> 'platform_daily')::int then
    raise exception 'El asistente de IA está muy pedido en este momento. Probá en unas horas.';
  end if;

  if p_kind = 'rank' then
    select coalesce(jsonb_agg(x order by x.votes desc, x.id desc), '[]') into ideas from (
      select i.id, i.title, left(i.description, 600) as description, cat.name as category, i.origin, i.status,
             (select count(*) from public.votes v where v.idea_id = i.id) as votes,
             (select jsonb_object_agg(value, n) from (select value, count(*) n from public.votes v where v.idea_id = i.id group by value) q) as vote_breakdown,
             (select count(*) from public.comments cm where cm.idea_id = i.id and not cm.deleted and not cm.hidden) as comments,
             nullif(i.impact, 0) as impact, nullif(i.effort, 0) as effort,
             (now()::date - i.created_at::date) as age_days
      from public.ideas i join public.categories cat on cat.id = i.category_id
      where i.board_id = p_board and i.status in ('pendiente', 'en_revision') and not i.hidden
      order by (select count(*) from public.votes v where v.idea_id = i.id) desc, i.created_at desc
      limit 300) x;
    if ideas = '[]' then raise exception 'No hay ideas pendientes o en revisión para analizar.'; end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object('title', i.title, 'status', i.status) order by i.created_at desc), '[]') into ideas
    from (select * from public.ideas where board_id = p_board order by created_at desc limit 300) i;
  end if;

  return jsonb_build_object(
    'account_id', c.account_id,
    'board', b.name,
    'board_description', b.description,
    'context', b.ai_context,
    'discarded', coalesce((select jsonb_agg(d ->> 'title') from jsonb_array_elements(b.ai_discarded) d), '[]'),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by position, created_at), '[]') from public.categories where board_id = p_board),
    'ideas', ideas);
end $function$;

CREATE OR REPLACE FUNCTION public.create_ai_idea(p_board uuid, p_title text, p_description text, p_category uuid, p_suggestion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.board_ctx := public.board_context(p_board, public.require_user());
  new_id bigint;
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'super') then raise exception 'El asistente de IA es solo para el Admin del equipo.' using errcode = '42501'; end if;
  if public.account_plan(c.account_id) <> 'enterprise' then raise exception 'El asistente de IA está disponible en los planes Team y Enterprise.'; end if;
  new_id := public.create_idea(p_board, p_title, p_description, p_category);
  update public.ideas set ai_generated = true where id = new_id;
  if p_suggestion is not null then perform public.ai_dismiss_suggestion(p_board, p_suggestion, false); end if;
  return new_id;
end $function$;

CREATE OR REPLACE FUNCTION public.ingest_idea(p_hash text, p_source text, p_title text, p_description text, p_name text, p_email text, p_category text, p_external_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  x public.board_integrations;
  c public.board_ctx;
  b public.boards;
  t text := regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g');
  d text := trim(coalesce(p_description, ''));
  ref text := left(nullif(trim(coalesce(p_external_ref, '')), ''), 200);
  em text := lower(trim(coalesce(p_email, '')));
  n int;
  cat uuid;
  who uuid;
  dup bigint;
  new_id bigint;
  admin_id uuid;
begin
  select * into x from public.board_integrations where token_hash = p_hash;
  if x.id is null then raise exception 'La clave no es válida.' using errcode = '28000'; end if;
  if p_source not in ('api', 'slack', 'widget') then raise exception 'Origen inválido.' using errcode = '22023'; end if;
  c := public.board_context(x.board_id, null);
  if not c.pro then raise exception 'Las integraciones están disponibles en los planes Pro, Team y Enterprise.' using errcode = '42501'; end if;
  if c.board_status <> 'active' or c.account_status <> 'active' then
    raise exception 'Este buzón está suspendido y queda en solo lectura.' using errcode = '42501';
  end if;

  if ref is not null then
    select id into dup from public.ideas where board_id = x.board_id and source = p_source and external_ref = ref;
    if dup is not null then return jsonb_build_object('id', dup, 'duplicate', true); end if;
  end if;

  if t = '' then raise exception 'Falta el título de la idea.' using errcode = '22023'; end if;
  if char_length(t) < 5 then raise exception 'El título debe tener al menos 5 caracteres.' using errcode = '22023'; end if;
  -- a long title is cut and kept whole in the description
  if char_length(t) > 80 then
    d := t || case when d <> '' then E'\n\n' || d else '' end;
    t := rtrim(left(t, 79)) || '…';
  end if;
  d := left(d, 2000);

  select count(*) into n from public.ideas where board_id = x.board_id and source is not null and created_at > now() - interval '1 day';
  perform public.rate_limit('ideas por integraciones', n, 200);

  select id into cat from public.categories
  where board_id = x.board_id and lower(trim(name)) = lower(trim(coalesce(p_category, ''))) limit 1;
  cat := coalesce(cat, (select id from public.categories where id = x.default_category and board_id = x.board_id),
                  (select id from public.categories where board_id = x.board_id order by position limit 1));
  if cat is null then raise exception 'El buzón no tiene categorías.'; end if;

  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then em := null; end if;
  if em is not null then
    select p.id into who from public.profiles p
    where lower(p.email) = em and (public.board_context(x.board_id, p.id)).role in ('guest', 'member', 'admin') limit 1;
  end if;

  insert into public.ideas (board_id, author_id, origin, title, description, category_id, hidden,
                            source, external_ref, requester_name, requester_email)
  values (x.board_id, who, x.origin, t, d, cat, true,
          p_source, ref, left(nullif(trim(coalesce(p_name, '')), ''), 120), em)
  returning id into new_id;
  update public.board_integrations set last_used_at = now(), use_count = use_count + 1 where id = x.id;

  -- In-app notice (no email) to whoever manages the board, like a new idea.
  select * into b from public.boards where id = x.board_id;
  for admin_id in
    select distinct y.id from (
      select a.owner_id as id from public.teams tm join public.accounts a on a.id = tm.account_id where tm.id = b.team_id
      union select m.user_id from public.team_members m where m.team_id = b.team_id and m.role = 'admin'
      union select b.created_by
    ) y where y.id is not null and public.board_can_manage(x.board_id, y.id)
  loop
    insert into public.notifications (user_id, kind, payload, dedupe_key)
    values (admin_id, 'new_idea_inbox', jsonb_build_object('idea_id', new_id, 'title', t, 'board_name', b.name, 'slug', b.slug, 'source', p_source),
            'n:new_idea_inbox:' || new_id || ':' || admin_id)
    on conflict (dedupe_key) do nothing;
  end loop;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (null, 'idea_ingested', 'board', x.board_id, jsonb_build_object('idea_id', new_id, 'source', p_source));
  perform public.touch_board(x.board_id);
  return jsonb_build_object('id', new_id, 'duplicate', false);
end $function$;

CREATE OR REPLACE FUNCTION public.merge_ideas(p_source bigint, p_target bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  src public.ideas;
  dst public.ideas;
  c public.board_ctx;
  b public.boards;
  m bigint;
  before_votes int;
  moved_votes int;
  moved_comments int;
  author_vote boolean := false;
  notified int := 0;
  who uuid;
begin
  if p_source = p_target then raise exception 'Elegí otra idea para unir.'; end if;
  select * into src from public.ideas where id = p_source for update;
  select * into dst from public.ideas where id = p_target for update;
  if src.id is null or dst.id is null then raise exception 'La idea no existe.'; end if;
  if src.board_id <> dst.board_id then raise exception 'Solo se pueden unir ideas del mismo buzón.'; end if;
  c := public.board_context(src.board_id, uid);
  if not coalesce(public.board_can_manage(src.board_id, uid), false) then
    raise exception 'Solo el Admin del equipo puede unir ideas.' using errcode = '42501';
  end if;
  if not c.pro then raise exception 'Unir ideas está disponible en los planes Pro, Team y Enterprise.'; end if;
  perform public.writable_board(src.board_id, uid);
  select * into b from public.boards where id = src.board_id;

  insert into public.idea_merges (board_id, source_id, target_id, source_title, source_description, source_author_id, source_created_at, merged_by)
  values (src.board_id, src.id, dst.id, src.title, src.description, src.author_id, src.created_at, uid)
  returning id into m;
  -- ideas merged into the duplicate before now belong to the main one
  update public.idea_merges set target_id = dst.id where target_id = src.id and id <> m;

  -- Bell notice for the duplicate's author and voters (before their votes move), except whoever merges and blocked people.
  for who in
    select x.u from (
      select v.user_id u from public.votes v where v.idea_id = src.id
      union select src.author_id where src.author_id is not null
    ) x
    join public.profiles p on p.id = x.u
    where x.u is distinct from uid and p.status <> 'blocked'
      and (public.board_context(src.board_id, x.u)).role is distinct from 'blocked'
  loop
    insert into public.notifications (user_id, kind, payload, dedupe_key)
    values (who, 'idea_merged', jsonb_build_object('idea_id', dst.id, 'title', dst.title, 'from_title', src.title,
              'board_name', b.name, 'slug', b.slug, 'mine', who = src.author_id), 'n:merged:' || src.id || ':' || who)
    on conflict (dedupe_key) do nothing;
    notified := notified + 1;
  end loop;

  -- Votes: whoever voted both keeps the main idea's vote; the main idea's author can't vote their own idea.
  select count(*) into before_votes from public.votes where idea_id = dst.id;
  insert into public.votes (idea_id, user_id, value, created_at, updated_at)
  select dst.id, v.user_id, v.value, v.created_at, now() from public.votes v
  where v.idea_id = src.id and v.user_id is distinct from dst.author_id
  on conflict (idea_id, user_id) do nothing;
  get diagnostics moved_votes = row_count;
  -- The duplicate's author asked for it: an "importante" vote on the main idea.
  if src.author_id is not null and src.author_id is distinct from dst.author_id then
    insert into public.votes (idea_id, user_id, value, created_at, updated_at)
    values (dst.id, src.author_id, 'importante', src.created_at, now())
    on conflict (idea_id, user_id) do nothing;
    author_vote := found;
  end if;

  update public.comments set idea_id = dst.id, merged_from = m where idea_id = src.id;
  get diagnostics moved_comments = row_count;
  update public.idea_merges set votes_moved = (select count(*) from public.votes where idea_id = dst.id) - before_votes, comments_moved = moved_comments where id = m;

  delete from public.notifications where payload ->> 'idea_id' = src.id::text and kind <> 'idea_merged';
  delete from public.ideas where id = src.id;
  -- the main idea keeps its own image; if it has none, it takes the duplicate's
  update public.ideas set updated_at = now(), image_path = coalesce(dst.image_path, src.image_path) where id = dst.id;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'ideas_merged', 'board', src.board_id, jsonb_build_object('source', src.id, 'target', dst.id, 'votes', moved_votes, 'comments', moved_comments));
  perform public.touch_board(src.board_id);
  return jsonb_build_object('votes_moved', (select votes_moved from public.idea_merges where id = m), 'comments_moved', moved_comments,
                            'author_vote', author_vote, 'notified', notified);
end $function$;

CREATE OR REPLACE FUNCTION public.require_import(p_board uuid)
 RETURNS board_ctx
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  c public.board_ctx := public.board_context(p_board, uid);
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if not coalesce(public.board_can_manage(p_board, uid), false) then
    raise exception 'Solo el Admin del equipo puede importar ideas.' using errcode = '42501';
  end if;
  if not c.pro then raise exception 'Importar ideas está disponible en los planes Pro, Team y Enterprise.'; end if;
  perform public.writable_board(p_board, uid);
  return c;
end $function$;

CREATE OR REPLACE FUNCTION public.require_integrations(p_board uuid, p_paid boolean)
 RETURNS board_ctx
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  c public.board_ctx := public.board_context(p_board, uid);
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if not coalesce(public.board_can_manage(p_board, uid), false) then
    raise exception 'Solo el Admin del equipo puede configurar las integraciones.' using errcode = '42501';
  end if;
  if p_paid then
    if not c.pro then raise exception 'Las integraciones están disponibles en los planes Pro, Team y Enterprise.'; end if;
    perform public.writable_board(p_board, uid);
  end if;
  return c;
end $function$;

CREATE OR REPLACE FUNCTION public.set_idea_image(p_id bigint, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := public.require_user();
  i public.ideas;
  c public.board_ctx;
  p text := nullif(trim(coalesce(p_path, '')), '');
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  c := public.board_context(i.board_id, uid);
  if not (uid = i.author_id or coalesce(c.role in ('admin', 'member'), false)) then
    raise exception 'Solo quien cargó la idea o el Equipo pueden cambiar su imagen.' using errcode = '42501';
  end if;
  perform public.writable_board(i.board_id, uid);
  if p is not null then
    if not c.pro then raise exception 'Adjuntar imágenes está disponible en los planes Pro, Team y Enterprise.'; end if;
    if p !~ ('^' || i.board_id::text || '/[A-Za-z0-9_-]+\.(webp|jpg)$') then raise exception 'Imagen inválida.'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'idea-images' and o.name = p) then raise exception 'La imagen no se subió.'; end if;
  end if;
  update public.ideas set image_path = p, updated_at = now() where id = p_id;
  perform public.touch_board(i.board_id);
end $function$;
