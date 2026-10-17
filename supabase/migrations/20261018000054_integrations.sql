-- Boxinger · Integrations (Pro and Enterprise): ideas that arrive by themselves through a board's API key
-- (Zapier, Make, Google Forms or any tool that can send a web request). Slack and the widget will use the
-- same door later (ingest_idea). They come in hidden, marked with where they came from, so the team takes
-- a look, edits them if needed and publishes them. Who asked for each one is kept as text, like imports.

alter table public.ideas
  add column source text check (source in ('api', 'slack', 'widget')),
  add column external_ref text;
-- The same message or form answer sent twice becomes one idea.
create unique index ideas_external_ref_uidx on public.ideas (board_id, source, external_ref) where external_ref is not null;
create index ideas_source_idx on public.ideas (board_id, created_at desc) where source is not null;

-- Messages from other tools are often short.
alter table public.ideas drop constraint ideas_description_check;
alter table public.ideas add constraint ideas_description_check
  check (char_length(description) <= 2000 and (imported or source is not null or char_length(description) >= 20));

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
  if char_length(d) > 2000 or (char_length(d) < 20 and not i.imported and i.source is null) then raise exception 'La descripción debe tener entre 20 y 2.000 caracteres'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = i.board_id) then raise exception 'Elegí una categoría'; end if;
  update public.ideas set title = t, description = d, category_id = p_category, updated_at = now() where id = p_id;
end $$;

-- One API key per board. Only its sha-256 is stored; the key itself is shown once, when it is created.
create table public.board_integrations (
  id               uuid primary key default gen_random_uuid(),
  board_id         uuid not null references public.boards (id) on delete cascade,
  kind             text not null check (kind in ('api', 'slack', 'widget')),
  token_hash       text not null unique,
  token_hint       text not null,                                  -- last 4 characters, to recognize it
  origin           text not null default 'comunidad' check (origin in ('comunidad', 'equipo')),
  default_category uuid references public.categories (id) on delete set null,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  last_used_at     timestamptz,
  use_count        int not null default 0
);
create unique index board_integrations_kind_uidx on public.board_integrations (board_id, kind);
alter table public.board_integrations enable row level security;
-- No policies: only these functions and the server read it.

-- Whoever manages the board; p_paid also asks for Pro or Enterprise and a writable board.
create or replace function public.require_integrations(p_board uuid, p_paid boolean)
returns public.board_ctx language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  c public.board_ctx := public.board_context(p_board, uid);
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if not coalesce(public.board_can_manage(p_board, uid), false) then
    raise exception 'Solo el Admin del equipo puede configurar las integraciones.' using errcode = '42501';
  end if;
  if p_paid then
    if not c.pro then raise exception 'Las integraciones están disponibles en los planes Pro y Enterprise.'; end if;
    perform public.writable_board(p_board, uid);
  end if;
  return c;
end $$;
revoke execute on function public.require_integrations(uuid, boolean) from public, anon, authenticated;

create or replace function public.get_integrations(p_board uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_integrations(p_board, false);
  return jsonb_build_object(
    'api', (select jsonb_build_object('hint', x.token_hint, 'origin', x.origin, 'default_category', x.default_category,
                    'created_at', x.created_at, 'created_by', coalesce(p.name, p.email), 'last_used_at', x.last_used_at, 'use_count', x.use_count)
            from public.board_integrations x left join public.profiles p on p.id = x.created_by
            where x.board_id = p_board and x.kind = 'api'),
    'pending', (select count(*) from public.ideas where board_id = p_board and source is not null and hidden));
end $$;
grant execute on function public.get_integrations(uuid) to authenticated;

-- Creates the board's API key, or replaces it (the old one stops working). Returns the key, only this once.
create or replace function public.create_api_key(p_board uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  tok text := 'bxk_' || encode(extensions.gen_random_bytes(24), 'hex');
  replaced boolean;
begin
  perform public.require_integrations(p_board, true);
  replaced := exists (select 1 from public.board_integrations where board_id = p_board and kind = 'api');
  insert into public.board_integrations (board_id, kind, token_hash, token_hint, default_category, created_by)
  values (p_board, 'api', encode(sha256(convert_to(tok, 'UTF8')), 'hex'), right(tok, 4),
          (select id from public.categories where board_id = p_board order by position limit 1), auth.uid())
  on conflict (board_id, kind) do update
    set token_hash = excluded.token_hash, token_hint = excluded.token_hint, created_by = excluded.created_by,
        created_at = now(), last_used_at = null, use_count = 0;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), case when replaced then 'api_key_rotated' else 'api_key_created' end, 'board', p_board, '{}');
  return tok;
end $$;
grant execute on function public.create_api_key(uuid) to authenticated;

-- Deleting works on any plan, so a board back on Free can still switch it off.
create or replace function public.delete_api_key(p_board uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_integrations(p_board, false);
  delete from public.board_integrations where board_id = p_board and kind = 'api';
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'api_key_deleted', 'board', p_board, '{}');
end $$;
grant execute on function public.delete_api_key(uuid) to authenticated;

-- Who the ideas count as (Comunidad or Equipo) and the category they get when none matches.
create or replace function public.set_integration_options(p_board uuid, p_origin text, p_category uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_integrations(p_board, true);
  if p_origin not in ('comunidad', 'equipo') then raise exception 'Origen inválido.'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = p_board) then raise exception 'Elegí una categoría'; end if;
  update public.board_integrations set origin = p_origin, default_category = p_category where board_id = p_board and kind = 'api';
end $$;
grant execute on function public.set_integration_options(uuid, text, uuid) to authenticated;

-- The door every integration uses (server only, with the service key). p_hash is the sha-256 of the key.
-- Returns {id, duplicate}. Errors: 28000 bad key, 42501 plan or suspended board, 22023 bad title, 54000 too many.
create or replace function public.ingest_idea(p_hash text, p_source text, p_title text, p_description text,
                                              p_name text, p_email text, p_category text, p_external_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  if not c.pro then raise exception 'Las integraciones están disponibles en los planes Pro y Enterprise.' using errcode = '42501'; end if;
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
end $$;
revoke execute on function public.ingest_idea(text, text, text, text, text, text, text, text) from public, anon, authenticated;

-- The team sees where an idea came from and who asked for it; the Community sees «Recibida por el Equipo».
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
    'hidden', i.hidden, 'created_at', i.created_at, 'author_id', i.author_id, 'ai', i.ai_generated, 'imported', i.imported, 'image_path', i.image_path,
    'author_name', coalesce((select name from public.profiles where id = i.author_id),
                            case when i.imported then case when p_team then coalesce(i.requester_name, 'Importada') else 'Importada' end
                                 when i.source is not null then case when p_team then coalesce(i.requester_name, i.requester_email, 'Recibida por el Equipo') else 'Recibida por el Equipo' end end,
                            'Usuario eliminado'),
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
    'chk_design', i.chk_design, 'chk_prd', i.chk_prd, 'growth', to_jsonb(i.growth),
    'requester_name', i.requester_name, 'requester_email', i.requester_email, 'source', i.source)
    when public.board_roadmap_public(i.board_id) then jsonb_build_object(
    'rm_col', i.rm_col, 'rm_order', i.rm_order, 'dev_status', i.dev_status, 'launched_at', i.launched_at)
    else '{}'::jsonb end
  from v;
$$;
revoke execute on function public.idea_json(public.ideas, uuid, boolean, int) from public, anon, authenticated;
