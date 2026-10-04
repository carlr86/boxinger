'use server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendNow, dispatchOutbox } from '@/lib/email/outbox';
import { cancelProviderSubscription, syncAmount } from '@/lib/billing/sync';
import { isEmail } from '@/lib/format';

async function requireSuper() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Necesitás iniciar sesión.');
  const { data } = await sb.rpc('is_super_admin');
  if (!data) throw new Error('Solo el Admin de plataforma puede hacer esto.');
  return { sb, uid: user.id };
}

type Res<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): Res<never> => ({ ok: false, error: (e as Error).message || 'Algo salió mal.' });

export async function adminCreateClient(f: { name: string; email: string; team: string; board: string; plan: 'free' | 'pro' | 'enterprise'; send: boolean }): Promise<Res<{ account_id: string; slug: string; token: string; board: string }>> {
  try {
    const { uid } = await requireSuper();
    const email = f.email.trim().toLowerCase();
    if (!f.name.trim()) throw new Error('Ingresá el nombre');
    if (!isEmail(email)) throw new Error('Email inválido');
    if (!f.team.trim()) throw new Error('Ingresá el nombre del equipo');
    const admin = supabaseAdmin();
    const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing) throw new Error('Ya existe un usuario con ese email');
    const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: f.name.trim() } });
    if (error || !created.user) throw new Error(/already/i.test(error?.message || '') ? 'Ya existe un usuario con ese email' : 'No pudimos crear el usuario.');
    const { data, error: e2 } = await admin.rpc('admin_provision_client', { p_actor: uid, p_user: created.user.id, p_team: f.team, p_board: f.board, p_plan: f.plan, p_send: f.send });
    if (e2) { await admin.auth.admin.deleteUser(created.user.id); throw new Error(e2.message); }
    const r = data as { account_id: string; slug: string; token: string; board: string };
    if (f.send) await sendNow(email, 'client_activation', { token: r.token, name: f.name.trim(), board: r.board }, created.user.id);
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}

export async function adminSendActivation(accountId: string, send: boolean): Promise<Res<{ token: string }>> {
  try {
    const { sb } = await requireSuper();
    const { data: token, error } = await sb.rpc('admin_client_activation', { p_account: accountId, p_mark_sent: send });
    if (error) throw new Error(error.message);
    if (send) {
      const admin = supabaseAdmin();
      const { data: acc } = await admin.from('accounts').select('owner_id, profiles:owner_id (name, email)').eq('id', accountId).single();
      const p = (acc as unknown as { owner_id: string; profiles: { name: string; email: string } }).profiles;
      const { data: b } = await admin.rpc('account_first_board', { p_account: accountId });
      const { data: board } = await admin.from('boards').select('name').eq('id', b).maybeSingle();
      await sendNow(p.email, 'client_activation', { token, name: p.name, board: board?.name || '' }, acc!.owner_id, 'activation:' + token + ':' + Date.now());
    }
    return { ok: true, data: { token: token as string } };
  } catch (e) { return fail(e); }
}

/** Plan and price changes. Updates the provider (PayPal / Mercado Pago) so the next charge matches. */
export async function adminUpdateSubscription(f: { account: string; plan: 'free' | 'pro' | 'enterprise'; dealType: 'pct' | 'fixed' | null; value: number | null; until: string | null; note: string; notify: boolean }): Promise<Res<{ warning?: string }>> {
  try {
    const { sb } = await requireSuper();
    const admin = supabaseAdmin();
    const { data: before } = await admin.from('subscriptions').select('*').eq('account_id', f.account).single();
    let warning: string | undefined;
    // Leaving a paid Pro (to Free or Enterprise): stop PayPal / Mercado Pago from charging again.
    if (f.plan !== 'pro' && before?.plan === 'pro' && before.provider_subscription_id && ['paypal', 'mercadopago', 'creem'].includes(before.provider)) {
      try { await cancelProviderSubscription(before.provider, before.provider_subscription_id); }
      catch { warning = 'Cambiamos el plan, pero no pudimos cancelar la suscripción en el proveedor. Cancelala a mano.'; }
    }
    const { error } = await sb.rpc('admin_update_subscription', {
      p_account: f.account, p_plan: f.plan, p_deal_type: f.plan === 'pro' ? f.dealType : null, p_deal_value: f.value,
      p_deal_until: f.until, p_deal_note: f.note, p_notify: f.notify,
    });
    if (error) throw new Error(error.message);
    if (f.plan === 'pro') {
      try { await syncAmount(f.account, true); } catch { warning = 'Guardamos el precio, pero no pudimos actualizarlo en el proveedor. Se reintenta en el proceso diario.'; }
    }
    await dispatchOutbox(10).catch(() => {});
    return { ok: true, data: { warning } };
  } catch (e) { return fail(e); }
}
