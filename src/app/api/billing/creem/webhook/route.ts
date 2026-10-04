import { NextResponse, type NextRequest } from 'next/server';
import * as creem from '@/lib/billing/creem';
import { activate, addMonth, cancelled, claimEvent, currentPrice, expired, findAccount, finishEvent, paymentFailed, recordPayment } from '@/lib/billing/service';

// Registered on Creem (webhook "Boxinger") with the checkout/subscription/refund events. See docs/SETUP.md.
type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!creem.verifyWebhook(raw, req.headers.get('creem-signature'))) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  let body: { id?: string; eventType?: string; object?: Obj };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const type = body.eventType || '';
  const o: Obj = body.object || {};
  const eventId = body.id || `${type}:${o.id || ''}`;
  if (!type) return NextResponse.json({ ok: true });
  if (!(await claimEvent('creem', eventId, type, body))) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const list = async () => (await currentPrice('USD')).amount;
    if (type === 'checkout.completed') {
      // The checkout carries the subscription and our account (metadata / request_id).
      const sub: Obj | string | null = o.subscription || null;
      const subId = typeof sub === 'string' ? sub : sub?.id;
      const accountId = await findAccount('creem', subId || null, o.metadata?.account_id || o.request_id);
      if (accountId && subId) {
        const end = typeof sub === 'object' && sub ? sub.current_period_end_date : null;
        await activate(accountId, { provider: 'creem', subId, currency: 'USD', amount: await list(), periodEnd: end || addMonth() });
      }
    } else if (type.startsWith('subscription.')) {
      const subId: string = o.id;
      const accountId = await findAccount('creem', subId, o.metadata?.account_id);
      if (accountId && subId) {
        const end: string | null = o.current_period_end_date || null;
        if (type === 'subscription.active' || type === 'subscription.paid') {
          await activate(accountId, { provider: 'creem', subId, currency: 'USD', amount: await list(), periodEnd: end || addMonth() });
          if (type === 'subscription.paid') {
            const tx = o.last_transaction || {};
            await recordPayment({
              accountId, provider: 'creem', paymentId: String(o.last_transaction_id || tx.id || eventId), subId,
              amount: tx.amount != null ? Number(tx.amount) / 100 : await list(), currency: String(tx.currency || 'USD'),
              status: 'completed', paidAt: new Date().toISOString(), raw: body,
            });
          }
        } else if (type === 'subscription.scheduled_cancel' || type === 'subscription.canceled') {
          await cancelled(accountId, subId, end);
        } else if (type === 'subscription.expired') {
          await expired(accountId, subId);
        } else if (type === 'subscription.past_due' || type === 'subscription.unpaid') {
          await paymentFailed(accountId, 'creem', subId, 'creem:' + eventId);
        }
      }
    } else if (type === 'refund.created') {
      const subId: string | null = typeof o.subscription === 'string' ? o.subscription : o.subscription?.id || null;
      const accountId = await findAccount('creem', subId, o.metadata?.account_id);
      await recordPayment({
        accountId, provider: 'creem', paymentId: String(o.id), subId, amount: Number(o.refund_amount || 0) / 100,
        currency: String(o.refund_currency || o.currency || 'USD'), status: 'refunded', paidAt: new Date().toISOString(), raw: body,
      });
    }
    await finishEvent('creem', eventId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('creem webhook', e);
    await finishEvent('creem', eventId, String((e as Error).message).slice(0, 500));
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
