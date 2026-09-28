import { NextResponse, type NextRequest } from 'next/server';
import * as paypal from '@/lib/billing/paypal';
import { activate, findAccount } from '@/lib/billing/service';

// PayPal sends the buyer back here after approving. The webhook is the source of truth;
// this only makes the upgrade visible right away when PayPal already reports ACTIVE.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('subscription_id');
  const ok = new URL('/app/perfil?tab=sub&checkout=ok', req.nextUrl.origin);
  if (!id) return NextResponse.redirect(ok);
  try {
    const s = await paypal.getSubscription(id);
    const accountId = await findAccount('paypal', id, s.custom_id);
    if (accountId && s.status === 'ACTIVE') {
      await activate(accountId, { provider: 'paypal', subId: id, currency: 'USD', amount: await paypal.amountOf(s), periodEnd: s.billing_info?.next_billing_time });
    }
  } catch (e) {
    console.error('paypal return', e);
  }
  return NextResponse.redirect(ok);
}
