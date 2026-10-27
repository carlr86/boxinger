// Mercado Pago webhook (/api/billing/mercadopago/webhook): subscriptions in ARS. The webhook only says what changed;
// the app reads the real state from Mercado Pago's API (stubbed here).
import { ACCOUNT, event, freshDb, mpRequest, reported, stubFetch, subscription } from './helpers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/billing/mercadopago/webhook/route';

const MP = 'https://api.mercadopago.com';
const authorized = { id: 'pre_1', status: 'authorized', external_reference: ACCOUNT, reason: 'Boxinger Pro', auto_recurring: { transaction_amount: 14999 }, next_payment_date: '2026-12-01T00:00:00.000Z' };

test('una firma falsa se rechaza sin preguntarle nada a Mercado Pago', async () => {
  const db = freshDb();
  const calls = stubFetch({});
  const res = await POST(mpRequest('subscription_preapproval', 'pre_1', { badSignature: true }));
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
  assert.equal(db.rows('billing_events').length, 0);
});

test('una suscripción autorizada activa Pro en pesos', async () => {
  const db = freshDb();
  stubFetch({ [`GET ${MP}/preapproval/pre_1`]: authorized });
  const res = await POST(mpRequest('subscription_preapproval', 'pre_1'));
  assert.equal(res.status, 200);
  const s = subscription(db);
  assert.equal(s.plan, 'pro');
  assert.equal(s.provider, 'mercadopago');
  assert.equal(s.provider_subscription_id, 'pre_1');
  assert.equal(s.currency, 'ARS');
  assert.equal(s.charged_amount, 14999);
  assert.equal(s.current_period_end, '2026-12-01T00:00:00.000Z');
  assert.deepEqual(db.rows('email_outbox').map((e) => e.template), ['pro_welcome']);
});

test('una suscripción «Boxinger Team» activa el plan Team', async () => {
  const db = freshDb();
  stubFetch({ [`GET ${MP}/preapproval/pre_1`]: { ...authorized, reason: 'Boxinger Team', auto_recurring: { transaction_amount: 29999 } } });
  await POST(mpRequest('subscription_preapproval', 'pre_1'));
  assert.equal(subscription(db).plan, 'enterprise');
});

test('un cobro rechazado deja la cuenta con el pago pendiente y avisa a la persona y a los super-admins', async () => {
  const db = freshDb({ plan: 'pro', provider: 'mercadopago', provider_subscription_id: 'pre_1', currency: 'ARS' });
  stubFetch({ [`GET ${MP}/authorized_payments/ap_1`]: { id: 'ap_1', preapproval_id: 'pre_1', external_reference: ACCOUNT, status: 'recycling', payment: { id: 'pay_1', status: 'rejected' }, transaction_amount: 14999, currency_id: 'ARS', date_created: '2026-10-26T12:00:00Z' } });
  const res = await POST(mpRequest('subscription_authorized_payment', 'ap_1'));
  assert.equal(res.status, 200);
  assert.equal(subscription(db).status, 'past_due');
  assert.equal(db.rows('payments')[0].status, 'failed');
  assert.deepEqual(db.rows('email_outbox').map((e) => e.template), ['payment_failed']);
  assert.ok(db.calls.some((c) => c.fn === 'notify_super_admins' && c.args.p_pref === 'payfail'));
});

test('si la base falla al guardar el cobro, responde 500, avisa del error y el reintento lo guarda', async () => {
  const db = freshDb({ plan: 'pro', provider: 'mercadopago', provider_subscription_id: 'pre_1', currency: 'ARS' });
  stubFetch({
    [`GET ${MP}/authorized_payments/ap_2`]: { id: 'ap_2', preapproval_id: 'pre_1', status: 'processed', payment: { id: 'pay_2', status: 'approved' }, transaction_amount: 14999, currency_id: 'ARS', date_created: '2026-10-26T12:00:00Z' },
    [`GET ${MP}/preapproval/pre_1`]: authorized,
  });
  db.failNext('payments', 'upsert');
  const first = await POST(mpRequest('subscription_authorized_payment', 'ap_2'));
  assert.equal(first.status, 500, 'Mercado Pago tiene que reintentar');
  assert.equal(db.rows('payments').length, 0);
  assert.ok(reported(db, 'webhook-mercadopago'));
  const id = db.rows('billing_events')[0].event_id;
  assert.equal(event(db, 'mercadopago', id)?.processed_at ?? null, null);

  const retry = await POST(mpRequest('subscription_authorized_payment', 'ap_2'));
  assert.equal(retry.status, 200);
  assert.equal(db.rows('payments')[0].status, 'completed');
  assert.ok(event(db, 'mercadopago', id)?.processed_at);
});

test('un reembolso de Mercado Pago marca el cobro como reembolsado', async () => {
  const db = freshDb({ plan: 'pro', provider: 'mercadopago', provider_subscription_id: 'pre_1', currency: 'ARS' });
  db.seed('payments', { account_id: ACCOUNT, provider: 'mercadopago', provider_payment_id: 'pay_3', amount: 14999, currency: 'ARS', status: 'completed', refunded_amount: 0 });
  stubFetch({ [`GET ${MP}/v1/payments/pay_3`]: { id: 'pay_3', status: 'refunded', transaction_amount: 14999 } });
  const res = await POST(mpRequest('payment', 'pay_3'));
  assert.equal(res.status, 200);
  assert.equal(db.rows('payments')[0].status, 'refunded');
  assert.equal(db.rows('payments')[0].refunded_amount, 14999);
});

test('una suscripción de otra cuenta que no existe no toca nada', async () => {
  const db = freshDb();
  stubFetch({ [`GET ${MP}/preapproval/pre_x`]: { ...authorized, id: 'pre_x', external_reference: '99999999-9999-4999-8999-999999999999' } });
  const res = await POST(mpRequest('subscription_preapproval', 'pre_x'));
  assert.equal(res.status, 200);
  assert.equal(subscription(db).plan, 'free');
});
