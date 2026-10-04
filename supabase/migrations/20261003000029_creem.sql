-- Boxinger · Creem replaces Lemon Squeezy as the international (USD) provider.
alter table public.subscriptions drop constraint subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check check (provider in ('paypal', 'mercadopago', 'lemonsqueezy', 'creem', 'manual'));
alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('paypal', 'mercadopago', 'lemonsqueezy', 'creem'));
