'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { authError, passwordError } from '@/lib/auth-errors';
import { Field, Note } from '@/components/ui';
import { useSession, useToast } from '@/components/Providers';

export function NewPasswordForm({ title = 'Nueva contraseña', sub = 'Elegí una contraseña para tu cuenta de Boxinger.', done = '/app' }: { title?: string; sub?: string; done?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { ctx, refresh } = useSession();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const e1 = passwordError(pass);
  const e2 = pass2 !== pass ? 'Las contraseñas no coinciden' : '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (e1 || e2) return;
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pass });
    setBusy(false);
    if (error) return setError(authError(error.message));
    await refresh();
    toast.ok('Contraseña actualizada');
    router.replace(done);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate style={{ maxWidth: 400, width: '100%', margin: '24px auto', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{title}</h1>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{sub}</span>
      </div>
      {!ctx && <Note tone="warn">El link venció o se abrió en otro navegador. <a href="/app/ingresar">Pedí uno nuevo</a>.</Note>}
      {error && <Note tone="error">{error}</Note>}
      <Field label="Contraseña" error={tried ? e1 : ''} hint="Mínimo 8 caracteres, con al menos 1 letra y 1 número">
        <input className={'bx-input' + (tried && e1 ? ' err' : '')} type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </Field>
      <Field label="Repetí la contraseña" error={tried ? e2 : ''}>
        <input className={'bx-input' + (tried && e2 ? ' err' : '')} type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
      </Field>
      <button type="submit" className="bx-btn-primary" disabled={busy || !ctx} style={{ height: 40, fontSize: 15 }}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
    </form>
  );
}
