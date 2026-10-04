-- Boxinger · Delete an idea (for duplicates)
-- Whoever manages the board (the team's Admin, or the member who created it) can delete an idea for good, with its
-- votes, comments and reactions. Hiding is still there for ideas that should stay but not be seen by the Community.

create or replace function public.delete_idea(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  i public.ideas;
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  if not coalesce(public.board_can_manage(i.board_id, uid), false) then
    raise exception 'Solo el Admin del equipo puede eliminar ideas.' using errcode = '42501';
  end if;
  perform public.writable_board(i.board_id, uid);
  delete from public.ideas where id = p_id;
  delete from public.notifications where payload ->> 'idea_id' = p_id::text;
  perform public.touch_board(i.board_id);
end $$;
grant execute on function public.delete_idea(bigint) to authenticated;
