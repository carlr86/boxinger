'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';

const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'rgba(0,0,0,0.88)' };
const input: CSSProperties = { height: 40, fontSize: 15, width: '100%' };
const hint: CSSProperties = { fontSize: 12, color: 'rgba(0,0,0,0.45)' };

export function WithdrawalForm() {
  const [f, setF] = useState({ name: '', email: '', account_email: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/arrepentimiento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'No pudimos registrar tu solicitud.');
      setCode(j.code);
    } catch (err) {
      setError((err as Error).message || 'No pudimos registrar tu solicitud. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>Recibimos tu solicitud</span>
        <span>Tu código de solicitud es:</span>
        <span style={{ alignSelf: 'flex-start', fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '6px 14px', color: '#237804' }}>{code}</span>
        <span>También te lo enviamos a <b>{f.email}</b>. Vamos a cancelar la suscripción y hacer el reembolso; te escribimos cuando esté hecho.</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
      <span style={{ fontSize: 17, fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>Quiero revocar mi contratación</span>
      <label style={label}>Nombre y apellido
        <input className="bx-input" style={input} required maxLength={120} autoComplete="name" value={f.name} onChange={set('name')} />
      </label>
      <label style={label}>Email de contacto
        <input className="bx-input" style={input} required type="email" maxLength={254} autoComplete="email" value={f.email} onChange={set('email')} />
        <span style={hint}>Te enviamos el código y la confirmación a este email.</span>
      </label>
      <label style={label}>Email de tu cuenta de Boxinger (si es otro)
        <input className="bx-input" style={input} type="email" maxLength={120} value={f.account_email} onChange={set('account_email')} />
      </label>
      <label style={label}>Comentario (opcional)
        <textarea className="bx-input" rows={3} maxLength={2000} value={f.message} onChange={set('message')} style={{ fontSize: 15 }}
          placeholder="Por ejemplo, con qué medio pagaste o la fecha del pago." />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} aria-hidden
        style={{ position: 'absolute', left: -10000, width: 1, height: 1, opacity: 0 }} />
      {error && <span role="alert" style={{ fontSize: 14, color: '#cf1322' }}>{error}</span>}
      <button type="submit" className="bx-btn-primary" disabled={busy} style={{ alignSelf: 'flex-start', height: 40, padding: '0 22px', fontSize: 15, fontWeight: 500 }}>
        {busy ? 'Enviando…' : 'Enviar solicitud de arrepentimiento'}
      </button>
    </form>
  );
}
