import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import * as creem from '@/lib/billing/creem';
import { reportError } from '@/lib/alerts';

// "Volver a Pro" while a cancelled subscription is still paid for. Creem: undoes the scheduled
// cancellation (no new charge). Mercado Pago can't revive a cancelled subscription: the app opens a
// new checkout that starts charging when the paid period ends (see /api/billing/checkout).
export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: acc } = await admin.from('accounts').select('id').eq('owner_id', user.id).maybeSingle();
  const { data: s } = acc ? await admin.from('subscriptions').select('*').eq('account_id', acc.id).single() : { data: null };
  if (!acc || !s || s.plan !== 'pro' || !s.cancel_at_period_end) return NextResponse.json({ error: 'No hay una suscripción cancelada para reactivar.' }, { status: 400 });
  if (s.provider !== 'creem') return NextResponse.json({ checkout: true });
  try {
    const c = await creem.resumeSubscription(s.provider_subscription_id);
    await admin.from('subscriptions').update({
      status: 'active', cancel_at_period_end: false, current_period_end: c?.current_period_end_date || s.current_period_end, updated_at: new Date().toISOString(),
    }).eq('account_id', acc.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError('volver-a-pro', e, { provider: s.provider, account: acc.id });
    return NextResponse.json({ error: 'No pudimos reactivar la suscripción. Escribinos a hola@boxinger.com.' }, { status: 502 });
  }
}
