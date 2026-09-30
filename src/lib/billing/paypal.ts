import 'server-only';
import { SITE_URL, requireEnv } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';

// PayPal Subscriptions API (USD). Docs: developer.paypal.com/docs/api/subscriptions/v1/
const base = () => (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

let cached: { token: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(requireEnv('PAYPAL_CLIENT_ID') + ':' + requireEnv('PAYPAL_CLIENT_SECRET')).toString('base64');
  const r = await fetch(base() + '/v1/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', cache: 'no-store' });
  if (!r.ok) throw new Error('PayPal auth ' + r.status);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

async function pp<T = any>(method: string, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(base() + path, {
    method,
    headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json', Prefer: 'return=representation', ...extra },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  if (!r.ok) throw new Error(`PayPal ${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function setting(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from('app_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

/** The "Boxinger Pro" catalog product, created once and remembered in app_settings. */
async function productId(): Promise<string> {
  if (process.env.PAYPAL_PRODUCT_ID) return process.env.PAYPAL_PRODUCT_ID;
  const key = 'paypal_product_id:' + (process.env.PAYPAL_ENV || 'sandbox');
  const saved = await setting(key);
  if (saved) return saved;
  const p = await pp('POST', '/v1/catalogs/products', { name: 'Boxinger Pro', description: 'Plan Pro de Boxinger', type: 'SERVICE', category: 'SOFTWARE', home_url: SITE_URL });
  await supabaseAdmin().from('app_settings').upsert({ key, value: p.id });
  return p.id;
}

/** One PayPal billing plan per USD list price (price_schedule row) and environment, remembered in app_settings. */
export async function planFor(price: { id: string; amount: number }): Promise<string> {
  const key = `paypal_plan_id:${process.env.PAYPAL_ENV || 'sandbox'}:${price.id}`;
  const saved = await setting(key);
  if (saved) return saved;
  const plan = await pp('POST', '/v1/billing/plans', {
    product_id: await productId(),
    name: 'Boxinger Pro mensual',
    description: `Plan Pro · USD ${price.amount} por mes`,
    status: 'ACTIVE',
    billing_cycles: [{ frequency: { interval_unit: 'MONTH', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: price.amount.toFixed(2), currency_code: 'USD' } } }],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CANCEL', payment_failure_threshold: 3 },
  }, { 'PayPal-Request-Id': 'plan-' + price.id });
  await supabaseAdmin().from('app_settings').upsert({ key, value: plan.id });
  return plan.id;
}

export async function createSubscription(o: { planId: string; accountId: string; email: string; name: string; amount: number; listAmount: number; returnUrl: string; cancelUrl: string }) {
  const body: Record<string, unknown> = {
    plan_id: o.planId,
    custom_id: o.accountId,
    subscriber: { email_address: o.email, name: { given_name: o.name.split(' ')[0] || o.name, surname: o.name.split(' ').slice(1).join(' ') || undefined } },
    application_context: { brand_name: 'Boxinger', locale: 'es-AR', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW', return_url: o.returnUrl, cancel_url: o.cancelUrl },
  };
  // Account with a special price: override the plan's price for this subscriber only.
  if (Math.abs(o.amount - o.listAmount) > 0.001) body.plan = { billing_cycles: [{ sequence: 1, pricing_scheme: { fixed_price: { value: o.amount.toFixed(2), currency_code: 'USD' } } }] };
  const s = await pp('POST', '/v1/billing/subscriptions', body);
  const approve = (s.links as { rel: string; href: string }[]).find((l) => l.rel === 'approve')?.href;
  if (!approve) throw new Error('PayPal no devolvió el link de aprobación');
  return { id: s.id as string, url: approve };
}

export const getSubscription = (id: string) => pp('GET', '/v1/billing/subscriptions/' + id);

export async function cancelSubscription(id: string, reason = 'Cancelada por el cliente') {
  await pp('POST', `/v1/billing/subscriptions/${id}/cancel`, { reason });
}

/** Changes what an existing subscriber pays from the next cycle (price change or deal). */
export async function updateAmount(id: string, amount: number) {
  await pp('PATCH', '/v1/billing/subscriptions/' + id, [
    { op: 'replace', path: '/plan/billing_cycles/@sequence==1/pricing_scheme/fixed_price', value: { currency_code: 'USD', value: amount.toFixed(2) } },
  ]);
}

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const id = process.env.PAYPAL_WEBHOOK_ID;
  if (!id || !headers.get('paypal-transmission-sig')) return false;
  const r = await pp('POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: headers.get('paypal-auth-algo'),
    cert_url: headers.get('paypal-cert-url'),
    transmission_id: headers.get('paypal-transmission-id'),
    transmission_sig: headers.get('paypal-transmission-sig'),
    transmission_time: headers.get('paypal-transmission-time'),
    webhook_id: id,
    webhook_event: event,
  }).catch((e) => { console.error('paypal verify', e); return null; });
  return r?.verification_status === 'SUCCESS';
}

/** What a PayPal subscription charges per cycle (override or plan price). */
export async function amountOf(sub: { plan_id: string; plan_overridden?: boolean; plan?: { billing_cycles?: { pricing_scheme?: { fixed_price?: { value: string } } }[] } }): Promise<number> {
  const over = sub.plan?.billing_cycles?.[0]?.pricing_scheme?.fixed_price?.value;
  if (over) return Number(over);
  const plan = await pp('GET', '/v1/billing/plans/' + sub.plan_id);
  return Number(plan?.billing_cycles?.[0]?.pricing_scheme?.fixed_price?.value || 0);
}
