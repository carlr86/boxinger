-- Boxinger · AI assistant adjustments
-- Only the team's Admins run it (and describe the product), 10 suggestion runs a month per board, and ideas
-- added from a suggestion carry an "IA" mark while keeping the person who added them as author.

create or replace function public.ai_limits()
returns jsonb language sql immutable as $$
  select '{"suggest": 10, "rank": 15, "platform_daily": 500}'::jsonb;
$$;

create or replace function public.ai_status(p_board uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  c public.board_ctx := public.board_context(p_board, uid);
  last_s public.ai_runs;
  last_r public.ai_runs;
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'super') then raise exception 'El asistente de IA es solo para el Admin del equipo.' using errcode = '42501'; end if;
  select * into last_s from public.ai_runs where board_id = p_board and kind = 'suggest' order by created_at desc limit 1;
  select * into last_r from public.ai_runs where board_id = p_board and kind = 'rank' order by created_at desc limit 1;
  return jsonb_build_object(
    'enabled', public.account_plan(c.account_id) = 'enterprise',
    'can_edit', true,
    'context', (select ai_context from public.boards where id = p_board),
    'used', public.ai_used(p_board),
    'limits', public.ai_limits(),
    'last_suggest', case when last_s.id is null then null else jsonb_build_object('at', last_s.created_at, 'result', last_s.result) end,
    'last_rank', case when last_r.id is null then null else jsonb_build_object('at', last_r.created_at, 'result', last_r.result) end);
end $$;

create or replace function public.ai_begin(p_board uuid, p_uid uuid, p_kind text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.board_ctx := public.board_context(p_board, p_uid);
  lim jsonb := public.ai_limits();
  b public.boards;
  ideas jsonb;
begin
  if p_kind not in ('suggest', 'rank') then raise exception 'Acción inválida.'; end if;
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'super') then raise exception 'El asistente de IA es solo para el Admin del equipo.' using errcode = '42501'; end if;
  if public.account_plan(c.account_id) <> 'enterprise' then raise exception 'El asistente de IA está disponible en el plan Enterprise.'; end if;
  select * into b from public.boards where id = p_board;
  if coalesce(char_length(b.ai_context), 0) < 30 then raise exception 'Primero contá de qué se trata tu producto (al menos 30 caracteres).'; end if;
  if (public.ai_used(p_board) ->> p_kind)::int >= (lim ->> p_kind)::int then
    raise exception 'Ya usaste el asistente todas las veces de este mes en este buzón. Se renueva el día 1.';
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
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by position, created_at), '[]') from public.categories where board_id = p_board),
    'ideas', ideas);
end $$;

create or replace function public.set_ai_context(p_board uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.board_context(p_board, public.require_user());
  v text := nullif(trim(coalesce(p_text, '')), '');
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'super') then raise exception 'El asistente de IA es solo para el Admin del equipo.' using errcode = '42501'; end if;
  if char_length(v) > 2000 then raise exception 'La descripción puede tener hasta 2.000 caracteres.'; end if;
  update public.boards set ai_context = v where id = p_board;
end $$;

alter table public.ideas add column if not exists ai_generated boolean not null default false;

/** An idea from an AI suggestion: same checks as create_idea, authored by whoever adds it, marked as made with AI. */
create or replace function public.create_ai_idea(p_board uuid, p_title text, p_description text, p_category uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.board_context(p_board, public.require_user());
  new_id bigint;
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'super') then raise exception 'El asistente de IA es solo para el Admin del equipo.' using errcode = '42501'; end if;
  if public.account_plan(c.account_id) <> 'enterprise' then raise exception 'El asistente de IA está disponible en el plan Enterprise.'; end if;
  new_id := public.create_idea(p_board, p_title, p_description, p_category);
  update public.ideas set ai_generated = true where id = new_id;
  return new_id;
end $$;
grant execute on function public.create_ai_idea(uuid, text, text, uuid) to authenticated;

-- Every idea says whether it came from an AI suggestion.
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
    'hidden', i.hidden, 'created_at', i.created_at, 'author_id', i.author_id, 'ai', i.ai_generated,
    'author_name', coalesce((select name from public.profiles where id = i.author_id), 'Usuario eliminado'),
    'author_avatar', (select avatar_url from public.profiles where id = i.author_id),
    'votes', v.imp + v.inte + v.noimp,
    'comments', (select count(*) from public.comments c
                 where c.idea_id = i.id and (not c.deleted or exists (select 1 from public.comment_replies r where r.comment_id = c.id))
                   and (p_team or not c.hidden)),
    'my_vote', (select value from public.votes where idea_id = i.id and user_id = p_uid),
    'rank', p_rank,
    'launched_at', case when i.dev_status = 'lanzada' then i.launched_at end
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
revoke execute on function public.idea_json(public.ideas, uuid, boolean, int) from public, anon, authenticated;
