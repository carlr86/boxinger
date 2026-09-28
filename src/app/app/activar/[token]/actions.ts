'use server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { passwordError } from '@/lib/auth-errors';

/** Sets the first password of a client created from the admin panel. Returns the login email. */
export async function activateWithPassword(token: string, password: string): Promise<{ email?: string; error?: string }> {
  const perr = passwordError(password);
  if (perr) return { error: perr };
  const admin = supabaseAdmin();
  const { data: inv } = await admin.from('invitations').select('id, email, account_id, expires_at, accepted_at, revoked_at').eq('token', token).eq('kind', 'client').maybeSingle();
  if (!inv || inv.revoked_at) return { error: 'El link de activación no es válido.' };
  if (inv.accepted_at) return { error: 'La cuenta ya está activada. Ingresá con tu email.' };
  if (new Date(inv.expires_at) < new Date()) return { error: 'El link venció. Pedile a Boxinger uno nuevo.' };
  const { data: acc } = await admin.from('accounts').select('owner_id').eq('id', inv.account_id).single();
  if (!acc) return { error: 'La cuenta no existe.' };
  const { error } = await admin.auth.admin.updateUserById(acc.owner_id, { password, email_confirm: true });
  if (error) return { error: 'No pudimos guardar la contraseña. Probá de nuevo.' };
  return { email: inv.email };
}
