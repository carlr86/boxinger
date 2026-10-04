-- Errors the app hits in production (server crashes, webhooks, failed emails, browser crashes).
-- Same error = same fingerprint: one row with a counter. The platform admin gets an email at most
-- every 6 hours per error and sees the open ones in the Admin dashboard.
create table public.app_errors (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  source text not null,
  message text not null,
  detail jsonb not null default '{}',
  count int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  notified_at timestamptz,
  resolved_at timestamptz
);
create index app_errors_open on public.app_errors (last_at desc) where resolved_at is null;
alter table public.app_errors enable row level security; -- no policies: only the service role and admin RPCs

-- Called by the app with the service role. Returns true when an email should go out now.
create or replace function public.record_app_error(p_source text, p_message text, p_detail jsonb, p_fingerprint text)
returns boolean language plpgsql security definer set search_path = public as $$
declare notify boolean;
begin
  insert into public.app_errors (fingerprint, source, message, detail)
  values (left(p_fingerprint, 200), left(p_source, 40), left(coalesce(nullif(p_message, ''), '(sin mensaje)'), 1000), coalesce(p_detail, '{}'))
  on conflict (fingerprint) do update set
    count = app_errors.count + 1, last_at = now(), message = excluded.message, detail = excluded.detail,
    -- A resolved error that comes back is open again and alerts right away.
    notified_at = case when app_errors.resolved_at is not null then null else app_errors.notified_at end,
    resolved_at = null;
  -- At most 20 alert emails per hour in total, so an outage doesn't flood the mailbox.
  if (select count(*) from public.app_errors where notified_at > now() - interval '1 hour') >= 20 then return false; end if;
  update public.app_errors set notified_at = now()
  where fingerprint = left(p_fingerprint, 200) and (notified_at is null or notified_at < now() - interval '6 hours')
  returning true into notify;
  return coalesce(notify, false);
end $$;
revoke execute on function public.record_app_error(text, text, jsonb, text) from public, anon, authenticated;

create or replace function public.admin_errors(p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  return jsonb_build_object(
    'open', (select count(*) from public.app_errors where resolved_at is null),
    'rows', coalesce((select jsonb_agg(to_jsonb(e) order by e.last_at desc) from (
      select id, source, message, detail, count, first_at, last_at from public.app_errors
      where resolved_at is null order by last_at desc limit greatest(1, least(p_limit, 100))) e), '[]'));
end $$;

-- p_id null: marks every open error as resolved.
create or replace function public.admin_resolve_error(p_id bigint default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_super_admin();
  update public.app_errors set resolved_at = now() where resolved_at is null and (p_id is null or id = p_id);
end $$;
