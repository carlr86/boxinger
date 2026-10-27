// Creem webhook (/api/billing/creem/webhook): card payments in USD.
import { ACCOUNT, creemRequest, event, freshDb, reported, stubFetch, subscription } from './helpers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/billing/creem/webhook/route';

const checkoutCompleted = {
  id: 'evt_checkout_1', eventType: 'checkout.completed',
  object: { id: 'ch_1', product: 'prod_pro', subscription: { id: 'sub_1', current_period_end_date: '2026-12-01T00:00:00.000Z' } },
};

test('una firma falsa se rechaza y no cambia nada', async () => {
  const db = freshDb({ pending_checkout_id: 'ch_1' });
  const res = await POST(creemRequest(checkoutCompleted, { badSignature: true }));
  assert.equal(res.status, 401);
  assert.equal(subscription(db).plan, 'free');
  assert.equal(db.rows('billing_events').length, 0);
});

test('checkout.completed activa Pro y manda el email de bienvenida', async () => {
  const db = freshDb({ pending_checkout_id: 'ch_1' });
  const res = await POST(creemRequest(checkoutCompleted));
  assert.equal(res.status, 200);
  const s = subscription(db);
  assert.equal(s.plan, 'pro');
  assert.equal(s.status, 'active');
  assert.equal(s.provider, 'creem');
  assert.equal(s.provider_subscription_id, 'sub_1');
  assert.equal(s.current_period_end, '2026-12-01T00:00:00.000Z');
  assert.ok(event(db, 'creem', 'evt_checkout_1')?.processed_at, 'el aviso queda procesado');
  assert.deepEqual(db.rows('email_outbox').map((e) => e.template), ['pro_welcome']);
});

test('el mismo aviso repetido no se procesa dos veces', async () => {
  const db = freshDb({ pending_checkout_id: 'ch_1' });
  await POST(creemRequest(checkoutCompleted));
  const res = await POST(creemRequest(checkoutCompleted));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);
  assert.equal(db.rows('email_outbox').length, 1);
});

test('si la base falla al activar, responde 500, avisa del error y el reintento de Creem activa el plan', async () => {
  const db = freshDb({ pending_checkout_id: 'ch_1' });
  db.failNext('subscriptions', 'update');
  const first = await POST(creemRequest(checkoutCompleted));
  assert.equal(first.status, 500, 'Creem tiene que reintentar');
  assert.equal(subscription(db).plan, 'free');
  assert.equal(event(db, 'creem', 'evt_checkout_1')?.processed_at ?? null, null, 'no queda como procesado');
  assert.ok(event(db, 'creem', 'evt_checkout_1')?.error, 'queda anotado el motivo');
  assert.ok(reported(db, 'webhook-creem'), 'se avisa del error');

  const retry = await POST(creemRequest(checkoutCompleted));
  assert.equal(retry.status, 200);
  assert.equal(subscription(db).plan, 'pro');
  assert.ok(event(db, 'creem', 'evt_checkout_1')?.processed_at);
});

test('si la base falla al registrar el aviso, responde 500 sin procesarlo', async () => {
  const db = freshDb({ pending_checkout_id: 'ch_1' });
  db.failNext('billing_events', 'select');
  const res = await POST(creemRequest(checkoutCompleted));
  assert.equal(res.status, 500);
  assert.equal(subscription(db).plan, 'free');
  assert.ok(reported(db, 'webhook-creem'));
});

test('si la base falla al buscar la cuenta, no se descarta el aviso', async () => {
  const db = freshDb();
  db.failNext('subscriptions', 'select');
  const res = await POST(creemRequest({ id: 'evt_active_1', eventType: 'subscription.active', object: { id: 'sub_1', product: 'prod_pro', customer: { email: 'ana_p@example.com' } } }));
  assert.equal(res.status, 500);
  assert.equal(event(db, 'creem', 'evt_active_1')?.processed_at ?? null, null);
});

test('subscription.paid registra el pago y refund.created lo marca como reembolsado', async () => {
  const db = freshDb({ plan: 'pro', provider: 'creem', provider_subscription_id: 'sub_1', list_amount: 9.99, pro_since: '2026-10-01T00:00:00Z' });
  const paid = await POST(creemRequest({
    id: 'evt_paid_1', eventType: 'subscription.paid',
    object: { id: 'sub_1', product: 'prod_pro', current_period_end_date: '2026-12-01T00:00:00.000Z', last_transaction_id: 'tx_1', last_transaction: { id: 'tx_1', amount: 999, currency: 'USD' } },
  }));
  assert.equal(paid.status, 200);
  const [p] = db.rows('payments');
  assert.equal(p.provider_payment_id, 'tx_1');
  assert.equal(p.amount, 9.99);
  assert.equal(p.status, 'completed');
  assert.equal(p.account_id, ACCOUNT);
  assert.equal(db.rows('email_outbox').length, 0, 'ya era Pro: sin email de bienvenida');

  const refund = await POST(creemRequest({ id: 'evt_refund_1', eventType: 'refund.created', object: { id: 'rf_1', transaction: 'tx_1', subscription: 'sub_1', refund_amount: 999 } }));
  assert.equal(refund.status, 200);
  assert.equal(db.rows('payments')[0].status, 'refunded');
  assert.equal(db.rows('payments')[0].refunded_amount, 9.99);
});

test('subscription.canceled deja Pro hasta el fin del período pagado', async () => {
  const db = freshDb({ plan: 'pro', provider: 'creem', provider_subscription_id: 'sub_1', current_period_end: '2026-11-15T00:00:00Z' });
  const res = await POST(creemRequest({ id: 'evt_cancel_1', eventType: 'subscription.canceled', object: { id: 'sub_1', current_period_end_date: '2026-11-15T00:00:00Z' } }));
  assert.equal(res.status, 200);
  const s = subscription(db);
  assert.equal(s.plan, 'pro');
  assert.equal(s.status, 'cancelled');
  assert.equal(s.cancel_at_period_end, true);
  assert.deepEqual(db.rows('email_outbox').map((e) => e.template), ['pro_cancelled']);
});

test('pasar de Pro con Mercado Pago a Team con tarjeta cancela la suscripción vieja', async () => {
  const db = freshDb({ plan: 'pro', provider: 'mercadopago', provider_subscription_id: 'pre_old', currency: 'ARS' });
  const calls = stubFetch({ 'PUT https://api.mercadopago.com/preapproval/pre_old': { id: 'pre_old', status: 'cancelled' } });
  const res = await POST(creemRequest({ id: 'evt_team_1', eventType: 'subscription.active', object: { id: 'sub_team', product: 'prod_team', metadata: { account_id: ACCOUNT } } }));
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['PUT https://api.mercadopago.com/preapproval/pre_old']);
  const s = subscription(db);
  assert.equal(s.plan, 'enterprise');
  assert.equal(s.provider, 'creem');
  assert.equal(s.currency, 'USD');
});

test('el email del cliente se busca exacto: el guion bajo no es un comodín', async () => {
  const db = freshDb();
  db.rows('profiles')[0].email = 'anaxp@example.com';
  const other = await POST(creemRequest({ id: 'evt_mail_1', eventType: 'subscription.active', object: { id: 'sub_9', product: 'prod_pro', customer: { email: 'ana_p@example.com' } } }));
  assert.equal(other.status, 200);
  assert.equal(subscription(db).plan, 'free', 'quien paga como ana_p@ no es anaxp@');

  const same = await POST(creemRequest({ id: 'evt_mail_2', eventType: 'subscription.active', object: { id: 'sub_9', product: 'prod_pro', customer: { email: 'ANAXP@example.com' } } }));
  assert.equal(same.status, 200);
  assert.equal(subscription(db).plan, 'pro', 'mayúsculas o minúsculas da igual');
});
