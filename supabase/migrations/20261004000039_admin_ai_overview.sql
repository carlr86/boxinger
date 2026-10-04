-- Boxinger · Admin › Consumo IA
-- AI assistant use and cost per client for one month, with each client's boards, the platform totals
-- and the last 6 months. Enterprise clients that didn't use it show up with zeros.

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
