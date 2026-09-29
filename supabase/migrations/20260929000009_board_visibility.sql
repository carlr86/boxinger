-- Boxinger · change a board's visibility after creation.
-- Public → private: Invitados keep their membership but lose access (board_context only grants
-- 'guest' on public boards) and pending guest invitations are cancelled. Private → public: they
-- get access back.

create or replace function public.set_board_visibility(p_board uuid, p_visibility text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_board_admin(p_board);
  b public.boards;
  guests int;
  revoked int := 0;
begin
  perform public.writable_board(p_board, auth.uid());
  if p_visibility not in ('public', 'private') then raise exception 'Visibilidad inválida.'; end if;
  select * into b from public.boards where id = p_board;
  if b.visibility = p_visibility then return jsonb_build_object('visibility', p_visibility, 'guests', 0, 'revoked', 0); end if;
  if p_visibility = 'private' and not c.pro then raise exception 'Los buzones privados están disponibles en Pro.'; end if;

  select count(*) into guests from public.board_guests where board_id = p_board and status = 'active';
  if p_visibility = 'private' then
    with r as (
      update public.invitations set revoked_at = now()
      where kind = 'guest' and board_id = p_board and accepted_at is null and revoked_at is null
      returning 1)
    select count(*) into revoked from r;
  end if;
  update public.boards set visibility = p_visibility where id = p_board;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'board_visibility', 'board', p_board, jsonb_build_object('from', b.visibility, 'to', p_visibility));
  return jsonb_build_object('visibility', p_visibility, 'guests', guests, 'revoked', revoked);
end $$;
