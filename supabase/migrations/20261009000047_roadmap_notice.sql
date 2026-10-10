-- Boxinger · recognition when an idea moves forward
-- When an idea first enters the Roadmap, whoever proposed it and whoever voted for it get a notice
-- (email + bell), once per person and idea: moving it between columns or back and forth doesn't repeat it.
-- The notice doesn't say which column, since the Roadmap may be private. The launch notice already existed;
-- both now skip whoever made the change and people blocked on the board.

create or replace function public.enqueue_email(p_user uuid, p_template text, p_payload jsonb, p_pref text default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  e text; n jsonb; st text;
begin
  select email, notif, status into e, n, st from public.profiles where id = p_user;
  if e is null or st = 'blocked' then return; end if;
  if p_template in ('access_request', 'access_granted', 'new_comment', 'team_reply', 'idea_status', 'idea_planned', 'idea_launched') then
    insert into public.notifications (user_id, kind, payload, dedupe_key)
    values (p_user, p_template, coalesce(p_payload, '{}'), case when p_dedupe is not null then 'n:' || p_dedupe end)
    on conflict (dedupe_key) do nothing;
  end if;
  if p_pref is not null and coalesce((n ->> p_pref)::boolean, true) = false then return; end if;
  insert into public.email_outbox (to_email, user_id, template, payload, dedupe_key)
  values (e, p_user, p_template, coalesce(p_payload, '{}'), p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;
revoke execute on function public.enqueue_email(uuid, text, jsonb, text, text) from public, anon, authenticated;

-- Who hears about an idea's progress: its author and its voters, minus whoever made the change,
-- people blocked on the board and anyone already told about this step (p_step).
create or replace function public.idea_followers(p_idea bigint, p_step text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select x.uid from (
    select v.user_id uid from public.votes v where v.idea_id = p_idea
    union select i.author_id from public.ideas i where i.id = p_idea and i.author_id is not null
  ) x
  join public.ideas i on i.id = p_idea
  where x.uid is distinct from auth.uid()
    and (public.board_context(i.board_id, x.uid)).role is distinct from 'blocked'
    and not exists (select 1 from public.email_outbox o where o.dedupe_key = p_step || ':' || p_idea || ':' || x.uid)
    and not exists (select 1 from public.notifications n where n.dedupe_key = 'n:' || p_step || ':' || p_idea || ':' || x.uid);
$$;
revoke execute on function public.idea_followers(bigint, text) from public, anon, authenticated;

-- Notifies the followers of one step; returns how many were told.
create or replace function public.notify_idea_step(p_idea bigint, p_step text, p_template text)
returns int language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  b public.boards;
  who uuid;
  n int := 0;
begin
  select * into i from public.ideas where id = p_idea;
  select * into b from public.boards where id = i.board_id;
  for who in select public.idea_followers(p_idea, p_step) loop
    perform public.enqueue_email(who, p_template, jsonb_build_object('idea_id', i.id, 'title', i.title, 'board_name', b.name, 'slug', b.slug, 'mine', who = i.author_id),
      'status', p_step || ':' || p_idea || ':' || who);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.notify_idea_step(bigint, text, text) from public, anon, authenticated;

-- Now returns how many people were told the idea entered the Roadmap (0 when it was already there or already told).
drop function public.move_roadmap(bigint, text, bigint);
create function public.move_roadmap(p_id bigint, p_col text, p_before bigint default null)
returns int language plpgsql security definer set search_path = public as $$
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
    return 0;
  end if;
  if i.status <> 'aprobada' then raise exception 'Solo las ideas aprobadas pasan al Roadmap.'; end if;
  if p_col not in ('ahora', 'siguiente', 'despues') then raise exception 'Columna inválida.'; end if;

  select coalesce(array_agg(id order by rm_order nulls last, id), '{}') into ids
  from public.ideas where board_id = i.board_id and rm_col = p_col and id <> p_id;
  pos := case when p_before is null then null else array_position(ids, p_before) end;
  if pos is null then ids := ids || p_id; else ids := ids[1:pos - 1] || p_id || ids[pos:]; end if;
  update public.ideas set rm_col = p_col, rm_order = array_position(ids, id), updated_at = now() where id = any (ids);

  if i.rm_col is null and i.dev_status <> 'lanzada' then
    return public.notify_idea_step(p_id, 'planned', 'idea_planned');
  end if;
  return 0;
end $$;
grant execute on function public.move_roadmap(bigint, text, bigint) to authenticated;

create or replace function public.update_idea_plan(p_id bigint, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  c public.board_ctx;
  new_dev text;
  new_growth text[];
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
    perform public.notify_idea_step(p_id, 'launch', 'idea_launched');
  end if;
end $$;
