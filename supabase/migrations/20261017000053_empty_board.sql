-- Boxinger · Empty a board (every plan, whoever manages the board)
-- Deletes every idea of the board with its votes, comments, reactions, history, merges and notices, plus the
-- import history. The board itself stays: settings, categories, members, guests and invitations.
-- The board's name must be typed to confirm. Images left without an idea are removed by the daily cron.

create or replace function public.empty_board(p_board uuid, p_confirm text)
returns int language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  b public.boards;
  ids bigint[];
begin
  select * into b from public.boards where id = p_board;
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  if not coalesce(public.board_can_manage(p_board, uid), false) then
    raise exception 'Solo el Admin del equipo puede vaciar el buzón.' using errcode = '42501';
  end if;
  perform public.writable_board(p_board, uid);
  if trim(coalesce(p_confirm, '')) <> b.name then raise exception 'El nombre no coincide'; end if;

  select coalesce(array_agg(id), '{}') into ids from public.ideas where board_id = p_board;
  delete from public.notifications where payload ->> 'idea_id' = any (select x::text from unnest(ids) x);
  delete from public.idea_merges where board_id = p_board;
  delete from public.ideas where board_id = p_board;
  delete from public.idea_imports where board_id = p_board;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'board_emptied', 'board', p_board, jsonb_build_object('ideas', cardinality(ids)));
  perform public.touch_board(p_board);
  return cardinality(ids);
end $$;
grant execute on function public.empty_board(uuid, text) to authenticated;
