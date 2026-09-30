-- Roadmap without "No se hará": an idea that won't be done goes back to the Backlog.
-- Columns: Ahora · Siguiente · Más adelante (and the app's read-only "Lanzadas").

update public.ideas set rm_col = null, rm_order = null where rm_col = 'no';
update public.boards set roadmap_names = roadmap_names - 'no' where roadmap_names ? 'no';
alter table public.ideas drop constraint ideas_rm_col_check;
alter table public.ideas add constraint ideas_rm_col_check check (rm_col in ('ahora', 'siguiente', 'despues'));


create or replace function public.move_roadmap(p_id bigint, p_col text, p_before bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ideas;
  c public.board_ctx;
  ids bigint[];
  pos int;
begin
  select * into i from public.ideas where id = p_id for update;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  c := public.require_team(i.board_id);
  if not c.pro then raise exception 'Disponible en el plan Pro.'; end if;
  if p_col is null then
    update public.ideas set rm_col = null, rm_order = null, updated_at = now() where id = p_id;
    return;
  end if;
  if i.status <> 'aprobada' then raise exception 'Solo las ideas aprobadas pasan al Roadmap.'; end if;
  if p_col not in ('ahora', 'siguiente', 'despues') then raise exception 'Columna inválida.'; end if;

  select coalesce(array_agg(id order by rm_order nulls last, id), '{}') into ids
  from public.ideas where board_id = i.board_id and rm_col = p_col and id <> p_id;
  pos := case when p_before is null then null else array_position(ids, p_before) end;
  if pos is null then ids := ids || p_id; else ids := ids[1:pos - 1] || p_id || ids[pos:]; end if;
  update public.ideas set rm_col = p_col, rm_order = array_position(ids, id), updated_at = now() where id = any (ids);
end $$;

create or replace function public.rename_roadmap_column(p_board uuid, p_col text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.board_ctx := public.require_team(p_board);
  n text := left(trim(coalesce(p_name, '')), 24);
begin
  if not c.pro then raise exception 'Disponible en el plan Pro.'; end if;
  if p_col not in ('ahora', 'siguiente', 'despues') then raise exception 'Columna inválida.'; end if;
  update public.boards set roadmap_names = case when n = '' then roadmap_names - p_col else roadmap_names || jsonb_build_object(p_col, n) end
  where id = p_board;
end $$;
