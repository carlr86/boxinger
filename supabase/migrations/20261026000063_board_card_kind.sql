-- Boxinger · Mis Buzones shows each board's type (Brainstorming…): board_card adds «kind».
-- Body from the production definition (pg_get_functiondef, 2026-10-19).

CREATE OR REPLACE FUNCTION public.board_card(p_board uuid, p_uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'description', b.description, 'logo_url', b.logo_url,
    'visibility', b.visibility, 'kind', b.kind, 'status', b.status, 'color', b.color, 'team_id', b.team_id, 'team_name', t.name,
    'created_at', b.created_at,
    'last_activity_at', greatest(b.last_activity_at, (select max(created_at) from public.ideas where board_id = b.id)),
    'ideas', (select count(*) from public.ideas where board_id = b.id and not hidden),
    'guests', (select count(*) from public.board_guests where board_id = b.id and status = 'active'),
    'fav', exists (select 1 from public.board_favorites f where f.board_id = b.id and f.user_id = p_uid),
    'locked', (x.c).locked,
    'account_status', (x.c).account_status,
    'role', (x.c).role
  )
  from public.boards b
  join public.teams t on t.id = b.team_id
  cross join lateral (select public.board_context(b.id, p_uid) as c) x
  where b.id = p_board;
$function$;
