'use server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { passwordError } from '@/lib/auth-errors';
import { reportError } from '@/lib/alerts';

/**
 * Sets the first password of a client created from the admin panel. Returns the login email and the account's first
 * board. The link is used up in this same step (before the password is saved), so it can't be used again to change
 * the password. (Activating with Google goes through /app/invitacion and accept_invitation instead.)
 */
export async function activateWithPassword(token: string, password: string): Promise<{ email?: string; slug?: string | null; error?: string }> {
  const perr = passwordError(password);
  if (perr) return { error: perr };
  const admin = supabaseAdmin();
  try {
    const { data: inv } = await admin.from('invitations').select('id, email, account_id, expires_at, accepted_at, revoked_at').eq('token', token).eq('kind', 'client').maybeSingle().throwOnError();
    if (!inv || inv.revoked_at) return { error: 'El link de activación no es válido.' };
    if (inv.accepted_at) return { error: 'La cuenta ya está activada. Ingresá con tu email.' };
    if (new Date(inv.expires_at) < new Date()) return { error: 'El link venció. Pedile a Boxinger uno nuevo.' };
    const { data: acc } = await admin.from('accounts').select('owner_id').eq('id', inv.account_id).maybeSingle().throwOnError();
    if (!acc) return { error: 'La cuenta no existe.' };

    // Two tabs sending the form at once: only one uses up the link.
    const { data: claimed } = await admin.from('invitations').update({ accepted_at: new Date().toISOString(), accepted_by: acc.owner_id })
      .eq('id', inv.id).is('accepted_at', null).is('revoked_at', null).select('id').throwOnError();
    if (!claimed?.length) return { error: 'La cuenta ya está activada. Ingresá con tu email.' };

    const { error } = await admin.auth.admin.updateUserById(acc.owner_id, { password, email_confirm: true });
    if (error) {
      // The password wasn't saved: the link works again.
      await admin.from('invitations').update({ accepted_at: null, accepted_by: null }).eq('id', inv.id).throwOnError();
      return { error: 'No pudimos guardar la contraseña. Probá de nuevo.' };
    }
    await admin.from('profiles').update({ activated_at: new Date().toISOString() }).eq('id', acc.owner_id).is('activated_at', null).throwOnError();
    const { data: teams } = await admin.from('teams').select('id').eq('account_id', inv.account_id).throwOnError();
    const { data: board } = teams?.length
      ? await admin.from('boards').select('slug').in('team_id', teams.map((t) => t.id)).order('created_at').limit(1).maybeSingle().throwOnError()
      : { data: null };
    return { email: inv.email, slug: board?.slug ?? null };
  } catch (e) {
    await reportError('activar-cuenta', e);
    return { error: 'No pudimos activar la cuenta. Probá de nuevo en unos minutos.' };
  }
}
