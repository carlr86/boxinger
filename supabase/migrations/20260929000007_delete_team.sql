-- Boxinger · delete a team with its boards (ideas, votes, comments, members and invitations cascade)

create or replace function public.delete_team(p_team uuid, p_confirm text)
returns int language plpgsql security definer set search_path = public as $$
declare
  acc public.accounts := public.require_account_owner(p_team);
  t public.teams;
  n int;
begin
  if acc.owner_id is distinct from auth.uid() then
    raise exception 'Solo el dueño de la cuenta puede eliminar un equipo.' using errcode = '42501';
  end if;
  select * into t from public.teams where id = p_team;
  if trim(coalesce(p_confirm, '')) <> t.name then raise exception 'El nombre no coincide'; end if;
  select count(*) into n from public.boards where team_id = p_team;
  delete from public.teams where id = p_team;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'team_deleted', 'team', p_team, jsonb_build_object('name', t.name, 'boards', n));
  return n;
end $$;
