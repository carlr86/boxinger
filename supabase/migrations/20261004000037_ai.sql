-- Boxinger · AI assistant (Enterprise)
-- Two helpers on a board: suggest new ideas from what the team says the product is, and pick the best
-- pending ideas to approve into the Backlog. The model runs on the server (src/app/api/ai); the database
-- keeps the product description, what each run cost and its result, and enforces who can use it and how often.

alter table public.boards add column if not exists ai_context text check (char_length(ai_context) <= 2000);

create table if not exists public.ai_runs (
  id bigint generated always as identity primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('suggest', 'rank')),
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  result jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ai_runs_board_idx on public.ai_runs (board_id, kind, created_at desc);
create index if not exists ai_runs_account_idx on public.ai_runs (account_id, created_at desc);
alter table public.ai_runs enable row level security; -- read only through the functions below

-- Uses per board per calendar month, and for the whole platform per day (a safety net for the bill).
create or replace function public.ai_limits()
returns jsonb language sql immutable as $$
  select '{"suggest": 30, "rank": 15, "platform_daily": 500}'::jsonb;
$$;

create or replace function public.ai_used(p_board uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'suggest', count(*) filter (where kind = 'suggest'),
    'rank', count(*) filter (where kind = 'rank'))
  from public.ai_runs where board_id = p_board and created_at >= date_trunc('month', now());
$$;
revoke execute on function public.ai_used(uuid) from public, anon, authenticated;

/** What the assistant panel needs: whether the plan includes it, the description, uses left and the last results. */
create or replace function public.ai_status(p_board uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  c public.board_ctx := public.board_context(p_board, uid);
  last_s public.ai_runs;
  last_r public.ai_runs;
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'member', 'super') then raise exception 'El asistente de IA es solo para el Equipo.' using errcode = '42501'; end if;
  select * into last_s from public.ai_runs where board_id = p_board and kind = 'suggest' order by created_at desc limit 1;
  select * into last_r from public.ai_runs where board_id = p_board and kind = 'rank' order by created_at desc limit 1;
  return jsonb_build_object(
    'enabled', public.account_plan(c.account_id) = 'enterprise',
    'can_edit', coalesce(public.board_can_manage(p_board, uid), false) or c.role = 'super',
    'context', (select ai_context from public.boards where id = p_board),
    'used', public.ai_used(p_board),
    'limits', public.ai_limits(),
    'last_suggest', case when last_s.id is null then null else jsonb_build_object('at', last_s.created_at, 'result', last_s.result) end,
    'last_rank', case when last_r.id is null then null else jsonb_build_object('at', last_r.created_at, 'result', last_r.result) end);
end $$;
grant execute on function public.ai_status(uuid) to authenticated;

create or replace function public.set_ai_context(p_board uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := nullif(trim(coalesce(p_text, '')), '');
begin
  perform public.require_board_admin(p_board);
  if char_length(v) > 2000 then raise exception 'La descripción puede tener hasta 2.000 caracteres.'; end if;
  update public.boards set ai_context = v where id = p_board;
end $$;
grant execute on function public.set_ai_context(uuid, text) to authenticated;

/**
 * Server only: checks that p_uid can run the assistant now and returns what the model reads.
 * Ideas are the board's own (never emails or voter names); a rank run gets the open ones, at most 300.
 */
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
  if coalesce(c.role, '') not in ('admin', 'member', 'super') then raise exception 'El asistente de IA es solo para el Equipo.' using errcode = '42501'; end if;
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
revoke execute on function public.ai_begin(uuid, uuid, text) from public, anon, authenticated;

/** Server only: stores a finished run (a failed call never gets here, so it doesn't use up the month). */
create or replace function public.ai_finish(p_board uuid, p_uid uuid, p_kind text, p_model text, p_in int, p_out int, p_cost numeric, p_result jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.ai_runs (board_id, account_id, user_id, kind, model, input_tokens, output_tokens, cost_usd, result)
  select p_board, t.account_id, p_uid, p_kind, p_model, p_in, p_out, p_cost, p_result
  from public.boards b join public.teams t on t.id = b.team_id where b.id = p_board;
$$;
revoke execute on function public.ai_finish(uuid, uuid, text, text, int, int, numeric, jsonb) from public, anon, authenticated;

/** Platform admin: AI use and cost per client, this month and last month. */
create or replace function public.admin_ai_usage(p_account uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'account_id', r.account_id, 'month', r.month, 'runs', r.runs, 'suggest', r.suggest, 'rank', r.rank,
      'cost_usd', round(r.cost, 4), 'tokens', r.tokens) order by r.month desc, r.cost desc)
    from (
      select account_id, to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*) runs,
             count(*) filter (where kind = 'suggest') suggest, count(*) filter (where kind = 'rank') rank,
             sum(cost_usd) cost, sum(input_tokens + output_tokens) tokens
      from public.ai_runs
      where created_at >= date_trunc('month', now()) - interval '1 month'
        and (p_account is null or account_id = p_account)
      group by 1, 2) r), '[]');
end $$;
grant execute on function public.admin_ai_usage(uuid) to authenticated;
