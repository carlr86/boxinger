-- Boxinger · Growth levers per idea (Pro, visible only to the Team)

alter table public.ideas
  add column growth text[] not null default '{}'
  check (growth <@ array['adquisicion', 'activacion', 'retencion', 'monetizacion', 'churn']);

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
    'chk_design', i.chk_design, 'chk_prd', i.chk_prd, 'growth', to_jsonb(i.growth)) else '{}'::jsonb end
  from v;
$$;

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
    for voter in select user_id from public.votes where idea_id = p_id loop
      perform public.enqueue_email(voter, 'idea_launched', jsonb_build_object('idea_id', i.id, 'title', i.title, 'board_name', b.name, 'slug', b.slug),
        'status', 'launch:' || p_id || ':' || voter);
    end loop;
  end if;
end $$;

revoke execute on function public.idea_json(public.ideas, uuid, boolean, int) from public, anon, authenticated;
