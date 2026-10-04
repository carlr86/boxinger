import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import * as paypal from '@/lib/billing/paypal';
import * as mercadopago from '@/lib/billing/mercadopago';
import * as creem from '@/lib/billing/creem';
import { addMonth, cancelled } from '@/lib/billing/service';
import { reportError } from '@/lib/alerts';
import { CONTACT_TO, sendDirect } from '@/lib/email/contact';
import { render } from '@/lib/email/templates';

const REASONS: Record<string, string> = {
  precio: 'Es caro para lo que lo uso', poco_uso: 'No lo estoy usando lo suficiente', falta_funcion: 'Me falta una función',
  otra_herramienta: 'Me paso a otra herramienta', temporal: 'Es por un tiempo, después vuelvo', otro: 'Otro motivo',
};
const PROVIDERS: Record<string, string> = { creem: 'Creem', mercadopago: 'Mercado Pago', paypal: 'PayPal' };

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' && body.reason in REASONS ? body.reason : null;
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) || null : null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: acc } = await admin.from('accounts').select('id').eq('owner_id', user.id).maybeSingle();
  if (!acc) return NextResponse.json({ error: 'No tenés una suscripción.' }, { status: 404 });
  const { data: s } = await admin.from('subscriptions').select('*').eq('account_id', acc.id).single();
  if (!s || s.plan !== 'pro' || !s.provider_subscription_id || !['paypal', 'mercadopago', 'creem'].includes(s.provider))
    return NextResponse.json({ error: 'No hay una suscripción para cancelar.' }, { status: 400 });
  try {
    let end: string | null = s.current_period_end;
    if (s.provider === 'paypal') {
      const pp = await paypal.getSubscription(s.provider_subscription_id).catch(() => null);
      end = pp?.billing_info?.next_billing_time || end;
      await paypal.cancelSubscription(s.provider_subscription_id);
    } else if (s.provider === 'creem') {
      const c = await creem.cancelSubscription(s.provider_subscription_id);
      end = c?.current_period_end_date || end;
    } else {
      const p = await mercadopago.getPreapproval(s.provider_subscription_id).catch(() => null);
      end = p?.next_payment_date || end;
      await mercadopago.cancelPreapproval(s.provider_subscription_id);
    }
    await cancelled(acc.id, s.provider_subscription_id, end || addMonth());
    await admin.from('subscriptions').update({ cancel_reason: reason, cancel_note: note, cancelled_at: new Date().toISOString() }).eq('account_id', acc.id);
    await notifyCancel(user.id, s.provider, end || addMonth(), reason, note);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError('cancelar-suscripcion', e, { provider: s.provider });
    return NextResponse.json({ error: 'No pudimos cancelar la suscripción. Escribinos a hola@boxinger.com.' }, { status: 502 });
  }
}

/** Tells the Boxinger mailbox who cancelled and why (reply goes to the customer). Never blocks the cancellation. */
async function notifyCancel(userId: string, provider: string, until: string, reason: string | null, note: string | null) {
  try {
    const { data: p } = await supabaseAdmin().from('profiles').select('name, email').eq('id', userId).single();
    const email = String(p?.email || '');
    const mail = render('admin_cancel', {
      name: p?.name || email, email, provider: PROVIDERS[provider] || provider, note,
      reason: reason ? REASONS[reason] : null,
      until: new Date(until).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }),
    });
    await sendDirect({ to: CONTACT_TO(), ...mail, replyTo: email ? { name: String(p?.name || email), address: email } : undefined });
  } catch (e) {
    await reportError('aviso-cancelacion', e, { provider });
  }
}
