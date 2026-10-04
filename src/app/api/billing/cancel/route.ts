import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import * as paypal from '@/lib/billing/paypal';
import * as mercadopago from '@/lib/billing/mercadopago';
import * as lemon from '@/lib/billing/lemonsqueezy';
import { addMonth, cancelled } from '@/lib/billing/service';

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: acc } = await admin.from('accounts').select('id').eq('owner_id', user.id).maybeSingle();
  if (!acc) return NextResponse.json({ error: 'No tenés una suscripción.' }, { status: 404 });
  const { data: s } = await admin.from('subscriptions').select('*').eq('account_id', acc.id).single();
  if (!s || s.plan !== 'pro' || !s.provider_subscription_id || !['paypal', 'mercadopago', 'lemonsqueezy'].includes(s.provider))
    return NextResponse.json({ error: 'No hay una suscripción para cancelar.' }, { status: 400 });
  try {
    let end: string | null = s.current_period_end;
    if (s.provider === 'paypal') {
      const pp = await paypal.getSubscription(s.provider_subscription_id).catch(() => null);
      end = pp?.billing_info?.next_billing_time || end;
      await paypal.cancelSubscription(s.provider_subscription_id);
    } else if (s.provider === 'lemonsqueezy') {
      const ls = await lemon.cancelSubscription(s.provider_subscription_id);
      end = ls?.attributes.ends_at || ls?.attributes.renews_at || end;
    } else {
      const p = await mercadopago.getPreapproval(s.provider_subscription_id).catch(() => null);
      end = p?.next_payment_date || end;
      await mercadopago.cancelPreapproval(s.provider_subscription_id);
    }
    await cancelled(acc.id, s.provider_subscription_id, end || addMonth());
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('cancel', e);
    return NextResponse.json({ error: 'No pudimos cancelar la suscripción. Escribinos a hola@boxinger.com.' }, { status: 502 });
  }
}
