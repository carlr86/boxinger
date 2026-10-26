-- Guests can edit the ideas they loaded (title, description and category), at any time and on every kind of board.
-- They still can't edit anybody else's ideas; the team edits all of them, as before.

CREATE OR REPLACE FUNCTION public.update_idea(p_id bigint, p_title text, p_description text, p_category uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i public.ideas;
  t text := trim(coalesce(p_title, ''));
  d text := trim(coalesce(p_description, ''));
begin
  select * into i from public.ideas where id = p_id;
  if i.id is null then raise exception 'La idea no existe.'; end if;
  -- Whoever loaded the idea can always correct it (unless the team blocked them); everyone else has to be on the team.
  if i.author_id = auth.uid() then
    perform public.participate(i.board_id);
  else
    perform public.require_team(i.board_id);
  end if;
  if char_length(t) not between 5 and 80 then raise exception 'El título debe tener entre 5 y 80 caracteres'; end if;
  if char_length(d) > 2000 or (char_length(d) < 20 and not i.imported and i.source is null) then raise exception 'La descripción debe tener entre 20 y 2.000 caracteres'; end if;
  if not exists (select 1 from public.categories where id = p_category and board_id = i.board_id) then raise exception 'Elegí una categoría'; end if;
  update public.ideas set title = t, description = d, category_id = p_category, updated_at = now() where id = p_id;
end $function$;
