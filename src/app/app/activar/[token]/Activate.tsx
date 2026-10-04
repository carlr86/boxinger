'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { rpc } from '@/lib/rpc';
import { signInWithGoogle } from '@/lib/oauth';
import { passwordError } from '@/lib/auth-errors';
import { Field, Note } from '@/components/ui';
import { useSession } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import { activateWithPassword } from './actions';

export function Activate({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const { t, tm } = useI18n();
  const { refresh } = useSession();
  const [pass, setPass] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const perr = t(passwordError(pass));

  async function google() {
    const next = '/app/invitacion/' + token;
    const err = await signInWithGoogle(`${location.origin}/app/auth/callback?next=${encodeURIComponent(next)}`, email);
    if (err) setError(err);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (perr) return;
    setBusy(true);
    const r = await activateWithPassword(token, pass);
    if (r.error || !r.email) { setBusy(false); return setError(r.error || 'Algo salió mal. Probá de nuevo.'); }
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: r.email, password: pass });
    if (error) { setBusy(false); return setError('La contraseña quedó guardada. Ingresá con tu email.'); }
    const acc = await rpc<{ slug: string | null }>('accept_invitation', { p_token: token }).catch(() => ({ slug: null }));
    await refresh();
    router.replace(acc.slug ? '/app/b/' + acc.slug : '/app/buzones');
  }
  return (
    <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Boxinger creó una cuenta para {email}. Elegí cómo vas a ingresar.', { email })}</span>
      {error && <Note tone="error">{tm(error)}</Note>}
      <button type="button" className="bx-btn" style={{ height: 40 }} onClick={google}>{t('Continuar con Google')}</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
        <span style={{ flex: 1, height: 1, background: '#f0f0f0' }}  />{t('o creá una contraseña')}<span style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
      </div>
      <Field label={t('Contraseña')} error={tried ? perr : ''} hint={t('Mínimo 8 caracteres, con al menos 1 letra y 1 número')}>
        <input className={'bx-input' + (tried && perr ? ' err' : '')} type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </Field>
      <button type="submit" className="bx-btn-primary" disabled={busy} style={{ height: 40, fontSize: 15 }}>{busy ? t('Activando…') : t('Activar cuenta')}</button>
    </form>
  );
}
