import 'server-only';
import crypto from 'node:crypto';
import { cleanEnv, requireEnv } from '@/lib/env';

// Creem subscriptions (USD), as merchant of record. Docs: docs.creem.io
// Test keys (creem_test_…) talk to the test API; live keys to the live one.
const base = () => (requireEnv('CREEM_API_KEY').startsWith('creem_test_') ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');

export const creemConfigured = () => !!(cleanEnv(process.env.CREEM_API_KEY) && cleanEnv(process.env.CREEM_PRODUCT_ID));
/** The first Creem product of each plan (later prices get their own product, see creem-products.ts). */
export const baseProduct = (plan: 'pro' | 'enterprise') =>
  plan === 'enterprise' ? cleanEnv(process.env.CREEM_ENTERPRISE_PRODUCT_ID) || 'prod_5vBg7bDxuY1x7J7TZ8c3ql' : requireEnv('CREEM_PRODUCT_ID');

async function cr<T = any>(method: string, path: string, body?: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(base() + path, {
    method,
    headers: { 'x-api-key': requireEnv('CREEM_API_KEY'), Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Boxinger/1.0 (+https://boxinger.com)' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Creem ${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Hosted checkout for Boxinger Pro or Enterprise. The account travels as metadata and as request_id. */
export async function createCheckout(o: { accountId: string; email: string; successUrl: string; plan?: 'pro' | 'enterprise'; productId: string }) {
  const r = await cr('POST', '/checkouts', {
    product_id: o.productId,
    request_id: o.accountId,
    customer: { email: o.email },
    success_url: o.successUrl,
    metadata: { account_id: o.accountId, plan: o.plan || 'pro' },
  });
  return { id: r.id as string, url: r.checkout_url as string };
}

export type CreemSub = { id: string; status: string; current_period_end_date: string | null; canceled_at: string | null; metadata?: Record<string, string> | null };

export const getSubscription = (id: string) => cr<CreemSub>('GET', '/subscriptions?subscription_id=' + encodeURIComponent(id));

/** Cancels at the end of the paid period. */
export const cancelSubscription = (id: string) => cr<CreemSub>('POST', `/subscriptions/${id}/cancel`, { mode: 'scheduled', onExecute: 'cancel' });

/** Undoes a scheduled cancellation (subscription in scheduled_cancel). */
export const resumeSubscription = (id: string) => cr<CreemSub>('POST', `/subscriptions/${id}/resume`, {});

/** creem-signature: hex HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyWebhook(raw: string, signature: string | null): boolean {
  const secret = cleanEnv(process.env.CREEM_WEBHOOK_SECRET);
  if (!secret || !signature) return false;
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex')); } catch { return false; }
}

export type CreemProduct = { id: string; name: string; description: string; price: number; currency: string; billing_type: string; billing_period: string; tax_mode?: string; tax_category?: string };
export const getProduct = (id: string) => cr<CreemProduct>('GET', '/products?product_id=' + encodeURIComponent(id));
/** A monthly product like `base` but with another price (Creem can't change a product's or a subscription's price). */
export async function cloneProductWithPrice(base: CreemProduct, amount: number): Promise<string> {
  const p = await cr<{ id: string }>('POST', '/products', {
    name: base.name, description: base.description || base.name, price: Math.round(amount * 100), currency: 'USD',
    billing_type: 'recurring', billing_period: base.billing_period || 'every-month',
    ...(base.tax_mode ? { tax_mode: base.tax_mode } : {}), ...(base.tax_category ? { tax_category: base.tax_category } : {}),
  });
  return p.id;
}

