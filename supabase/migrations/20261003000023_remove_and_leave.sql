-- Boxinger · removing someone from a board's Community, and Invitados leaving on their own.
--
-- Eliminar (team): the person stops being an Invitado; their guest invitations to that board are
--   revoked so they don't get back in automatically. They can be invited again or ask for access.
-- Bloquear (team, set_guest_status 'blocked'): stays as a blocked row: no access, no requests.
-- Salir (Invitado): same as Eliminar, done by the person. A blocked person can't "leave" a block.
-- Content (ideas, votes, comments) stays in every case.

create or replace function public.drop_guest(p_board uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare em text;
begin
  delete from public.board_guests where board_id = p_board and user_id = p_user;
  select lower(email) into em from auth.users where id = p_user;
  update public.invitations set revoked_at = now()
  where kind = 'guest' and board_id = p_board and email = em and revoked_at is null;
  delete from public.board_favorites where board_id = p_board and user_id = p_user;
  -- still allowed in by an allowed email domain?
  return coalesce(public.board_invite_via(p_board, p_user, (public.board_context(p_board, p_user)).pro) = 'domain', false);
end $$;

create or replace function public.remove_board_guest(p_board uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare domain boolean;
begin
  perform public.require_team(p_board);
  if not exists (select 1 from public.board_guests where board_id = p_board and user_id = p_user) then
    raise exception 'La persona no es parte de la Comunidad del buzón.';
  end if;
  domain := public.drop_guest(p_board, p_user);
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'guest_removed', 'board', p_board, jsonb_build_object('user', p_user));
  return jsonb_build_object('domain', domain);
end $$;

create or replace function public.leave_board(p_board uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_user();
  st text;
begin
  select status into st from public.board_guests where board_id = p_board and user_id = uid;
  if st is null then raise exception 'No sos parte de la Comunidad de este buzón.'; end if;
  if st = 'blocked' then raise exception 'El Equipo bloqueó tu participación en este buzón.'; end if;
  perform public.drop_guest(p_board, uid);
end $$;

revoke execute on function public.drop_guest(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_board_guest(uuid, uuid) to authenticated;
grant execute on function public.leave_board(uuid) to authenticated;
