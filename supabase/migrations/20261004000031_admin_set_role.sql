-- Platform admin: change a person's role on a board between Invitado (guest) and Miembro (team member).
create or replace function public.admin_set_user_role(p_user uuid, p_board uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_super_admin();
  b public.boards;
  acc public.accounts;
  lim int;
begin
  if p_role not in ('member', 'guest') then raise exception 'Rol inválido.'; end if;
  select * into b from public.boards where id = p_board;
  if b.id is null then raise exception 'El buzón no existe.'; end if;
  select a.* into acc from public.teams t join public.accounts a on a.id = t.account_id where t.id = b.team_id;
  if p_user = acc.owner_id or exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user and role = 'admin') then
    raise exception 'Es el Admin de la cuenta: su rol no se puede cambiar.';
  end if;

  if p_role = 'member' then
    if exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user) then raise exception 'Ya es Miembro de este equipo.'; end if;
    if not public.account_is_pro(acc.id) then raise exception 'La cuenta es Free: necesita Pro o Enterprise para tener miembros.'; end if;
    lim := public.account_member_limit(acc.id);
    if lim is not null and (select count(*) from public.team_members where team_id = b.team_id and role = 'member') >= lim then
      raise exception 'El equipo ya tiene % miembros, el máximo de su plan.', lim;
    end if;
    insert into public.team_members (team_id, user_id, role, all_boards) values (b.team_id, p_user, 'member', true);
    -- As a member they see the team's boards: their guest seats there are no longer needed.
    delete from public.board_guests where user_id = p_user and board_id in (select id from public.boards where team_id = b.team_id);
    update public.board_access_requests set status = 'approved', decided_by = uid, decided_at = now()
    where user_id = p_user and status = 'pending' and board_id in (select id from public.boards where team_id = b.team_id);
  else
    if not exists (select 1 from public.team_members where team_id = b.team_id and user_id = p_user) then raise exception 'Ya es Invitado de este buzón.'; end if;
    delete from public.board_member_access where user_id = p_user and board_id in (select id from public.boards where team_id = b.team_id);
    delete from public.team_members where team_id = b.team_id and user_id = p_user;
    insert into public.board_guests (board_id, user_id, via, invited_by) values (b.id, p_user, 'email', uid)
    on conflict (board_id, user_id) do update set status = 'active';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (uid, 'user_role', 'user', p_user, jsonb_build_object('board', b.id, 'role', p_role));
end $$;

revoke execute on function public.admin_set_user_role(uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to authenticated;
