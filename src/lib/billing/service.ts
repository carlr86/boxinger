import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendNow } from '@/lib/email/outbox';
import { ENTERPRISE_ARS, ENTERPRISE_USD } from '@/lib/constants';

export type SubRow = {
  account_id: string; plan: 'free' | 'pro' | 'enterprise'; status: string; provider: string | null; provider_subscription_id: string | null;
  currency: 'USD' | 'ARS'; list_amount: number | null; charged_amount: number | null; pro_since: string | null;
  current_period_end: string | null; cancel_at_period_end: boolean;
  deal_type: 'pct' | 'fixed' | null; deal_value: number | null; deal_until: string | null;
};

export type PriceRow = { id: string; currency: 'USD' | 'ARS'; amount: number; paypal_plan_id: string | null; effective_from: string };

export async function currentPrice(currency: 'USD' | 'ARS'): Promise<PriceRow> {
  const { data, error } = await supabaseAdmin().from('price_schedule').select('id, currency, amount, paypal_plan_id, effective_from')
    .eq('currency', currency).is('cancelled_at', null).lte('effective_from', new Date().toISOString())
    .order('effective_from', { ascending: false }).order('created_at', { ascending: false }).limit(1).single();
  if (error || !data) throw new Error('No hay precio vigente en ' + currency);
  return { ...data, amount: Number(data.amount) } as PriceRow;
}

const dealActive = (s: SubRow) => !!s.deal_type && (!s.deal_until || new Date(s.deal_until) > new Date());

/** Same rule as public.effective_amount(): deal if active, otherwise the list price the subscription follows. */
export async function effectiveAmount(s: SubRow, list?: number): Promise<number> {
  const base = list ?? (s.list_amount != null ? Number(s.list_amount) : (await currentPrice(s.currency)).amount);
  if (!dealActive(s)) return base;
  return s.deal_type === 'fixed' ? Number(s.deal_value) : Math.round(base * (1 - Number(s.deal_value) / 100) * 100) / 100;
}

export async function accountOwner(accountId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.from('accounts').select('id, owner_id, profiles:owner_id (name, email)').eq('id', accountId).single();
  const p = (data as unknown as { profiles: { name: string; email: string } } | null)?.profiles;
  return { ownerId: data?.owner_id as string | undefined, name: p?.name || '', email: p?.email || '' };
}

export async function findAccount(provider: string, subId: string | null, ref?: string | null): Promise<string | null> {
  const admin = supabaseAdmin();
  if (subId) {
    const { data } = await admin.from('subscriptions').select('account_id').eq('provider_subscription_id', subId).maybeSingle();
    if (data) return data.account_id;
  }
  if (ref && /^[0-9a-f-]{36}$/i.test(ref)) {
    const { data } = await admin.from('accounts').select('id').eq('id', ref).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

/** List price of a plan in a currency (Pro follows the price schedule; Enterprise is fixed). */
export async function planPrice(plan: 'pro' | 'enterprise', currency: 'USD' | 'ARS'): Promise<number> {
  if (plan === 'enterprise') return currency === 'USD' ? ENTERPRISE_USD : ENTERPRISE_ARS;
  return (await currentPrice(currency)).amount;
}

const PAID = ['pro', 'enterprise'];

/** Provider confirmed the subscription: the account is Pro or Enterprise (the plan that was bought). */
export async function activate(accountId: string, o: { provider: 'paypal' | 'mercadopago' | 'creem'; subId: string; currency: 'USD' | 'ARS'; amount: number; periodEnd?: string | null; plan?: 'pro' | 'enterprise' }) {
  const admin = supabaseAdmin();
  const { data: before } = await admin.from('subscriptions').select('*').eq('account_id', accountId).single();
  // Unknown plan on the event: the same subscription keeps its plan; a new one is Pro.
  const plan = o.plan || (before?.provider_subscription_id === o.subId && before?.plan === 'enterprise' ? 'enterprise' : 'pro');
  const wasPro = before?.plan === plan && ['active', 'past_due'].includes(before.status) && before.provider_subscription_id === o.subId;
  const list = await planPrice(plan, o.currency);
  // A different subscription replacing an older one (switched provider, or Pro → Enterprise): cancel the old one.
  if (before?.provider_subscription_id && before.provider_subscription_id !== o.subId && PAID.includes(before.plan) && ['active', 'past_due', 'cancelled'].includes(before.status) && before.provider !== 'manual') {
    const { cancelProviderSubscription } = await import('./sync');
    await cancelProviderSubscription(before.provider, before.provider_subscription_id).catch(() => {});
  }
  await admin.from('subscriptions').update({
    plan, status: 'active', provider: o.provider, provider_subscription_id: o.subId, currency: o.currency,
    list_amount: before?.provider_subscription_id === o.subId && before?.list_amount ? before.list_amount : list,
    charged_amount: o.amount, pro_since: wasPro ? before!.pro_since : before?.pro_since && before.plan === plan ? before.pro_since : new Date().toISOString(),
    ...(plan === 'enterprise' ? { deal_type: null, deal_value: null, deal_until: null } : {}),
    current_period_end: o.periodEnd || before?.current_period_end || null, cancel_at_period_end: false, updated_at: new Date().toISOString(),
  }).eq('account_id', accountId);
  if (!wasPro) {
    const owner = await accountOwner(accountId);
    if (owner.email) {
      if (plan === 'enterprise') await sendNow(owner.email, 'subscription_changed', { plan: 'enterprise' }, owner.ownerId, 'welcome:' + o.subId);
      else await sendNow(owner.email, 'pro_welcome', {}, owner.ownerId, 'welcome:' + o.subId);
    }
  }
}

export async function setPeriodEnd(accountId: string, periodEnd: string | null) {
  if (!periodEnd) return;
  await supabaseAdmin().from('subscriptions').update({ current_period_end: periodEnd, status: 'active', updated_at: new Date().toISOString() }).eq('account_id', accountId).in('plan', PAID);
}

/** Cancelled at the provider: stays Pro until the paid period ends (the daily job downgrades). */
export async function cancelled(accountId: string, subId: string, periodEnd?: string | null) {
  const admin = supabaseAdmin();
  const { data: s } = await admin.from('subscriptions').select('*').eq('account_id', accountId).single();
  if (!s || s.provider_subscription_id !== subId || s.status === 'cancelled') return;
  const end = periodEnd || s.current_period_end || new Date().toISOString();
  await admin.from('subscriptions').update({ status: 'cancelled', cancel_at_period_end: true, current_period_end: end, updated_at: new Date().toISOString() }).eq('account_id', accountId);
  const owner = await accountOwner(accountId);
  if (owner.email) await sendNow(owner.email, 'pro_cancelled', { until: end, plan: s.plan }, owner.ownerId, 'cancel:' + subId);
}

export async function expired(accountId: string, subId: string) {
  const admin = supabaseAdmin();
  await admin.from('subscriptions').update({ plan: 'free', status: 'expired', free_since: new Date().toISOString(), cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq('account_id', accountId).eq('provider_subscription_id', subId);
}

export async function paymentFailed(accountId: string, provider: string, subId: string, key: string) {
  const admin = supabaseAdmin();
  await admin.from('subscriptions').update({ status: 'past_due', updated_at: new Date().toISOString() }).eq('account_id', accountId).eq('provider_subscription_id', subId).in('plan', PAID);
  const owner = await accountOwner(accountId);
  const name = provider === 'paypal' ? 'PayPal' : provider === 'creem' ? 'tu tarjeta (Creem)' : 'Mercado Pago';
  if (owner.email) await sendNow(owner.email, 'payment_failed', { provider: name }, owner.ownerId, 'payfail:' + key);
  await admin.rpc('notify_super_admins', { p_pref: 'payfail', p_template: 'admin_payfail', p_payload: { name: owner.name, email: owner.email, provider: name }, p_dedupe: 'payfail:' + key });
}

export async function recordPayment(o: { accountId: string | null; provider: 'paypal' | 'mercadopago' | 'creem'; paymentId: string; subId: string | null; amount: number; currency: string; status: string; paidAt?: string | null; raw: unknown }) {
  await supabaseAdmin().from('payments').upsert({
    account_id: o.accountId, provider: o.provider, provider_payment_id: o.paymentId, provider_subscription_id: o.subId,
    amount: o.amount, currency: o.currency, status: o.status, paid_at: o.paidAt || null, raw: o.raw as object,
  }, { onConflict: 'provider,provider_payment_id' });
}

/**
 * A refund (or chargeback) on a recorded charge. `total`: refunded so far (Mercado Pago gives the running
 * total); `add`: this refund (Creem). Fully refunded → status 'refunded'. False when the charge isn't recorded.
 */
export async function applyRefund(provider: 'mercadopago' | 'creem', paymentId: string, r: { total?: number; add?: number }): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data: p } = await admin.from('payments').select('id, amount, refunded_amount').eq('provider', provider).eq('provider_payment_id', paymentId).maybeSingle();
  if (!p) return false;
  const amount = Number(p.amount || 0);
  const refunded = Math.round(Math.min(amount, r.total ?? Number(p.refunded_amount || 0) + (r.add || 0)) * 100) / 100;
  await admin.from('payments').update({ refunded_amount: refunded, status: refunded >= amount ? 'refunded' : 'completed' }).eq('id', p.id);
  return true;
}

/** Stores a webhook once; returns false when it was already processed. */
export async function claimEvent(provider: string, eventId: string, type: string, payload: unknown): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data: prev } = await admin.from('billing_events').select('id, processed_at').eq('provider', provider).eq('event_id', eventId).maybeSingle();
  if (prev?.processed_at) return false;
  if (!prev) await admin.from('billing_events').insert({ provider, event_id: eventId, event_type: type, payload: payload as object });
  return true;
}

export async function finishEvent(provider: string, eventId: string, error?: string) {
  await supabaseAdmin().from('billing_events').update(error ? { error } : { processed_at: new Date().toISOString(), error: null }).eq('provider', provider).eq('event_id', eventId);
}

export const addMonth = (d = new Date()) => { const x = new Date(d); x.setMonth(x.getMonth() + 1); return x.toISOString(); };
