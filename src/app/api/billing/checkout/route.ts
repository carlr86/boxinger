import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/env';
import { isEmail } from '@/lib/format';
import * as paypal from '@/lib/billing/paypal';
import * as mercadopago from '@/lib/billing/mercadopago';
import { currentPrice, effectiveAmount, type SubRow } from '@/lib/billing/service';

// Starts a Pro subscription: PayPal (USD) or Mercado Pago (ARS). Returns the provider's approval URL.
export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const provider = body.provider as 'paypal' | 'mercadopago';
  if (provider !== 'paypal' && provider !== 'mercadopago') return NextResponse.json({ error: 'Medio de pago inválido.' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: acc } = await admin.from('accounts').select('id, status, profiles:owner_id (name, email)').eq('owner_id', user.id).maybeSingle();
  if (!acc) return NextResponse.json({ error: 'Primero creá tu equipo y tu buzón.' }, { status: 400 });
  if (acc.status !== 'active') return NextResponse.json({ error: 'La cuenta está suspendida.' }, { status: 403 });
  const { data: sub } = await admin.from('subscriptions').select('*').eq('account_id', acc.id).single<SubRow>();
  if (sub?.plan === 'enterprise') return NextResponse.json({ error: 'Tu cuenta tiene el plan Enterprise.' }, { status: 409 });
  if (sub && sub.plan === 'pro' && ['active', 'past_due'].includes(sub.status) && sub.provider !== 'manual')
    return NextResponse.json({ error: 'Ya tenés el plan Pro activo.' }, { status: 409 });

  const owner = (acc as unknown as { profiles: { name: string; email: string } }).profiles;
  const currency = provider === 'paypal' ? 'USD' : 'ARS';
  const price = await currentPrice(currency);
  // Deals are defined per account; they follow the account across providers only for fixed prices in the same currency.
  const amount = sub && sub.deal_type && sub.currency === currency ? await effectiveAmount({ ...sub, list_amount: price.amount }, price.amount) : price.amount;

  try {
    let r: { id: string; url: string };
    if (provider === 'paypal') {
      const planId = await paypal.planFor(price);
      r = await paypal.createSubscription({
        planId, accountId: acc.id, email: owner.email, name: owner.name, amount, listAmount: price.amount,
        returnUrl: `${SITE_URL}/api/billing/paypal/return`, cancelUrl: `${SITE_URL}/app/perfil?tab=sub&checkout=cancel`,
      });
    } else {
      const payer = typeof body.payer_email === 'string' && isEmail(body.payer_email) ? body.payer_email : owner.email;
      r = await mercadopago.createPreapproval({ accountId: acc.id, payerEmail: payer, amount, backUrl: `${SITE_URL}/api/billing/mercadopago/return` });
    }
    await admin.from('subscriptions').update({ checkout_started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('account_id', acc.id);
    return NextResponse.json({ url: r.url });
  } catch (e) {
    console.error('checkout', e);
    return NextResponse.json({ error: 'No pudimos iniciar el pago con ' + (provider === 'paypal' ? 'PayPal' : 'Mercado Pago') + '. Probá de nuevo en unos minutos.' }, { status: 502 });
  }
}
