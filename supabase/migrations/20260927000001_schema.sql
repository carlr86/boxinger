-- Boxinger · schema
-- Roles:
--   Super Admin  profiles.is_super_admin
--   Admin        accounts.owner_id (and team_members.role = 'admin')
--   Miembro      team_members.role = 'member' (Pro only, up to 4 per team)
--   Invitado     board_guests (public boards only)
-- All business writes go through SECURITY DEFINER functions (see *_api.sql);
-- tables have RLS enabled with read-only policies where the client needs them.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ───────────────────────── users ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  email text not null,
  avatar_url text,
  is_super_admin boolean not null default false,
  status text not null default 'active' check (status in ('active', 'blocked')),
  notif jsonb not null default '{"comments": true, "replies": true, "status": true, "digest": true}',
  admin_notif jsonb not null default '{"clients": true, "payfail": true, "churn": true, "weekly": false}',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  -- null while a client created from the admin panel has not activated the account
  activated_at timestamptz default now()
);
create index profiles_email_idx on public.profiles (lower(email));

-- ─────────────────────── accounts & billing ───────────────────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

-- List prices of the Pro plan, per currency. USD is charged with PayPal, ARS with Mercado Pago.
create table public.price_schedule (
  id uuid primary key default gen_random_uuid(),
  currency text not null check (currency in ('USD', 'ARS')),
  amount numeric(12, 2) not null check (amount > 0),
  effective_from timestamptz not null,
  scope text not null default 'all' check (scope in ('all', 'new')),
  notify boolean not null default true,
  paypal_plan_id text,
  applied_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index price_schedule_cur_idx on public.price_schedule (currency, effective_from desc);

create table public.subscriptions (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'active' check (status in ('active', 'pending', 'past_due', 'cancelled', 'expired')),
  provider text check (provider in ('paypal', 'mercadopago', 'manual')),
  provider_subscription_id text unique,
  provider_plan_id text,
  currency text not null default 'USD' check (currency in ('USD', 'ARS')),
  list_amount numeric(12, 2),          -- list price this subscription follows
  charged_amount numeric(12, 2),       -- what the provider charges today (list or deal)
  pro_since timestamptz,
  free_since timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  deal_type text check (deal_type in ('pct', 'fixed')),
  deal_value numeric(12, 2),
  deal_until timestamptz,
  deal_note text check (char_length(deal_note) <= 120),
  deal_created_at timestamptz,
  checkout_started_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete set null,
  provider text not null check (provider in ('paypal', 'mercadopago')),
  provider_payment_id text not null,
  provider_subscription_id text,
  amount numeric(12, 2),
  currency text,
  status text not null,                -- completed | failed | refunded | pending
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create table public.billing_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ─────────────────────── teams & boards ───────────────────────
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#5a6b8c',
  created_at timestamptz not null default now()
);
create index teams_account_idx on public.teams (account_id);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  -- members see every board of the team unless an override in board_member_access says otherwise
  all_boards boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 200),
  logo_url text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  color text not null default '#5a6b8c',
  roadmap_names jsonb not null default '{}',
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index boards_team_idx on public.boards (team_id);

create table public.board_member_access (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  has_access boolean not null,
  primary key (board_id, user_id)
);

create table public.board_guests (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked')),
  via text not null default 'link' check (via in ('link', 'email', 'participation')),
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index board_guests_user_idx on public.board_guests (user_id);

create table public.board_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, board_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('team', 'guest', 'client')),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  email text not null check (email = lower(email)),
  team_id uuid references public.teams (id) on delete cascade,
  board_id uuid references public.boards (id) on delete cascade,   -- guest invite, or member invited to a single board
  account_id uuid references public.accounts (id) on delete cascade, -- client activation
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  check ((kind = 'team' and team_id is not null) or (kind = 'guest' and board_id is not null) or (kind = 'client' and account_id is not null))
);
create unique index invitations_pending_team_uidx on public.invitations (team_id, email) where kind = 'team' and accepted_at is null and revoked_at is null;
create unique index invitations_pending_guest_uidx on public.invitations (board_id, email) where kind = 'guest' and accepted_at is null and revoked_at is null;

-- ─────────────────────── ideas ───────────────────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  key text check (key in ('feature', 'mejora', 'propuesta')),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create unique index categories_name_uidx on public.categories (board_id, lower(name));

create table public.ideas (
  id bigint generated always as identity primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  origin text not null check (origin in ('equipo', 'comunidad')),
  title text not null check (char_length(title) between 5 and 80),
  description text not null check (char_length(description) between 20 and 2000),
  category_id uuid not null references public.categories (id),
  status text not null default 'pendiente' check (status in ('pendiente', 'en_revision', 'aprobada', 'rechazada')),
  reject_reason text,
  approved_at timestamptz,
  hidden boolean not null default false,
  -- Pro: prioritization
  impact smallint not null default 0 check (impact between 0 and 5),
  effort smallint not null default 0 check (effort between 0 and 5),
  rm_col text check (rm_col in ('ahora', 'siguiente', 'despues', 'no')),
  rm_order int,
  priority text check (priority in ('alta', 'media', 'baja')),
  dev_status text not null default 'por_empezar' check (dev_status in ('por_empezar', 'en_curso', 'lanzada')),
  dev_at timestamptz,
  launched_at timestamptz,
  chk_design boolean not null default false,
  chk_prd boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rechazada' or coalesce(char_length(trim(reject_reason)), 0) > 0)
);
create index ideas_board_idx on public.ideas (board_id, created_at desc);
create index ideas_author_idx on public.ideas (author_id);

create table public.votes (
  idea_id bigint not null references public.ideas (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value text not null check (value in ('importante', 'interesante', 'no_importante')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
create index votes_user_idx on public.votes (user_id, created_at desc);

create table public.comments (
  id bigint generated always as identity primary key,
  idea_id bigint not null references public.ideas (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  edited boolean not null default false,
  hidden boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_idea_idx on public.comments (idea_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at desc);

create table public.comment_replies (
  id bigint generated always as identity primary key,
  comment_id bigint not null unique references public.comments (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reactions (
  id bigint generated always as identity primary key,
  comment_id bigint references public.comments (id) on delete cascade,
  reply_id bigint references public.comment_replies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value text not null check (value in ('like', 'no_like')),
  created_at timestamptz not null default now(),
  check ((comment_id is null) <> (reply_id is null))
);
create unique index reactions_comment_uidx on public.reactions (comment_id, user_id) where comment_id is not null;
create unique index reactions_reply_uidx on public.reactions (reply_id, user_id) where reply_id is not null;

create table public.status_changes (
  id bigint generated always as identity primary key,
  idea_id bigint not null references public.ideas (id) on delete cascade,
  from_status text not null,
  to_status text not null,
  reason text,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index status_changes_idea_idx on public.status_changes (idea_id, created_at);

-- ─────────────────────── email & audit ───────────────────────
create table public.email_outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  user_id uuid references public.profiles (id) on delete cascade,
  template text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  dedupe_key text unique,
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_pending_idx on public.email_outbox (send_after) where status = 'pending';

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Every table is locked down; see policies in the next migration.
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.price_schedule enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.billing_events enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.boards enable row level security;
alter table public.board_member_access enable row level security;
alter table public.board_guests enable row level security;
alter table public.board_favorites enable row level security;
alter table public.invitations enable row level security;
alter table public.categories enable row level security;
alter table public.ideas enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_replies enable row level security;
alter table public.reactions enable row level security;
alter table public.status_changes enable row level security;
alter table public.email_outbox enable row level security;
alter table public.audit_log enable row level security;
