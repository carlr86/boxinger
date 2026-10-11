-- Boxinger · Export a board's ideas (team Admin, every plan)
-- Returns every idea of the board (hidden ones too) with what the CSV needs; the browser builds the file.
-- Exporting your own data stays free on every plan. Each export is written to audit_log.

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
           i.imported, i.ai_generated as ai, i.requester_name, i.requester_email,
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
