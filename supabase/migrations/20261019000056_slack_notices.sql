-- Boxinger · Slack notices (Pro and Enterprise), integrations step 2a
-- The team connects a Slack channel to a board with «Conectar con Slack» (Slack's own screen, incoming-webhook
-- scope). Boxinger then posts there when something happens on the board: a new idea, an idea waiting in
-- «Por revisar», an idea entering the Roadmap, a launch, and a summary every Monday. Each one can be turned off.
-- Triggers on ideas queue the notices in slack_outbox; the server sends them (src/lib/slack.ts), the same way
-- emails go out: right after the action, with the daily cron as a fallback.

-- One channel per board. The webhook address is a secret: no policies, only these functions and the server read it.
create table public.board_slack (
  board_id     uuid primary key references public.boards (id) on delete cascade,
  webhook_url  text not null check (webhook_url like 'https://hooks.slack.com/%'),
  channel      text,
  workspace    text,
  config_url   text,                                   -- Slack's page to remove the app from the channel
  locale       text not null default 'es' check (locale in ('es', 'en')),
  events       jsonb not null default '{"new_idea": true, "review": true, "planned": true, "launched": true, "weekly": true}',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  error        text,                                   -- Slack stopped taking the notices (channel deleted, app removed)
  error_at     timestamptz
);
alter table public.board_slack enable row level security;

create table public.slack_outbox (
  id         bigserial primary key,
  board_id   uuid not null references public.boards (id) on delete cascade,
  kind       text not null check (kind in ('new_idea', 'review', 'planned', 'launched', 'weekly')),
  idea_id    bigint references public.ideas (id) on delete cascade,
  payload    jsonb not null default '{}',
  dedupe_key text unique,
  status     text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts   int not null default 0,
  send_after timestamptz not null default now(),
  sent_at    timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index slack_outbox_pending_idx on public.slack_outbox (send_after) where status in ('pending', 'sending');
alter table public.slack_outbox enable row level security;

-- Queues a notice when the board has Slack, that notice is on, and the board is paid and active.
create or replace function public.queue_slack(p_board uuid, p_kind text, p_idea bigint, p_payload jsonb, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.board_slack;
  c public.board_ctx;
begin
  select * into s from public.board_slack where board_id = p_board;
  if s.board_id is null or not coalesce((s.events ->> p_kind)::boolean, false) then return; end if;
  c := public.board_context(p_board, null);
  if not c.pro or c.board_status <> 'active' or c.account_status <> 'active' then return; end if;
  insert into public.slack_outbox (board_id, kind, idea_id, payload, dedupe_key)
  values (p_board, p_kind, p_idea, coalesce(p_payload, '{}'), p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;
revoke execute on function public.queue_slack(uuid, text, bigint, jsonb, text) from public, anon, authenticated;

-- New idea (visible ones; imports don't count), one waiting in «Por revisar», first time in the Roadmap, launch.
-- An idea that arrived hidden is announced as new when the team publishes it. Each notice goes out once per idea.
create or replace function public.ideas_slack_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.board_slack where board_id = new.board_id) then return null; end if;
  if tg_op = 'INSERT' then
    if new.imported then return null; end if;
    if not new.hidden then
      perform public.queue_slack(new.board_id, 'new_idea', new.id, '{}', 'new:' || new.id);
    elsif new.source is not null then
      perform public.queue_slack(new.board_id, 'review', new.id, '{}', 'review:' || new.id);
    end if;
    return null;
  end if;
  if old.hidden and not new.hidden and not new.imported then
    perform public.queue_slack(new.board_id, 'new_idea', new.id, '{}', 'new:' || new.id);
  end if;
  if old.rm_col is null and new.rm_col is not null and new.dev_status <> 'lanzada' then
    perform public.queue_slack(new.board_id, 'planned', new.id, '{}', 'planned:' || new.id);
  end if;
  if old.dev_status <> 'lanzada' and new.dev_status = 'lanzada' then
    perform public.queue_slack(new.board_id, 'launched', new.id, '{}', 'launched:' || new.id);
  end if;
  return null;
end $$;
create trigger ideas_slack after insert or update of hidden, rm_col, dev_status on public.ideas
  for each row execute function public.ideas_slack_trigger();

-- The server takes pending notices (several senders at once never take the same one).
create or replace function public.claim_slack(p_limit int default 50)
returns setof public.slack_outbox language sql security definer set search_path = public as $$
  update public.slack_outbox o set status = 'sending', attempts = o.attempts + 1
  where o.id in (
    select id from public.slack_outbox
    where (status = 'pending' and send_after <= now())
       or (status = 'sending' and attempts < 5 and send_after <= now() - interval '10 minutes')
    order by id
    limit p_limit
    for update skip locked
  )
  returning o.*;
$$;
revoke execute on function public.claim_slack(int) from public, anon, authenticated;

-- Monday summary of the last 7 days, for the boards that want it. Quiet weeks send nothing.
create or replace function public.queue_slack_weekly()
returns int language plpgsql security definer set search_path = public as $$
declare
  s public.board_slack;
  p jsonb;
  n int := 0;
  since timestamptz := now() - interval '7 days';
begin
  for s in select * from public.board_slack where coalesce((events ->> 'weekly')::boolean, false) loop
    select jsonb_build_object(
      'ideas', (select count(*) from public.ideas where board_id = s.board_id and created_at > since and not hidden and not imported),
      'votes', (select count(*) from public.votes v join public.ideas i on i.id = v.idea_id where i.board_id = s.board_id and v.created_at > since),
      'comments', (select count(*) from public.comments c join public.ideas i on i.id = c.idea_id where i.board_id = s.board_id and c.created_at > since and not c.deleted),
      'launched', (select count(*) from public.ideas where board_id = s.board_id and launched_at > since and dev_status = 'lanzada'),
      'pending', (select count(*) from public.ideas where board_id = s.board_id and source is not null and hidden and archived_at is null and status <> 'rechazada'),
      'top', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'votes', x.n) order by x.n desc, x.id)
                       from (select i.id, i.title, count(*) n from public.votes v join public.ideas i on i.id = v.idea_id
                             where i.board_id = s.board_id and v.created_at > since and not i.hidden
                             group by i.id, i.title order by count(*) desc, i.id limit 3) x), '[]'))
    into p;
    if (p ->> 'ideas')::int + (p ->> 'votes')::int + (p ->> 'comments')::int + (p ->> 'launched')::int + (p ->> 'pending')::int = 0 then continue; end if;
    perform public.queue_slack(s.board_id, 'weekly', null, p, 'weekly:' || s.board_id || ':' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'IYYY-IW'));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_slack_weekly() from public, anon, authenticated;

-- «Conectar con Slack»: the server checks the person can do it before sending them to Slack (returns the slug).
create or replace function public.slack_can_connect(p_board uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_integrations(p_board, true);
  return (select slug from public.boards where id = p_board);
end $$;
grant execute on function public.slack_can_connect(uuid) to authenticated;

-- Back from Slack: the server (service key) saves the channel. Connecting again replaces it and keeps the chosen notices.
create or replace function public.save_slack(p_board uuid, p_user uuid, p_url text, p_channel text, p_workspace text, p_config_url text)
returns void language plpgsql security definer set search_path = public as $$
declare loc text;
begin
  if p_url not like 'https://hooks.slack.com/%' then raise exception 'Dirección de Slack inválida.'; end if;
  select case when locale in ('es', 'en') then locale else 'es' end into loc from public.profiles where id = p_user;
  insert into public.board_slack (board_id, webhook_url, channel, workspace, config_url, locale, created_by)
  values (p_board, p_url, left(p_channel, 120), left(p_workspace, 120), left(p_config_url, 500), coalesce(loc, 'es'), p_user)
  on conflict (board_id) do update
    set webhook_url = excluded.webhook_url, channel = excluded.channel, workspace = excluded.workspace, config_url = excluded.config_url,
        locale = excluded.locale, created_by = excluded.created_by, created_at = now(), error = null, error_at = null;
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (p_user, 'slack_connected', 'board', p_board, jsonb_build_object('channel', p_channel, 'workspace', p_workspace));
end $$;
revoke execute on function public.save_slack(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- Which notices go to the channel.
create or replace function public.set_slack_events(p_board uuid, p_events jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e jsonb := '{}';
  k text;
begin
  perform public.require_integrations(p_board, true);
  foreach k in array array['new_idea', 'review', 'planned', 'launched', 'weekly'] loop
    e := e || jsonb_build_object(k, coalesce((p_events ->> k)::boolean, false));
  end loop;
  update public.board_slack set events = e where board_id = p_board;
  if not found then raise exception 'Primero conectá Slack.'; end if;
end $$;
grant execute on function public.set_slack_events(uuid, jsonb) to authenticated;

-- Disconnecting works on any plan, so a board back on Free can still switch it off. Pending notices are dropped.
create or replace function public.delete_slack(p_board uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_integrations(p_board, false);
  delete from public.board_slack where board_id = p_board;
  update public.slack_outbox set status = 'skipped', last_error = 'desconectado' where board_id = p_board and status in ('pending', 'sending');
  insert into public.audit_log (actor_id, action, target_type, target_id, meta)
  values (auth.uid(), 'slack_disconnected', 'board', p_board, '{}');
end $$;
grant execute on function public.delete_slack(uuid) to authenticated;

-- What the server needs to build each notice (current title, votes and author, not the ones at queue time).
create or replace function public.slack_notice_data(p_ids bigint[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(i.id, jsonb_build_object(
    'title', i.title, 'description', i.description, 'origin', i.origin, 'source', i.source, 'hidden', i.hidden,
    'category', (select name from public.categories where id = i.category_id),
    'author', coalesce((select name from public.profiles where id = i.author_id), i.requester_name, i.requester_email),
    'votes', (select count(*) from public.votes where idea_id = i.id),
    'importante', (select count(*) from public.votes where idea_id = i.id and value = 'importante'))), '{}')
  from public.ideas i where i.id = any (p_ids);
$$;
revoke execute on function public.slack_notice_data(bigint[]) from public, anon, authenticated;

-- Settings › Integrations also shows the Slack channel (never its address).
create or replace function public.get_integrations(p_board uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_integrations(p_board, false);
  return jsonb_build_object(
    'api', (select jsonb_build_object('hint', x.token_hint, 'origin', x.origin, 'default_category', x.default_category,
                    'created_at', x.created_at, 'created_by', coalesce(p.name, p.email), 'last_used_at', x.last_used_at, 'use_count', x.use_count)
            from public.board_integrations x left join public.profiles p on p.id = x.created_by
            where x.board_id = p_board and x.kind = 'api'),
    'slack', (select jsonb_build_object('channel', s.channel, 'workspace', s.workspace, 'config_url', s.config_url, 'events', s.events,
                      'created_at', s.created_at, 'created_by', coalesce(p.name, p.email), 'last_sent_at', s.last_sent_at, 'error', s.error, 'error_at', s.error_at)
              from public.board_slack s left join public.profiles p on p.id = s.created_by
              where s.board_id = p_board),
    'pending', (select count(*) from public.ideas where board_id = p_board and source is not null and hidden
                  and archived_at is null and status <> 'rechazada'));
end $$;
