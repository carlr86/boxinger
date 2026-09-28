import { NextResponse, type NextRequest } from 'next/server';
import * as mercadopago from '@/lib/billing/mercadopago';
import { claimEvent, findAccount, finishEvent, paymentFailed, recordPayment } from '@/lib/billing/service';
import { handlePreapproval } from '@/lib/billing/mp-events';

// Configure in mercadopago.com.ar/developers › Tus integraciones › Webhooks with the
// "Planes y suscripciones" topics. See docs/SETUP.md.
export async function POST(req: NextRequest) {
  const url = req.nextUrl;
  const body = await req.json().catch(() => ({}));
  const type: string = body.type || url.searchParams.get('type') || url.searchParams.get('topic') || '';
  const dataId: string | null = body.data?.id ? String(body.data.id) : url.searchParams.get('data.id') || url.searchParams.get('id');
  if (!dataId) return NextResponse.json({ ok: true });
  if (!mercadopago.verifySignature(req.headers, url.searchParams.get('data.id') || dataId)) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });

  const eventId = `${type}:${dataId}:${body.id || req.headers.get('x-request-id') || ''}`;
  if (!(await claimEvent('mercadopago', eventId, type, body))) return NextResponse.json({ ok: true, duplicate: true });

  try {
    if (type === 'subscription_preapproval' || type === 'preapproval') {
      await handlePreapproval(dataId);
    } else if (type === 'subscription_authorized_payment' || type === 'authorized_payment') {
      const ap = await mercadopago.getAuthorizedPayment(dataId);
      const subId: string | null = ap.preapproval_id || null;
      const accountId = subId ? await findAccount('mercadopago', subId, ap.external_reference) : null;
      const pst: string = ap.payment?.status || ap.status;
      const ok = pst === 'approved' || pst === 'processed';
      const bad = pst === 'rejected' || ap.status === 'recycling' && ap.payment?.status === 'rejected';
      await recordPayment({
        accountId, provider: 'mercadopago', paymentId: String(ap.payment?.id || ap.id), subId, amount: Number(ap.transaction_amount || 0),
        currency: ap.currency_id || 'ARS', status: ok ? 'completed' : bad ? 'failed' : 'pending', paidAt: ap.date_created, raw: ap,
      });
      if (accountId && subId && bad) await paymentFailed(accountId, 'mercadopago', subId, 'mp:' + ap.id);
      if (accountId && subId && ok) await handlePreapproval(subId);
    }
    await finishEvent('mercadopago', eventId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('mercadopago webhook', e);
    await finishEvent('mercadopago', eventId, String((e as Error).message).slice(0, 500));
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
