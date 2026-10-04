import 'server-only';
import crypto from 'node:crypto';
import { requireEnv } from '@/lib/env';

// Lemon Squeezy subscriptions (USD), as merchant of record. Docs: docs.lemonsqueezy.com/api
const API = 'https://api.lemonsqueezy.com/v1';

export const lemonConfigured = () => !!(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID && process.env.LEMONSQUEEZY_VARIANT_ID);

async function ls<T = any>(method: string, path: string, body?: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + requireEnv('LEMONSQUEEZY_API_KEY'), Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Lemon Squeezy ${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Hosted checkout for Boxinger Pro. `amount` differs from the list price only for accounts with a special price. */
export async function createCheckout(o: { accountId: string; email: string; name: string; amount: number; listAmount: number; redirectUrl: string }) {
  const attributes: Record<string, unknown> = {
    product_options: { redirect_url: o.redirectUrl, enabled_variants: [Number(requireEnv('LEMONSQUEEZY_VARIANT_ID'))] },
    checkout_data: { email: o.email, name: o.name, custom: { account_id: o.accountId } },
    checkout_options: { embed: false },
  };
  if (Math.abs(o.amount - o.listAmount) > 0.001) attributes.custom_price = Math.round(o.amount * 100);
  const r = await ls('POST', '/checkouts', {
    data: {
      type: 'checkouts', attributes,
      relationships: {
        store: { data: { type: 'stores', id: String(requireEnv('LEMONSQUEEZY_STORE_ID')) } },
        variant: { data: { type: 'variants', id: String(requireEnv('LEMONSQUEEZY_VARIANT_ID')) } },
      },
    },
  });
  return { url: r.data.attributes.url as string };
}

export type LemonSub = { id: string; attributes: { status: string; renews_at: string | null; ends_at: string | null; user_email: string; test_mode: boolean } };

export const getSubscription = async (id: string) => (await ls<{ data: LemonSub }>('GET', '/subscriptions/' + id)).data;

/** Cancels at the end of the paid period (Lemon Squeezy keeps it active until `ends_at`). */
export async function cancelSubscription(id: string) {
  return (await ls<{ data: LemonSub }>('DELETE', '/subscriptions/' + id)).data;
}

/** X-Signature: hex HMAC-SHA256 of the raw body with the webhook signing secret. */
export function verifyWebhook(raw: string, signature: string | null): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex')); } catch { return false; }
}
