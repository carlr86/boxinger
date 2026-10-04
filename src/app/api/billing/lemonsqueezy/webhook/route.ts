import { NextResponse, type NextRequest } from 'next/server';
import * as lemon from '@/lib/billing/lemonsqueezy';
import { activate, addMonth, cancelled, claimEvent, currentPrice, effectiveAmount, expired, findAccount, finishEvent, paymentFailed, recordPayment, setPeriodEnd, type SubRow } from '@/lib/billing/service';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Configured on Lemon Squeezy (Settings › Webhooks) with the subscription_* events. See docs/SETUP.md.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!lemon.verifyWebhook(raw, req.headers.get('x-signature'))) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  let body: { meta?: { event_name?: string; custom_data?: { account_id?: string } }; data?: { id?: string; type?: string; attributes?: Record<string, unknown> } };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const type = body.meta?.event_name || '';
  const a = body.data?.attributes || {};
  const dataId = String(body.data?.id || '');
  if (!type || !dataId) return NextResponse.json({ ok: true });
  const eventId = `${type}:${dataId}:${String(a.updated_at || a.created_at || '')}`;
  if (!(await claimEvent('lemonsqueezy', eventId, type, body))) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const ref = body.meta?.custom_data?.account_id || null;
    if (type.startsWith('subscription_payment_')) {
      // data is a subscription invoice
      const subId = String(a.subscription_id || '');
      const accountId = await findAccount('lemonsqueezy', subId, ref);
      const status = type === 'subscription_payment_success' ? 'completed' : type === 'subscription_payment_refunded' ? 'refunded' : 'failed';
      await recordPayment({
        accountId, provider: 'lemonsqueezy', paymentId: dataId, subId, amount: Number(a.total || 0) / 100,
        currency: String(a.currency || 'USD'), status, paidAt: String(a.created_at || '') || null, raw: body,
      });
      if (accountId && subId && status === 'completed') {
        const s = await lemon.getSubscription(subId).catch(() => null);
        await setPeriodEnd(accountId, s?.attributes.renews_at || addMonth());
      }
      if (accountId && subId && status === 'failed') await paymentFailed(accountId, 'lemonsqueezy', subId, 'ls:' + dataId);
    } else if (type.startsWith('subscription_')) {
      const subId = dataId;
      const accountId = await findAccount('lemonsqueezy', subId, ref);
      if (accountId) {
        const st = String(a.status || '');
        if (st === 'active' || st === 'on_trial') {
          // What this account pays: its special price if any, else the USD list price.
          const { data: sub } = await supabaseAdmin().from('subscriptions').select('*').eq('account_id', accountId).single<SubRow>();
          const list = (await currentPrice('USD')).amount;
          const amount = sub && sub.deal_type ? await effectiveAmount({ ...sub, list_amount: list }, list) : list;
          await activate(accountId, { provider: 'lemonsqueezy', subId, currency: 'USD', amount, periodEnd: (a.renews_at as string) || null });
        } else if (st === 'cancelled') {
          await cancelled(accountId, subId, (a.ends_at as string) || (a.renews_at as string) || null);
        } else if (st === 'expired') {
          await expired(accountId, subId);
        } else if (st === 'past_due' || st === 'unpaid') {
          await paymentFailed(accountId, 'lemonsqueezy', subId, 'ls-sub:' + subId + ':' + String(a.updated_at || ''));
        }
      }
    }
    await finishEvent('lemonsqueezy', eventId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('lemonsqueezy webhook', e);
    await finishEvent('lemonsqueezy', eventId, String((e as Error).message).slice(0, 500));
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
