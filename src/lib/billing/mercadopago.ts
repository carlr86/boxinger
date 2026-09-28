import 'server-only';
import crypto from 'node:crypto';
import { requireEnv } from '@/lib/env';

// Mercado Pago Suscripciones (preapproval) in ARS. Docs: mercadopago.com.ar/developers/es/reference/subscriptions
const API = 'https://api.mercadopago.com';

async function mp<T = any>(method: string, path: string, body?: unknown, idem?: string): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + requireEnv('MP_ACCESS_TOKEN'), 'Content-Type': 'application/json', ...(idem ? { 'X-Idempotency-Key': idem } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Mercado Pago ${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function createPreapproval(o: { accountId: string; payerEmail: string; amount: number; backUrl: string }) {
  const p = await mp('POST', '/preapproval', {
    reason: 'Boxinger Pro',
    external_reference: o.accountId,
    payer_email: o.payerEmail,
    back_url: o.backUrl,
    status: 'pending',
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Math.round(o.amount * 100) / 100, currency_id: 'ARS' },
  }, 'preapproval-' + o.accountId + '-' + Date.now());
  return { id: p.id as string, url: p.init_point as string };
}

export const getPreapproval = (id: string) => mp('GET', '/preapproval/' + id);
export const getAuthorizedPayment = (id: string) => mp('GET', '/authorized_payments/' + id);

export async function updateAmount(id: string, amount: number) {
  await mp('PUT', '/preapproval/' + id, { auto_recurring: { transaction_amount: Math.round(amount * 100) / 100, currency_id: 'ARS' } });
}

export async function cancelPreapproval(id: string) {
  await mp('PUT', '/preapproval/' + id, { status: 'cancelled' });
}

/**
 * Validates the x-signature header: HMAC-SHA256 of "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * with the webhook secret from the Mercado Pago panel.
 */
export function verifySignature(headers: Headers, dataId: string | null): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const sig = headers.get('x-signature');
  if (!secret || !sig) return false;
  const parts = Object.fromEntries(sig.split(',').map((kv) => kv.trim().split('=').map((x) => x.trim())) as [string, string][]);
  if (!parts.ts || !parts.v1) return false;
  let manifest = '';
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  const rid = headers.get('x-request-id');
  if (rid) manifest += `request-id:${rid};`;
  manifest += `ts:${parts.ts};`;
  const h = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(parts.v1)); } catch { return false; }
}
