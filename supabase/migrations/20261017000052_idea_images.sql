-- Boxinger · One image per idea (Pro and Enterprise)
-- Files live in a PRIVATE bucket (idea-images): only whoever can see the board can read them (signed URLs), so an
-- image on a private or invite-only board can't be opened with just its link. The browser shrinks every image
-- (≈1600 px, ≈250 KB, plus a ≈480 px thumbnail) and re-encodes it, which also drops GPS and other hidden data.
-- Paths: <board_id>/<uuid>.webp and <board_id>/<uuid>-t.webp (or .jpg). Unused files are removed by the daily cron.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idea-images', 'idea-images', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.ideas add column image_path text;

-- Who can upload to a board's folder: signed in, paid plan, board writable, and allowed to post ideas there (or the team).
create or replace function public.can_upload_idea_image(p_board text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c public.board_ctx;
begin
  if uid is null then return false; end if;
  c := public.board_context(p_board::uuid, uid);
  return c.board_id is not null and c.pro and c.board_status = 'active' and c.account_status = 'active'
     and (coalesce(c.role in ('admin', 'member'), false) or coalesce(public.board_can_create_idea(c.board_id, uid), false));
exception when invalid_text_representation then
  return false;
end $$;
grant execute on function public.can_upload_idea_image(text) to authenticated;

-- Who can read a board's images: whoever can see the board (also anonymous visitors of public boards).
create or replace function public.can_view_idea_image(p_board text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  c public.board_ctx;
begin
  c := public.board_context(p_board::uuid, auth.uid());
  return c.board_id is not null and public.can_see_board(c, c.visibility);
exception when invalid_text_representation then
  return false;
end $$;
grant execute on function public.can_view_idea_image(text) to anon, authenticated;

create or replace function public.can_manage_board_files(p_board text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(public.board_can_manage(p_board::uuid, auth.uid()), false);
exception when invalid_text_representation then
  return false;
end $$;
grant execute on function public.can_manage_board_files(text) to authenticated;

create policy "idea image upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'idea-images' and public.can_upload_idea_image((storage.foldername(name))[1]));
create policy "idea image read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'idea-images' and public.can_view_idea_image((storage.foldername(name))[1]));
create policy "idea image delete" on storage.objects for delete to authenticated
  using (bucket_id = 'idea-images' and (owner_id = auth.uid()::text or public.can_manage_board_files((storage.foldername(name))[1])));

-- Sets (or removes, with null) an idea's image. The author or the team; adding one needs a paid plan.
create or replace function public.set_idea_image(p_id bigint, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  i public.ideas;
  c public.board_ctx;
  p text := nullif(trim(coalesce(p_path, '')), '');
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  c := public.board_context(i.board_id, uid);
  if not (uid = i.author_id or coalesce(c.role in ('admin', 'member'), false)) then
    raise exception 'Solo quien cargó la idea o el Equipo pueden cambiar su imagen.' using errcode = '42501';
  end if;
  perform public.writable_board(i.board_id, uid);
  if p is not null then
    if not c.pro then raise exception 'Adjuntar imágenes está disponible en los planes Pro y Enterprise.'; end if;
    if p !~ ('^' || i.board_id::text || '/[A-Za-z0-9_-]+\.(webp|jpg)$') then raise exception 'Imagen inválida.'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'idea-images' and o.name = p) then raise exception 'La imagen no se subió.'; end if;
  end if;
  update public.ideas set image_path = p, updated_at = now() where id = p_id;
  perform public.touch_board(i.board_id);
end $$;
grant execute on function public.set_idea_image(bigint, text) to authenticated;

-- Files nobody uses any more (image changed or removed, idea deleted), older than a day: the daily cron deletes them.
create or replace function public.cleanup_idea_images()
returns setof text language sql stable security definer set search_path = public as $$
  select o.name from storage.objects o
  where o.bucket_id = 'idea-images' and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.ideas i where i.image_path is not null
                    and (i.image_path = o.name or regexp_replace(i.image_path, '(\.[a-z]+)$', '-t\1') = o.name));
$$;
revoke execute on function public.cleanup_idea_images() from public, anon, authenticated;

-- Space used per bucket (bytes), for Admin and the daily check against the Supabase plan.
create or replace function public.storage_usage()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_bytes', coalesce(sum((o.metadata ->> 'size')::bigint), 0),
    'buckets', coalesce((select jsonb_agg(jsonb_build_object('bucket', b, 'files', n, 'bytes', s) order by s desc)
                         from (select bucket_id b, count(*) n, coalesce(sum((metadata ->> 'size')::bigint), 0) s from storage.objects group by bucket_id) x), '[]'))
  from storage.objects o;
$$;
revoke execute on function public.storage_usage() from public, anon, authenticated;

create or replace function public.admin_storage_usage()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return public.storage_usage();
end $$;
grant execute on function public.admin_storage_usage() to authenticated;

create or replace function public.merge_ideas(p_source bigint, p_target bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  src public.ideas;
  dst public.ideas;
  c public.board_ctx;
  b public.boards;
  m bigint;
  before_votes int;
  moved_votes int;
  moved_comments int;
  author_vote boolean := false;
  notified int := 0;
  who uuid;
begin
  if p_source = p_target then raise exception 'Elegí otra idea para unir.'; end if;
  select * into src from public.ideas where id = p_source for update;
  select * into dst from public.ideas where id = p_target for update;
  if src.id is null or dst.id is null then raise exception 'La idea no existe.'; end if;
  if src.board_id <> dst.board_id then raise exception 'Solo se pueden unir ideas del mismo buzón.'; end if;
  c := public.board_context(src.board_id, uid);
  if not coalesce(public.board_can_manage(src.board_id, uid), false) then
    raise exception 'Solo el Admin del equipo puede unir ideas.' using errcode = '42501';
  end if;
  if not c.pro then raise exception 'Unir ideas está disponible en los planes Pro y Enterprise.'; end if;
  perform public.writable_board(src.board_id, uid);
  select * into b from public.boards where id = src.board_id;

  insert into public.idea_merges (board_id, source_id, target_id, source_title, source_description, source_author_id, source_created_at, merged_by)
  values (src.board_id, src.id, dst.id, src.title, src.description, src.author_id, src.created_at, uid)
  returning id into m;
  -- ideas merged into the duplicate before now belong to the main one
  update public.idea_merges set target_id = dst.id where target_id = src.id and id <> m;

  -- Bell notice for the duplicate's author and voters (before their votes move), except whoever merges and blocked people.
  for who in
    select x.u from (
      select v.user_id u from public.votes v where v.idea_id = src.id
      union select src.author_id where src.author_id is not null
    ) x
    join public.profiles p on p.id = x.u
    where x.u is distinct from uid and p.status <> 'blocked'
      and (public.board_context(src.board_id, x.u)).role is distinct from 'blocked'
  loop
    insert into public.notifications (user_id, kind, payload, dedupe_key)
    values (who, 'idea_merged', jsonb_build_object('idea_id', dst.id, 'title', dst.title, 'from_title', src.title,
              'board_name', b.name, 'slug', b.slug, 'mine', who = src.author_id), 'n:merged:' || src.id || ':' || who)
    on conflict (dedupe_key) do nothing;
    notified := notified + 1;
  end loop;

  -- Votes: whoever voted both keeps the main idea's vote; the main idea's author can't vote their own idea.
  select count(*) into before_votes from public.votes where idea_id = dst.id;
  insert into public.votes (idea_id, user_id, value, created_at, updated_at)
  select dst.id, v.user_id, v.value, v.created_at, now() from public.votes v
  where v.idea_id = src.id and v.user_id is distinct from dst.author_id
  on conflict (idea_id, user_id) do nothing;
  get diagnostics moved_votes = row_count;
  -- The duplicate's author asked for it: an "importante" vote on the main idea.
  if src.author_id is not null and src.author_id is distinct from dst.author_id then
    insert into public.votes (idea_id, user_id, value, created_at, updated_at)
    values (dst.id, src.author_id, 'importante', src.created_at, now())
    on conflict (idea_id, user_id) do nothing;
    author_vote := found;
  end if;

  update public.comments set idea_id = dst.id, merged_from = m where idea_id = src.id;
  get diagnostics moved_comments = row_count;
  update public.idea_merges set votes_moved = (select count(*) from public.votes where idea_id = dst.id) - before_votes, comments_moved = moved_comments where id = m;

  delete from public.notifications where payload ->> 'idea_id' = src.id::text and kind <> 'idea_merged';
  delete from public.ideas where id = src.id;
  -- the main idea keeps its own image; if it has none, it takes the duplicate's
  update public.ideas set updated_at = now(), image_path = coalesce(dst.image_path, src.image_path) where id = dst.id;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'ideas_merged', 'board', src.board_id, jsonb_build_object('source', src.id, 'target', dst.id, 'votes', moved_votes, 'comments', moved_comments));
  perform public.touch_board(src.board_id);
  return jsonb_build_object('votes_moved', (select votes_moved from public.idea_merges where id = m), 'comments_moved', moved_comments,
                            'author_vote', author_vote, 'notified', notified);
end $$;
grant execute on function public.merge_ideas(bigint, bigint) to authenticated;

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

-- The ideas export says whether each idea has an image (signed links expire, so no URL).
create or replace function public.export_ideas(p_board uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  b public.boards;
  rows jsonb;
begin
  select * into b from public.boards where id = p_board;
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  if not coalesce(public.board_can_manage(p_board, uid), false) then
    raise exception 'Solo el Admin del equipo puede exportar las ideas.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x.created_at, x.id), '[]') into rows from (
    select i.id, i.title, i.description, c.name as category, i.status, i.origin, i.reject_reason, i.hidden,
           i.imported, i.ai_generated as ai, i.image_path is not null as has_image, i.requester_name, i.requester_email,
           p.name as author_name, p.email as author_email,
           i.created_at, i.approved_at, i.launched_at,
           (select count(*) from public.votes v where v.idea_id = i.id and v.value = 'importante') as importante,
           (select count(*) from public.votes v where v.idea_id = i.id and v.value = 'interesante') as interesante,
           (select count(*) from public.votes v where v.idea_id = i.id and v.value = 'no_importante') as no_importante,
           (select count(*) from public.comments cm where cm.idea_id = i.id and not cm.deleted) as comments,
           nullif(i.impact, 0) as impact, nullif(i.effort, 0) as effort, i.priority, i.rm_col, i.dev_status, i.growth
    from public.ideas i
    join public.categories c on c.id = i.category_id
    left join public.profiles p on p.id = i.author_id
    where i.board_id = p_board
  ) x;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'ideas_exported', 'board', p_board, jsonb_build_object('rows', jsonb_array_length(rows)));
  return jsonb_build_object('board', b.name, 'slug', b.slug, 'roadmap_names', b.roadmap_names, 'ideas', rows);
end $$;
grant execute on function public.export_ideas(uuid) to authenticated;
