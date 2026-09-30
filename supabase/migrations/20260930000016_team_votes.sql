-- Team members can vote each other's ideas (only their own ideas stay off-limits, for everyone).
-- Comments were already open on every idea.

create or replace function public.vote(p_idea bigint, p_value text)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  c public.board_ctx;
  uid uuid;
  n int;
begin
  select * into i from public.ideas where id = p_idea;
  if i.id is null or i.hidden then raise exception 'La idea no existe.'; end if;
  c := public.participate(i.board_id);
  uid := auth.uid();
  if i.status not in ('pendiente', 'en_revision') then raise exception 'La votación está cerrada. Los votos quedaron congelados.'; end if;
  if i.author_id = uid then raise exception 'No podés votar tus propias ideas.'; end if;
  if p_value is null then
    delete from public.votes where idea_id = p_idea and user_id = uid;
    return;
  end if;
  if p_value not in ('importante', 'interesante', 'no_importante') then raise exception 'Voto inválido.'; end if;
  select count(*) into n from public.votes where user_id = uid and updated_at > now() - interval '1 minute';
  perform public.rate_limit('votos', n, 30);
  insert into public.votes (idea_id, user_id, value) values (p_idea, uid, p_value)
  on conflict (idea_id, user_id) do update set value = excluded.value, updated_at = now();
end $$;
