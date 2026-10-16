-- Boxinger · Novedades (changelog), Pro and Enterprise
-- The Novedades page lists the board's launched ideas by itself (no editing). When an idea is launched,
-- whoever proposed or voted it already gets the idea_launched notice (bell + email); now everyone else in the
-- board (team and active guests) also gets a bell notice, without email. Only on paid plans and for visible ideas.

create or replace function public.notify_board_update(p_idea bigint)
returns int language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  b public.boards;
  acc uuid;
  n int;
begin
  select * into i from public.ideas where id = p_idea;
  if i.id is null or i.hidden then return 0; end if;
  select * into b from public.boards where id = i.board_id;
  select t.account_id into acc from public.teams t where t.id = b.team_id;
  if not public.account_is_pro(acc) then return 0; end if;

  insert into public.notifications (user_id, kind, payload, dedupe_key)
  select x.u, 'board_update', jsonb_build_object('idea_id', i.id, 'title', i.title, 'board_name', b.name, 'slug', b.slug),
         'n:update:' || i.id || ':' || x.u
  from (
    select a.owner_id u from public.accounts a where a.id = acc
    union select tm.user_id from public.team_members tm where tm.team_id = b.team_id
    union select g.user_id from public.board_guests g where g.board_id = b.id and g.status = 'active' and b.visibility in ('public', 'invite')
  ) x
  join public.profiles p on p.id = x.u
  where x.u is distinct from auth.uid() and p.status <> 'blocked'
    -- whoever proposed or voted it already got idea_launched
    and x.u is distinct from i.author_id
    and not exists (select 1 from public.votes v where v.idea_id = i.id and v.user_id = x.u)
    -- only people who can still see the board
    and (public.board_context(b.id, x.u)).role in ('admin', 'member', 'guest')
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.notify_board_update(bigint) from public, anon, authenticated;

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
    perform public.notify_board_update(p_id);
  end if;
end $$;
