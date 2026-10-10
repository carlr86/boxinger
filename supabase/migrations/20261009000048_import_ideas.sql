-- Boxinger · Import ideas from CSV / Excel (Pro and Enterprise, team Admin only)
-- The file is read in the browser; import_ideas gets the rows already mapped, checks them again and inserts them
-- straight into ideas (no "new idea" notices, no emails). Historical ideas keep their original date.
-- Who asked for each idea is kept as text and only the team sees it; if that email belongs to someone already
-- in the board, the idea is theirs (so they get the Roadmap and launch notices). Each import can be undone.

create table public.idea_imports (
  id          bigint generated always as identity primary key,
  board_id    uuid not null references public.boards (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,
  file_name   text,
  rows        int not null default 0,
  created_at  timestamptz not null default now()
);
create index idea_imports_board_idx on public.idea_imports (board_id, created_at desc);
alter table public.idea_imports enable row level security;

alter table public.ideas
  add column imported boolean not null default false,
  add column import_id bigint references public.idea_imports (id) on delete set null,
  add column requester_name text,
  add column requester_email text;
create index ideas_import_idx on public.ideas (import_id) where import_id is not null;

-- Old feedback often has no (or a very short) description.
alter table public.ideas drop constraint ideas_description_check;
alter table public.ideas add constraint ideas_description_check
  check (char_length(description) <= 2000 and (imported or char_length(description) >= 20));

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
  if char_length(d) > 2000 or (char_length(d) < 20 and not i.imported) then raise exception 'La descripción debe tener entre 20 y 2.000 caracteres'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = i.board_id) then raise exception 'Elegí una categoría'; end if;
  update public.ideas set title = t, description = d, category_id = p_category, updated_at = now() where id = p_id;
end $$;

-- Only whoever manages the board, on a paid plan, with the board writable.
create or replace function public.require_import(p_board uuid)
returns public.board_ctx language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  c public.board_ctx := public.board_context(p_board, uid);
begin
  if c.board_id is null then raise exception 'El buzón no existe.'; end if;
  if not coalesce(public.board_can_manage(p_board, uid), false) then
    raise exception 'Solo el Admin del equipo puede importar ideas.' using errcode = '42501';
  end if;
  if not c.pro then raise exception 'Importar ideas está disponible en los planes Pro y Enterprise.'; end if;
  perform public.writable_board(p_board, uid);
  return c;
end $$;
revoke execute on function public.require_import(uuid) from public, anon, authenticated;

-- p_rows: [{row, title, description, category, date: 'YYYY-MM-DD', name, email, status}]
-- Returns {import_id, created, skipped: [{row, reason}]}; reason is sin_titulo, titulo_corto, repetida or existe.
create or replace function public.import_ideas(p_board uuid, p_file text, p_origin text, p_default_category uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_import(p_board);
  uid uuid := auth.uid();
  r jsonb;
  n int;
  imp bigint;
  created int := 0;
  skipped jsonb := '[]';
  seen text[] := '{}';
  t text; d text; k text; cat uuid; st text; dt date; at timestamptz; em text; who uuid;
begin
  if p_origin not in ('comunidad', 'equipo') then raise exception 'Origen inválido.'; end if;
  if not exists (select 1 from public.categories where id = p_default_category and board_id = p_board) then raise exception 'Elegí una categoría'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'El archivo no tiene filas.'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'Podés importar hasta 1.000 ideas por vez.'; end if;
  select count(*) into n from public.idea_imports where board_id = p_board and created_at > now() - interval '1 day';
  perform public.rate_limit('importaciones', n, 10);

  insert into public.idea_imports (board_id, user_id, file_name) values (p_board, uid, left(nullif(trim(coalesce(p_file, '')), ''), 200)) returning id into imp;

  for r in select * from jsonb_array_elements(p_rows) loop
    t := regexp_replace(trim(coalesce(r ->> 'title', '')), '\s+', ' ', 'g');
    d := trim(coalesce(r ->> 'description', ''));
    if t = '' then skipped := skipped || jsonb_build_object('row', r -> 'row', 'reason', 'sin_titulo'); continue; end if;
    if char_length(t) < 5 then skipped := skipped || jsonb_build_object('row', r -> 'row', 'reason', 'titulo_corto'); continue; end if;
    -- a long title is cut and kept whole in the description
    if char_length(t) > 80 then
      d := t || case when d <> '' then E'\n\n' || d else '' end;
      t := rtrim(left(t, 79)) || '…';
    end if;
    d := left(d, 2000);
    k := lower(t);
    if k = any (seen) then skipped := skipped || jsonb_build_object('row', r -> 'row', 'reason', 'repetida'); continue; end if;
    seen := seen || k;
    if exists (select 1 from public.ideas where board_id = p_board and lower(title) = k) then
      skipped := skipped || jsonb_build_object('row', r -> 'row', 'reason', 'existe'); continue;
    end if;

    select id into cat from public.categories
    where board_id = p_board and lower(trim(name)) = lower(trim(coalesce(r ->> 'category', ''))) limit 1;
    cat := coalesce(cat, p_default_category);
    st := coalesce(nullif(r ->> 'status', ''), 'pendiente');
    if st not in ('pendiente', 'en_revision', 'aprobada') then st := 'pendiente'; end if;
    begin
      dt := case when coalesce(r ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (r ->> 'date')::date end;
    exception when others then dt := null;
    end;
    at := case when dt is null or dt >= current_date then now()
               else (dt::timestamp + interval '12 hours') at time zone 'America/Argentina/Buenos_Aires' end;
    em := lower(trim(coalesce(r ->> 'email', '')));
    if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then em := null; end if;
    who := null;
    if em is not null then
      select p.id into who from public.profiles p
      where lower(p.email) = em and (public.board_context(p_board, p.id)).role in ('guest', 'member', 'admin') limit 1;
    end if;

    insert into public.ideas (board_id, author_id, origin, title, description, category_id, status, approved_at,
                              imported, import_id, requester_name, requester_email, created_at, updated_at)
    values (p_board, who, p_origin, t, d, cat, st, case when st = 'aprobada' then at end,
            true, imp, left(nullif(trim(coalesce(r ->> 'name', '')), ''), 120), em, at, now());
    created := created + 1;
  end loop;

  if created = 0 then
    delete from public.idea_imports where id = imp;
    imp := null;
  else
    update public.idea_imports set rows = created where id = imp;
    insert into public.audit_log (actor_id, action, target_type, target_id, meta)
    values (uid, 'ideas_imported', 'board', p_board, jsonb_build_object('import_id', imp, 'created', created, 'skipped', jsonb_array_length(skipped)));
    perform public.touch_board(p_board);
  end if;
  return jsonb_build_object('import_id', imp, 'created', created, 'skipped', skipped);
end $$;
grant execute on function public.import_ideas(uuid, text, text, uuid, jsonb) to authenticated;

create or replace function public.get_imports(p_board uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_import(p_board);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'file_name', x.file_name, 'rows', x.rows, 'created_at', x.created_at,
             'user_name', coalesce(p.name, p.email), 'left', (select count(*) from public.ideas i where i.import_id = x.id))
           order by x.created_at desc)
    from public.idea_imports x left join public.profiles p on p.id = x.user_id
    where x.board_id = p_board), '[]');
end $$;
grant execute on function public.get_imports(uuid) to authenticated;

-- Deletes the ideas of one import, with their votes, comments and notices.
create or replace function public.undo_import(p_id bigint)
returns int language plpgsql security definer set search_path = public as $$
declare
  x public.idea_imports;
  ids bigint[];
begin
  select * into x from public.idea_imports where id = p_id;
  if x.id is null then raise exception 'La importación no existe.'; end if;
  perform public.require_import(x.board_id);
  select coalesce(array_agg(id), '{}') into ids from public.ideas where import_id = p_id;
  delete from public.notifications where payload ->> 'idea_id' = any (select i::text from unnest(ids) i);
  delete from public.ideas where id = any (ids);
  delete from public.idea_imports where id = p_id;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'import_undone', 'board', x.board_id, jsonb_build_object('import_id', p_id, 'deleted', cardinality(ids)));
  perform public.touch_board(x.board_id);
  return cardinality(ids);
end $$;
grant execute on function public.undo_import(bigint) to authenticated;

-- Ideas carry 'imported'; the team also sees who asked for them. An imported idea with no account behind it
-- shows the requester's name to the team and "Importada" to the Community.
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
    'hidden', i.hidden, 'created_at', i.created_at, 'author_id', i.author_id, 'ai', i.ai_generated, 'imported', i.imported,
    'author_name', coalesce((select name from public.profiles where id = i.author_id),
                            case when i.imported then case when p_team then coalesce(i.requester_name, 'Importada') else 'Importada' end end,
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
    'requester_name', i.requester_name, 'requester_email', i.requester_email)
    when public.board_roadmap_public(i.board_id) then jsonb_build_object(
    'rm_col', i.rm_col, 'rm_order', i.rm_order, 'dev_status', i.dev_status, 'launched_at', i.launched_at)
    else '{}'::jsonb end
  from v;
$$;
revoke execute on function public.idea_json(public.ideas, uuid, boolean, int) from public, anon, authenticated;
