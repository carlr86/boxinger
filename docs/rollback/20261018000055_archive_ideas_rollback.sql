-- Rollback de 20261018000055_archive_ideas.sql: vuelve set_idea_hidden, get_integrations e idea_json a como estaban antes (054).

create or replace function public.set_idea_hidden(p_id bigint, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare i public.ideas;
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  perform public.require_team(i.board_id);
  update public.ideas set hidden = p_hidden, updated_at = now() where id = p_id;
end $$;

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
