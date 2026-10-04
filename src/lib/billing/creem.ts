import 'server-only';
import crypto from 'node:crypto';
import { requireEnv } from '@/lib/env';

// Creem subscriptions (USD), as merchant of record. Docs: docs.creem.io
// Test keys (creem_test_…) talk to the test API; live keys to the live one.
const base = () => (requireEnv('CREEM_API_KEY').startsWith('creem_test_') ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');

export const creemConfigured = () => !!(process.env.CREEM_API_KEY && process.env.CREEM_PRODUCT_ID);

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

/** Hosted checkout for Boxinger Pro. The account travels as metadata and as request_id. */
export async function createCheckout(o: { accountId: string; email: string; successUrl: string }) {
  const r = await cr('POST', '/checkouts', {
    product_id: requireEnv('CREEM_PRODUCT_ID'),
    request_id: o.accountId,
    customer: { email: o.email },
    success_url: o.successUrl,
    metadata: { account_id: o.accountId },
  });
  return { id: r.id as string, url: r.checkout_url as string };
}

export type CreemSub = { id: string; status: string; current_period_end_date: string | null; canceled_at: string | null; metadata?: Record<string, string> | null };

export const getSubscription = (id: string) => cr<CreemSub>('GET', '/subscriptions?subscription_id=' + encodeURIComponent(id));

/** Cancels at the end of the paid period. */
export const cancelSubscription = (id: string) => cr<CreemSub>('POST', `/subscriptions/${id}/cancel`, { mode: 'scheduled', onExecute: 'cancel' });

/** creem-signature: hex HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyWebhook(raw: string, signature: string | null): boolean {
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex')); } catch { return false; }
}
