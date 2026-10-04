-- Boxinger · AI assistant: monthly limit per client
-- Besides 15 analyses / 10 suggestions per board, each client gets 30 analyses / 20 suggestions a month across
-- all its boards (worst case about USD 5.40 a month). The platform admin can raise it for one client.

alter table public.accounts add column if not exists ai_rank_limit int check (ai_rank_limit >= 0);
alter table public.accounts add column if not exists ai_suggest_limit int check (ai_suggest_limit >= 0);

create or replace function public.ai_limits()
returns jsonb language sql immutable as $$
  select '{"suggest": 10, "rank": 15, "account_suggest": 20, "account_rank": 30, "platform_daily": 500}'::jsonb;
$$;

create or replace function public.ai_account_limits(p_account uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'suggest', coalesce(a.ai_suggest_limit, (public.ai_limits() ->> 'account_suggest')::int),
    'rank', coalesce(a.ai_rank_limit, (public.ai_limits() ->> 'account_rank')::int),
    'custom', a.ai_suggest_limit is not null or a.ai_rank_limit is not null)
  from public.accounts a where a.id = p_account;
$$;

create or replace function public.ai_account_used(p_account uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'suggest', count(*) filter (where kind = 'suggest'),
    'rank', count(*) filter (where kind = 'rank'))
  from public.ai_runs where account_id = p_account and created_at >= date_trunc('month', now());
$$;

/** Uses left this month on a board: the smaller of what the board and the whole client have left. */
create or replace function public.ai_left(p_board uuid, p_account uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'suggest', greatest(0, least((l ->> 'suggest')::int - (bu ->> 'suggest')::int, (al ->> 'suggest')::int - (au ->> 'suggest')::int)),
    'rank', greatest(0, least((l ->> 'rank')::int - (bu ->> 'rank')::int, (al ->> 'rank')::int - (au ->> 'rank')::int)))
  from (select public.ai_limits() l, public.ai_used(p_board) bu, public.ai_account_limits(p_account) al, public.ai_account_used(p_account) au) x;
$$;
revoke execute on function public.ai_account_limits(uuid) from public, anon, authenticated;
revoke execute on function public.ai_account_used(uuid) from public, anon, authenticated;
revoke execute on function public.ai_left(uuid, uuid) from public, anon, authenticated;

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
    'left', public.ai_left(p_board, c.account_id),
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
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by position, created_at), '[]') from public.categories where board_id = p_board),
    'ideas', ideas);
end $$;

/** Platform admin: a different monthly AI limit for one client (null goes back to the default). */
create or replace function public.admin_set_ai_quota(p_account uuid, p_rank int, p_suggest int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  if p_rank < 0 or p_suggest < 0 or p_rank > 1000 or p_suggest > 1000 then raise exception 'Ingresá un número entre 0 y 1.000.'; end if;
  update public.accounts set ai_rank_limit = p_rank, ai_suggest_limit = p_suggest where id = p_account;
  if not found then raise exception 'La cuenta no existe.'; end if;
  return public.ai_account_limits(p_account);
end $$;
grant execute on function public.admin_set_ai_quota(uuid, int, int) to authenticated;

-- Consumo IA also shows each client's monthly limit.
create or replace function public.admin_ai_overview(p_month text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m_start timestamptz;
  m_end timestamptz;
begin
  perform public.require_super_admin();
  m_start := coalesce(to_timestamp(p_month, 'YYYY-MM'), date_trunc('month', now()));
  m_end := m_start + interval '1 month';
  return jsonb_build_object(
    'month', to_char(m_start, 'YYYY-MM'),
    'defaults', public.ai_limits(),
    'months', (
      select jsonb_agg(jsonb_build_object('month', to_char(g, 'YYYY-MM'), 'runs', coalesce(r.runs, 0), 'cost_usd', round(coalesce(r.cost, 0), 4)) order by g desc)
      from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') g
      left join (select date_trunc('month', created_at) mo, count(*) runs, sum(cost_usd) cost from public.ai_runs group by 1) r on r.mo = g),
    'totals', (
      select jsonb_build_object('runs', count(*), 'suggest', count(*) filter (where kind = 'suggest'), 'rank', count(*) filter (where kind = 'rank'),
        'cost_usd', round(coalesce(sum(cost_usd), 0), 4), 'input_tokens', coalesce(sum(input_tokens), 0), 'output_tokens', coalesce(sum(output_tokens), 0),
        'clients', count(distinct account_id))
      from public.ai_runs where created_at >= m_start and created_at < m_end),
    'clients', coalesce((
      select jsonb_agg(c order by (c ->> 'cost_usd')::numeric desc, c ->> 'name')
      from (
        select jsonb_build_object(
          'account_id', a.id, 'name', coalesce(p.name, p.email), 'email', p.email,
          'plan', initcap(public.account_plan(a.id)),
          'runs', count(r.id), 'suggest', count(r.id) filter (where r.kind = 'suggest'), 'rank', count(r.id) filter (where r.kind = 'rank'),
          'cost_usd', round(coalesce(sum(r.cost_usd), 0), 4),
          'tokens', coalesce(sum(r.input_tokens + r.output_tokens), 0),
          'last_at', max(r.created_at),
          'limits', public.ai_account_limits(a.id),
          'boards', coalesce((
            select jsonb_agg(jsonb_build_object('board_id', b.id, 'name', b.name, 'suggest', x.suggest, 'rank', x.rank, 'cost_usd', round(x.cost, 4)) order by x.cost desc)
            from (select board_id, count(*) filter (where kind = 'suggest') suggest, count(*) filter (where kind = 'rank') rank, sum(cost_usd) cost
                  from public.ai_runs where account_id = a.id and created_at >= m_start and created_at < m_end group by board_id) x
            join public.boards b on b.id = x.board_id), '[]')) as c
        from public.accounts a
        join public.profiles p on p.id = a.owner_id
        left join public.ai_runs r on r.account_id = a.id and r.created_at >= m_start and r.created_at < m_end
        where public.account_plan(a.id) = 'enterprise' or r.id is not null
        group by a.id, p.name, p.email) s), '[]'));
end $$;
grant execute on function public.admin_ai_overview(text) to authenticated;
