-- Boxinger · delete one's own notifications (one, some, or all: "Vaciar").
create or replace function public.delete_notifications(p_ids bigint[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_user(); n int;
begin
  delete from public.notifications where user_id = uid and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.delete_notifications(bigint[]) to authenticated;
