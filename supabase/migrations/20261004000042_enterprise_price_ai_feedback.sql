-- Boxinger · Enterprise at USD 19.90 and AI suggestion feedback
-- 1) Enterprise now includes up to 20 members per team (the platform admin can raise it or make it unlimited per
--    client). Clients already on Enterprise keep unlimited members: they have a negotiated price.
-- 2) The team can discard a suggestion (the AI avoids similar ones next time) or clear them all, and a suggestion
--    added to the board leaves the list.

alter table public.accounts add column if not exists member_limit int check (member_limit between 1 and 10000);
alter table public.accounts add column if not exists members_unlimited boolean not null default false;
update public.accounts a set members_unlimited = true
where public.account_plan(a.id) = 'enterprise' and not a.members_unlimited;

-- Members per team besides the owner: 4 on Pro; on Enterprise 20, or what the platform admin set for the client.
create or replace function public.account_member_limit(p_account uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when public.account_plan(p_account) <> 'enterprise' then 4
    when a.members_unlimited then null
    else coalesce(a.member_limit, 20) end
  from public.accounts a where a.id = p_account;
$$;

/** Platform admin: the client's limits (members per team on Enterprise, monthly AI uses). */
create or replace function public.admin_client_limits(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.accounts;
begin
  perform public.require_super_admin();
  select * into a from public.accounts where id = p_account;
  if a.id is null then raise exception 'La cuenta no existe.'; end if;
  return jsonb_build_object(
    'plan', public.account_plan(a.id),
    'members', jsonb_build_object('limit', coalesce(a.member_limit, 20), 'unlimited', a.members_unlimited, 'custom', a.member_limit is not null or a.members_unlimited, 'default', 20),
    'ai', public.ai_account_limits(a.id),
    'ai_defaults', public.ai_limits());
end $$;
grant execute on function public.admin_client_limits(uuid) to authenticated;

create or replace function public.admin_set_client_limits(p_account uuid, p_members int, p_members_unlimited boolean, p_rank int, p_suggest int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  if p_members is not null and (p_members < 1 or p_members > 10000) then raise exception 'Ingresá una cantidad de miembros entre 1 y 10.000.'; end if;
  if p_rank < 0 or p_suggest < 0 or p_rank > 1000 or p_suggest > 1000 then raise exception 'Ingresá un número entre 0 y 1.000.'; end if;
  update public.accounts set member_limit = p_members, members_unlimited = coalesce(p_members_unlimited, false),
    ai_rank_limit = p_rank, ai_suggest_limit = p_suggest
  where id = p_account;
  if not found then raise exception 'La cuenta no existe.'; end if;
  return public.admin_client_limits(p_account);
end $$;
grant execute on function public.admin_set_client_limits(uuid, int, boolean, int, int) to authenticated;

-- ───────────────────────── AI suggestion feedback ─────────────────────────
alter table public.boards add column if not exists ai_discarded jsonb not null default '[]';

/** Takes one suggestion off the board's last list; discarded ones are remembered (last 30) so the AI avoids them. */
create or replace function public.ai_dismiss_suggestion(p_board uuid, p_title text, p_discard boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.board_context(p_board, public.require_user());
  t text := trim(coalesce(p_title, ''));
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'super') then raise exception 'El asistente de IA es solo para el Admin del equipo.' using errcode = '42501'; end if;
  update public.ai_runs r set result = jsonb_set(r.result, '{suggestions}',
      coalesce((select jsonb_agg(s) from jsonb_array_elements(r.result -> 'suggestions') s where s ->> 'title' <> t), '[]'))
  where r.id = (select id from public.ai_runs where board_id = p_board and kind = 'suggest' order by created_at desc limit 1);
  if p_discard and t <> '' then
    update public.boards b set ai_discarded = (
      select coalesce(jsonb_agg(q.x order by q.ord), '[]') from (
        select jsonb_build_object('title', left(t, 120), 'at', now()) as x, 0::bigint as ord
        union all
        select e.x, e.ord from jsonb_array_elements(b.ai_discarded) with ordinality as e(x, ord) where e.x ->> 'title' <> left(t, 120)
        order by 2 limit 30) q)
    where b.id = p_board;
  end if;
end $$;
grant execute on function public.ai_dismiss_suggestion(uuid, text, boolean) to authenticated;

/** Empties the board's last list of suggestions (nothing is remembered as discarded). */
create or replace function public.ai_clear_suggestions(p_board uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.board_ctx := public.board_context(p_board, public.require_user());
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if coalesce(c.role, '') not in ('admin', 'super') then raise exception 'El asistente de IA es solo para el Admin del equipo.' using errcode = '42501'; end if;
  update public.ai_runs set result = jsonb_set(result, '{suggestions}', '[]')
  where board_id = p_board and kind = 'suggest' and created_at >= now() - interval '1 year';
end $$;
grant execute on function public.ai_clear_suggestions(uuid) to authenticated;

-- Adding a suggestion to the board also takes it off the list (p_suggestion = its original title).
drop function if exists public.create_ai_idea(uuid, text, text, uuid);
create or replace function public.create_ai_idea(p_board uuid, p_title text, p_description text, p_category uuid, p_suggestion text default null)
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
  if p_suggestion is not null then perform public.ai_dismiss_suggestion(p_board, p_suggestion, false); end if;
  return new_id;
end $$;
grant execute on function public.create_ai_idea(uuid, text, text, uuid, text) to authenticated;

-- The model also gets the discarded suggestions, to avoid proposing similar ones.
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
    'discarded', coalesce((select jsonb_agg(d ->> 'title') from jsonb_array_elements(b.ai_discarded) d), '[]'),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by position, created_at), '[]') from public.categories where board_id = p_board),
    'ideas', ideas);
end $$;
