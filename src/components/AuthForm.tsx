'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { authError, passwordError } from '@/lib/auth-errors';
import { signInWithGoogle } from '@/lib/oauth';
import { isEmail } from '@/lib/format';
import { Field, Note } from '@/components/ui';
import { useSession } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';

type Mode = 'login' | 'registro';

export function AuthForm({ mode: initial, next, boardName, alert, invitedEmail, notice }: {
  mode: Mode; next: string; boardName?: string | null; alert?: boolean; invitedEmail?: string | null; notice?: string | null;
}) {
  const router = useRouter();
  const { t, tm } = useI18n();
  const { refresh } = useSession();
  const [mode, setMode] = useState<Mode>(initial);
  const [f, setF] = useState({ name: '', email: invitedEmail || '', pass: '' });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<'' | 'verify' | 'reset'>('');
  const lm = mode === 'login';

  const errs = {
    name: !lm && !f.name.trim() ? t('Ingresá tu nombre') : '',
    email: !isEmail(f.email.trim()) ? t('Ingresá un email válido') : '',
    pass: lm ? (f.pass ? '' : t('Ingresá tu contraseña')) : t(passwordError(f.pass)),
  };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const cb = (path: string) => `${origin}/app/auth/callback?next=${encodeURIComponent(path)}`;

  async function google() {
    setError('');
    const err = await signInWithGoogle(cb(next));
    if (err) setError(authError(err));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError('');
    if (errs.name || errs.email || errs.pass) return;
    setBusy(true);
    const sb = supabaseBrowser();
    try {
      if (lm) {
        const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.pass });
        if (error) throw error;
        await refresh();
        router.replace(next);
        router.refresh();
      } else {
        const { data, error } = await sb.auth.signUp({
          email: f.email.trim(), password: f.pass,
          options: { data: { name: f.name.trim() }, emailRedirectTo: cb(next) },
        });
        if (error) throw error;
        if (data.session) {
          await refresh();
          router.replace(next);
          router.refresh();
        } else setSent('verify');
      }
    } catch (err) {
      setError(authError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!isEmail(f.email.trim())) { setTried(true); setError('Escribí tu email para recuperar la contraseña.'); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(f.email.trim(), { redirectTo: cb('/app/nueva-contrasena') });
    setBusy(false);
    if (error) setError(authError(error.message));
    else setSent('reset');
  }

  async function resend() {
    const { error } = await supabaseBrowser().auth.resend({ type: 'signup', email: f.email.trim(), options: { emailRedirectTo: cb(next) } });
    setError(error ? authError(error.message) : '');
    if (!error) setSent('verify');
  }

  if (sent) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{t('Revisá tu email')}</h1>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>
            {sent === 'verify'
              ? t('Te enviamos un link a {email} para verificar tu cuenta. Hasta verificarla podés ver los buzones, pero no votar, comentar ni cargar ideas.', { email: f.email.trim() })
              : t('Te enviamos un link a {email} para crear una nueva contraseña. Vale por 1 hora.', { email: f.email.trim() })}
          </span>
        </div>
        {sent === 'verify' && <a onClick={resend} style={{ fontSize: 14 }}>{t('Reenviar el email')}</a>}
        <a onClick={() => { setSent(''); setMode('login'); }} style={{ fontSize: 14 }}>{t('Volver a ingresar')}</a>
      </div>
    );
  }

  const title = lm ? t('Iniciá sesión') : boardName ? t('Registrate para participar') : t('Creá tu cuenta');
  const sub = lm
    ? boardName ? t('Entrá a {board} en Boxinger.', { board: boardName }) : t('Entrá a tus buzones de Boxinger.')
    : boardName ? t('Vas a quedar como Comunidad de {board}.', { board: boardName }) : t('Empezá gratis con un buzón. Sin tarjeta de crédito.');

  return (
    <form style={card} onSubmit={submit} noValidate>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{title}</h1>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{sub}</span>
      </div>
      {alert && <Note>{t('Para votar, comentar o cargar ideas necesitás una cuenta.')}</Note>}
      {notice && <Note tone="success">{notice}</Note>}
      {error && <Note tone="error">{tm(error)}{/verificaste/.test(error) && <> <a onClick={resend}>{t('Reenviar link')}</a></>}</Note>}
      <button type="button" onClick={google} className="bx-btn" style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <GoogleG /> {t('Continuar con Google')}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
        <span style={{ flex: 1, height: 1, background: '#f0f0f0' }}  />{t('o con tu email')}<span style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
      </div>
      {!lm && (
        <Field label={t('Nombre')} error={tried ? errs.name : ''}>
          <input className={'bx-input' + (tried && errs.name ? ' err' : '')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" maxLength={60} />
        </Field>
      )}
      <Field label={t('Email')} error={tried ? errs.email : ''}>
        <input className={'bx-input' + (tried && errs.email ? ' err' : '')} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
      </Field>
      <Field label={t('Contraseña')} error={tried ? errs.pass : ''} hint={lm ? undefined : t('Mínimo 8 caracteres, con al menos 1 letra y 1 número')}>
        <input className={'bx-input' + (tried && errs.pass ? ' err' : '')} type="password" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} autoComplete={lm ? 'current-password' : 'new-password'} />
      </Field>
      <button type="submit" className="bx-btn-primary" disabled={busy} style={{ height: 40, fontSize: 15 }}>{busy ? t('Un momento…') : lm ? t('Ingresar') : t('Crear cuenta')}</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, flexWrap: 'wrap', gap: 8 }}>
        <Link href={(lm ? '/app/registro' : '/app/ingresar') + '?next=' + encodeURIComponent(next)} onClick={(e) => { e.preventDefault(); setMode(lm ? 'registro' : 'login'); setTried(false); setError(''); }}>
          {lm ? t('¿No tenés cuenta? Registrate') : t('¿Ya tenés cuenta? Ingresá')}
        </Link>
        {lm && <a onClick={forgot} className="bx-link-muted">{t('¿Olvidaste tu contraseña?')}</a>}
      </div>
      {!lm && (
        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>
          {t('Al crear tu cuenta aceptás los')} <Link href="/terminos">{t('Términos')}</Link> {t('y la')} <Link href="/privacidad">{t('Política de privacidad')}</Link>.
        </span>
      )}
    </form>
  );
}

const card: React.CSSProperties = {
  maxWidth: 400, width: '100%', margin: '24px auto', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 32,
  display: 'flex', flexDirection: 'column', gap: 16,
};

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
