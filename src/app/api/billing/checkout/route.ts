import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/env';
import { isEmail } from '@/lib/format';
import { CREEM_ENABLED, PAYPAL_ENABLED } from '@/lib/constants';
import * as paypal from '@/lib/billing/paypal';
import * as mercadopago from '@/lib/billing/mercadopago';
import * as creem from '@/lib/billing/creem';
import { currentPrice, effectiveAmount, type SubRow } from '@/lib/billing/service';
import { reportError } from '@/lib/alerts';

// Starts a Pro subscription: Creem (USD, cards worldwide), Mercado Pago (ARS) or PayPal (USD, off).
// Returns the provider's checkout URL.
export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const provider = body.provider as 'paypal' | 'mercadopago' | 'creem';
  if (!['paypal', 'mercadopago', 'creem'].includes(provider)) return NextResponse.json({ error: 'Medio de pago inválido.' }, { status: 400 });
  if (provider === 'creem' && (!CREEM_ENABLED || !creem.creemConfigured())) return NextResponse.json({ error: 'El pago con tarjeta internacional no está disponible por ahora.' }, { status: 400 });
  if (provider === 'paypal' && !PAYPAL_ENABLED) return NextResponse.json({ error: 'El pago con PayPal no está disponible por ahora. Probá con Mercado Pago.' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: acc } = await admin.from('accounts').select('id, status, profiles:owner_id (name, email)').eq('owner_id', user.id).maybeSingle();
  if (!acc) return NextResponse.json({ error: 'Primero creá tu equipo y tu buzón.' }, { status: 400 });
  if (acc.status !== 'active') return NextResponse.json({ error: 'La cuenta está suspendida.' }, { status: 403 });
  const { data: sub } = await admin.from('subscriptions').select('*').eq('account_id', acc.id).single<SubRow>();
  if (sub?.plan === 'enterprise') return NextResponse.json({ error: 'Tu cuenta tiene el plan Enterprise.' }, { status: 409 });
  if (sub && sub.plan === 'pro' && ['active', 'past_due'].includes(sub.status) && sub.provider !== 'manual')
    return NextResponse.json({ error: 'Ya tenés el plan Pro activo.' }, { status: 409 });

  const owner = (acc as unknown as { profiles: { name: string; email: string } }).profiles;
  const currency = provider === 'mercadopago' ? 'ARS' : 'USD';
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
    } else if (provider === 'creem') {
      const c = await creem.createCheckout({ accountId: acc.id, email: owner.email, successUrl: `${SITE_URL}/app/perfil?tab=sub&checkout=ok` });
      r = { id: c.id, url: c.url };
    } else {
      const payer = typeof body.payer_email === 'string' && isEmail(body.payer_email) ? body.payer_email : owner.email;
      r = await mercadopago.createPreapproval({ accountId: acc.id, payerEmail: payer, amount, backUrl: `${SITE_URL}/api/billing/mercadopago/return` });
    }
    await admin.from('subscriptions').update({ checkout_started_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(provider === 'creem' ? { pending_checkout_id: r.id } : {}) }).eq('account_id', acc.id);
    return NextResponse.json({ url: r.url });
  } catch (e) {
    await reportError('checkout', e, { provider, account: acc.id });
    return NextResponse.json({ error: 'No pudimos iniciar el pago con ' + ({ paypal: 'PayPal', mercadopago: 'Mercado Pago', creem: 'tarjeta' }[provider]) + '. Probá de nuevo en unos minutos.' }, { status: 502 });
  }
}
