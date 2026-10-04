-- Creem's webhooks don't carry our metadata: remember which checkout each account opened.
alter table public.subscriptions add column pending_checkout_id text;
create index subscriptions_pending_checkout_idx on public.subscriptions (pending_checkout_id) where pending_checkout_id is not null;
