'use server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { cancelProviderSubscription } from '@/lib/billing/sync';

/** Deletes the signed-in user. Owners also lose their account, teams and boards. */
export async function deleteMyAccount(): Promise<{ error?: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: 'Necesitás iniciar sesión.' };
  const admin = supabaseAdmin();
  const { data: acc } = await admin.from('accounts').select('id').eq('owner_id', user.id).maybeSingle();
  if (acc) {
    const { data: sub } = await admin.from('subscriptions').select('*').eq('account_id', acc.id).maybeSingle();
    if (sub?.provider_subscription_id && (sub.provider === 'paypal' || sub.provider === 'mercadopago')) {
      await cancelProviderSubscription(sub.provider, sub.provider_subscription_id).catch(() => {});
    }
    await admin.from('accounts').delete().eq('id', acc.id);
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: 'No pudimos borrar la cuenta. Escribinos a hola@boxinger.com.' };
  await sb.auth.signOut();
  return {};
}
