import 'server-only';
import * as paypal from './paypal';
import * as mercadopago from './mercadopago';
import * as lemon from './lemonsqueezy';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { effectiveAmount } from './service';

export type Provider = 'paypal' | 'mercadopago' | 'lemonsqueezy' | 'manual' | null;

export async function cancelProviderSubscription(provider: Provider, id: string) {
  if (provider === 'paypal') await paypal.cancelSubscription(id);
  else if (provider === 'mercadopago') await mercadopago.cancelPreapproval(id);
  else if (provider === 'lemonsqueezy') await lemon.cancelSubscription(id);
}

/**
 * Pushes the amount the account should pay today (list price or deal) to the provider,
 * then stores it in subscriptions.charged_amount.
 */
export async function syncAmount(accountId: string, force = false): Promise<void> {
  const admin = supabaseAdmin();
  const { data: s } = await admin.from('subscriptions').select('*').eq('account_id', accountId).maybeSingle();
  if (!s || s.plan !== 'pro' || !s.provider_subscription_id) return;
  if (!['active', 'past_due'].includes(s.status)) return;
  const value = await effectiveAmount(s);
  if (!value || (!force && Math.abs(value - Number(s.charged_amount || 0)) < 0.001)) return;
  if (s.provider === 'paypal') await paypal.updateAmount(s.provider_subscription_id, value);
  else if (s.provider === 'mercadopago') await mercadopago.updateAmount(s.provider_subscription_id, value);
  // Lemon Squeezy can't change the price of a running subscription: special prices apply at checkout.
  else return;
  await admin.from('subscriptions').update({ charged_amount: value, updated_at: new Date().toISOString() }).eq('account_id', accountId);
}
