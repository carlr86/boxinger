import { NextResponse, type NextRequest } from 'next/server';
import * as creem from '@/lib/billing/creem';
import { activate, addMonth, applyRefund, cancelled, claimEvent, currentPrice, expired, findAccount, finishEvent, paymentFailed, recordPayment } from '@/lib/billing/service';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { reportError } from '@/lib/alerts';

// Registered on Creem (webhook "Boxinger") with the checkout/subscription/refund events. See docs/SETUP.md.
type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Which Boxinger account a Creem event belongs to. Creem's webhooks (and completed checkouts) don't carry our
 * metadata, so: known subscription id → metadata if present → the checkout Boxinger opened for the account
 * (subscriptions.pending_checkout_id) → the customer's email (the account owner's, prefilled at checkout).
 */
async function accountFor(subId: string | null, o: Obj, checkoutId?: string): Promise<string | null> {
  const found = await findAccount('creem', subId, o.metadata?.account_id || o.request_id || null);
  if (found) return found;
  if (checkoutId) {
    const { data } = await supabaseAdmin().from('subscriptions').select('account_id').eq('pending_checkout_id', checkoutId).maybeSingle();
    if (data) return data.account_id;
  }
  const email: string | undefined = (typeof o.customer === 'object' ? o.customer?.email : null) || undefined;
  if (!email) return null;
  const admin = supabaseAdmin();
  const { data: p } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (!p) return null;
  const { data: acc } = await admin.from('accounts').select('id').eq('owner_id', p.id).maybeSingle();
  return acc?.id || null;
}

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
      const accountId = await accountFor(subId || null, o, o.id);
      if (accountId && subId) {
        const end = typeof sub === 'object' && sub ? sub.current_period_end_date : null;
        await activate(accountId, { provider: 'creem', subId, currency: 'USD', amount: await list(), periodEnd: end || addMonth() });
      }
    } else if (type.startsWith('subscription.')) {
      const subId: string = o.id;
      const accountId = await accountFor(subId, o);
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
      const txId = typeof o.transaction === 'string' ? o.transaction : o.transaction?.id;
      const refund = Number(o.refund_amount || 0) / 100;
      // On the charge it refunds; if that charge isn't recorded, keep the refund on its own (it adds nothing to billed).
      if (!txId || !(await applyRefund('creem', String(txId), { add: refund }))) {
        const accountId = await accountFor(subId, o);
        await recordPayment({
          accountId, provider: 'creem', paymentId: String(o.id), subId, amount: refund,
          currency: String(o.refund_currency || o.currency || 'USD'), status: 'refunded', paidAt: new Date().toISOString(), raw: body,
        });
        await supabaseAdmin().from('payments').update({ refunded_amount: refund }).eq('provider', 'creem').eq('provider_payment_id', String(o.id));
      }
    }
    await finishEvent('creem', eventId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError('webhook-creem', e, { event: eventId, type: body?.eventType });
    await finishEvent('creem', eventId, String((e as Error).message).slice(0, 500));
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
