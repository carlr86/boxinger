import { NextResponse, type NextRequest } from 'next/server';
import * as paypal from '@/lib/billing/paypal';
import { activate, addMonth, cancelled, claimEvent, expired, findAccount, finishEvent, paymentFailed, recordPayment, setPeriodEnd } from '@/lib/billing/service';

// Configure in developer.paypal.com › App › Webhooks with the events listed in docs/SETUP.md.
export async function POST(req: NextRequest) {
  const event = await req.json().catch(() => null);
  if (!event?.id) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  if (!(await paypal.verifyWebhook(req.headers, event))) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  if (!(await claimEvent('paypal', event.id, event.event_type, event))) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const r = event.resource || {};
    const type: string = event.event_type;
    if (type.startsWith('BILLING.SUBSCRIPTION.')) {
      const subId: string = r.id;
      const accountId = await findAccount('paypal', subId, r.custom_id);
      if (accountId) {
        if (type === 'BILLING.SUBSCRIPTION.ACTIVATED' || type === 'BILLING.SUBSCRIPTION.RE-ACTIVATED') {
          await activate(accountId, { provider: 'paypal', subId, currency: 'USD', amount: await paypal.amountOf(r), periodEnd: r.billing_info?.next_billing_time });
        } else if (type === 'BILLING.SUBSCRIPTION.UPDATED') {
          await setPeriodEnd(accountId, r.billing_info?.next_billing_time || null);
        } else if (type === 'BILLING.SUBSCRIPTION.CANCELLED') {
          await cancelled(accountId, subId, r.billing_info?.next_billing_time || (r.billing_info?.last_payment?.time ? addMonth(new Date(r.billing_info.last_payment.time)) : null));
        } else if (type === 'BILLING.SUBSCRIPTION.SUSPENDED' || type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
          await paymentFailed(accountId, 'paypal', subId, event.id);
        } else if (type === 'BILLING.SUBSCRIPTION.EXPIRED') {
          await expired(accountId, subId);
        }
      }
    } else if (type === 'PAYMENT.SALE.COMPLETED' || type === 'PAYMENT.SALE.DENIED' || type === 'PAYMENT.SALE.REFUNDED') {
      const subId: string | null = r.billing_agreement_id || null;
      const accountId = subId ? await findAccount('paypal', subId, r.custom) : null;
      await recordPayment({
        accountId, provider: 'paypal', paymentId: r.id, subId, amount: Number(r.amount?.total || 0), currency: r.amount?.currency || 'USD',
        status: type === 'PAYMENT.SALE.COMPLETED' ? 'completed' : type === 'PAYMENT.SALE.REFUNDED' ? 'refunded' : 'failed', paidAt: r.create_time, raw: r,
      });
      if (accountId && subId && type === 'PAYMENT.SALE.COMPLETED') {
        const s = await paypal.getSubscription(subId).catch(() => null);
        if (s?.status === 'ACTIVE') await setPeriodEnd(accountId, s.billing_info?.next_billing_time || addMonth());
      }
      if (accountId && subId && type === 'PAYMENT.SALE.DENIED') await paymentFailed(accountId, 'paypal', subId, event.id);
    }
    await finishEvent('paypal', event.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('paypal webhook', e);
    await finishEvent('paypal', event.id, String((e as Error).message).slice(0, 500));
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
