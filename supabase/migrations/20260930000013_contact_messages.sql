-- Contact form (landing + Enterprise inquiries). Written only by /api/contact with the
-- service role; every message is stored before emailing hola@boxinger.com, so a mail
-- outage never loses one (the daily cron retries the ones that failed).
create table public.contact_messages (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  topic       text not null check (topic in ('general', 'enterprise', 'soporte')),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 254),
  company     text check (char_length(company) <= 120),
  team_size   text check (char_length(team_size) <= 40),
  message     text not null check (char_length(message) between 1 and 5000),
  user_id     uuid references auth.users (id) on delete set null,
  ip_hash     text,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts    int not null default 0,
  last_error  text,
  sent_at     timestamptz
);
create index contact_messages_ip_idx on public.contact_messages (ip_hash, created_at desc);
create index contact_messages_pending_idx on public.contact_messages (status) where status <> 'sent';
alter table public.contact_messages enable row level security;
-- No policies: only the service role reads or writes it.
