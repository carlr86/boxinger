// Shared data and tools for the server tests. Imported first by each test file, so the env is set before the app code loads.
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { reset, type FakeDb } from './fakes/db';

process.env.NEXT_PUBLIC_SITE_URL = 'https://boxinger.test';
process.env.CREEM_WEBHOOK_SECRET = 'whsec_test';
process.env.CREEM_API_KEY = 'creem_test';
process.env.CREEM_PRODUCT_ID = 'prod_pro';
process.env.MP_WEBHOOK_SECRET = 'mp_secret_test';
process.env.MP_ACCESS_TOKEN = 'mp_token_test';
process.env.REPORT_ERRORS = '1'; // reportError records errors (record_app_error) also outside production

export const OWNER = '11111111-1111-4111-8111-111111111111';
export const ACCOUNT = '22222222-2222-4222-8222-222222222222';
export const TEAM = '33333333-3333-4333-8333-333333333333';

/** An empty database with one Free account (owner Ana) and the current Pro and Team prices. */
export function freshDb(sub: Record<string, unknown> = {}): FakeDb {
  const db = reset();
  db.seed('profiles', { id: OWNER, email: 'ana_p@example.com', name: 'Ana', locale: 'es', activated_at: null });
  db.seed('accounts', { id: ACCOUNT, owner_id: OWNER, name: 'Equipo de Ana', status: 'active' });
  db.seed('teams', { id: TEAM, account_id: ACCOUNT, name: 'Equipo de Ana' });
  db.seed('boards', { id: 'b1', team_id: TEAM, slug: 'ideas-de-ana', created_at: '2026-10-01T00:00:00Z' });
  db.seed('subscriptions', {
    account_id: ACCOUNT, plan: 'free', status: 'active', provider: null, provider_subscription_id: null, currency: 'USD',
    list_amount: null, charged_amount: null, pro_since: null, current_period_end: null, cancel_at_period_end: false,
    deal_type: null, deal_value: null, deal_until: null, pending_checkout_id: null, ...sub,
  });
  const price = (plan: string, currency: string, amount: number, creem_product_id: string | null) =>
    ({ plan, currency, amount, creem_product_id, paypal_plan_id: null, effective_from: '2026-01-01T00:00:00Z', cancelled_at: null, created_at: '2026-01-01T00:00:00Z' });
  db.seed('price_schedule', price('pro', 'USD', 9.99, 'prod_pro'), price('enterprise', 'USD', 19.99, 'prod_team'), price('pro', 'ARS', 14999, null), price('enterprise', 'ARS', 29999, null));
  return db;
}

export const subscription = (db: FakeDb) => db.rows('subscriptions').find((s) => s.account_id === ACCOUNT)!;
export const event = (db: FakeDb, provider: string, id: string) => db.rows('billing_events').find((e) => e.provider === provider && e.event_id === id);
export const reported = (db: FakeDb, source: string) => db.calls.some((c) => c.fn === 'record_app_error' && c.args.p_source === source);

/** A webhook from Creem, signed like Creem signs it (or with a wrong signature). */
export function creemRequest(body: unknown, o: { badSignature?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', o.badSignature ? 'otro-secreto' : 'whsec_test').update(raw).digest('hex');
  return new NextRequest('https://boxinger.test/api/billing/creem/webhook', { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'creem-signature': sig } });
}

/** A webhook from Mercado Pago, signed like Mercado Pago signs it (or with a wrong signature). */
export function mpRequest(type: string, dataId: string, o: { badSignature?: boolean; requestId?: string } = {}) {
  const ts = String(Date.now());
  const rid = o.requestId || 'req-' + dataId;
  const manifest = `id:${dataId.toLowerCase()};request-id:${rid};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', o.badSignature ? 'otro-secreto' : 'mp_secret_test').update(manifest).digest('hex');
  return new NextRequest(`https://boxinger.test/api/billing/mercadopago/webhook?data.id=${dataId}&type=${type}`, {
    method: 'POST',
    body: JSON.stringify({ type, data: { id: dataId } }),
    headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid },
  });
}

/**
 * Answers the app's calls to Mercado Pago or Creem from `routes` ("GET https://api…/preapproval/x" → JSON).
 * Any other call fails the test: nothing may reach the real services.
 */
export function stubFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${String(input instanceof Request ? input.url : input)}`;
    calls.push(key);
    if (!(key in routes)) throw new Error('fetch inesperado en la prueba: ' + key);
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}
