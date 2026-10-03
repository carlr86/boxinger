-- Boxinger · bell notice for new ideas: whoever manages the board hears about ideas from others.
-- In-app only (no email), to keep inboxes quiet on busy boards.

create or replace function public.create_idea(p_board uuid, p_title text, p_description text, p_category uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.participate(p_board);
  uid uuid := auth.uid();
  t text := trim(coalesce(p_title, ''));
  d text := trim(coalesce(p_description, ''));
  n int;
  new_id bigint;
  b public.boards;
  admin_id uuid;
  who text;
begin
  if not public.board_can_create_idea(p_board, uid) then
    if c.role = 'member' then raise exception 'En este buzón el Admin no habilitó la carga de ideas para los miembros.'; end if;
    raise exception 'En este buzón solo el Equipo carga ideas. Podés votar y comentar.';
  end if;
  if char_length(t) not between 5 and 80 then raise exception 'El título debe tener entre 5 y 80 caracteres'; end if;
  if char_length(d) not between 20 and 2000 then raise exception 'La descripción debe tener entre 20 y 2.000 caracteres'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = p_board) then raise exception 'Elegí una categoría'; end if;
  select count(*) into n from public.ideas where author_id = uid and created_at > now() - interval '10 minutes';
  perform public.rate_limit('ideas', n, 5);
  insert into public.ideas (board_id, author_id, origin, title, description, category_id)
  values (p_board, uid, case when c.role in ('admin', 'member') then 'equipo' else 'comunidad' end, t, d, p_category)
  returning id into new_id;

  -- In-app notice (no email) to whoever manages the board, except the author.
  select * into b from public.boards where id = p_board;
  select name into who from public.profiles where id = uid;
  for admin_id in
    select distinct x.id from (
      select a.owner_id as id from public.teams tm join public.accounts a on a.id = tm.account_id where tm.id = b.team_id
      union select m.user_id from public.team_members m where m.team_id = b.team_id and m.role = 'admin'
      union select b.created_by
    ) x where x.id is not null and x.id <> uid and public.board_can_manage(p_board, x.id)
  loop
    insert into public.notifications (user_id, kind, payload, dedupe_key)
    values (admin_id, 'new_idea', jsonb_build_object('idea_id', new_id, 'title', t, 'board_name', b.name, 'slug', b.slug, 'author', who,
              'origin', case when c.role in ('admin', 'member') then 'equipo' else 'comunidad' end),
            'n:new_idea:' || new_id || ':' || admin_id)
    on conflict (dedupe_key) do nothing;
  end loop;
  return new_id;
end $$;
