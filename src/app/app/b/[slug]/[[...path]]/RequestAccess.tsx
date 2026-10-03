'use client';
import { useState } from 'react';
import { rpc } from '@/lib/rpc';

/** "Solicitar acceso" on an invite-only board (Pro): the team approves or rejects it. */
export function RequestAccess({ slug, initial }: { slug: string; initial: 'pending' | 'rejected' | null }) {
  const [state, setState] = useState(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    try {
      const r = await rpc<string>('request_board_access', { p_slug: slug, p_message: msg.trim() || null });
      if (r === 'guest' || r === 'member' || r === 'admin') window.location.reload();
      else setState('pending');
    } catch (e) {
      setError((e as Error).message || 'No pudimos enviar tu solicitud.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'pending') {
    return (
      <div role="status" style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '12px 14px', fontSize: 14, lineHeight: 1.6 }}>
        <b>Tu solicitud está pendiente.</b> Te avisamos por email cuando el equipo responda.
      </div>
    );
  }
  if (state === 'rejected') {
    return (
      <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px', fontSize: 14, lineHeight: 1.6, color: 'rgba(0,0,0,0.65)' }}>
        El equipo no aprobó tu solicitud. Si creés que es un error, contactá a quien te compartió el link.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
        Contale al equipo quién sos (opcional)
        <textarea className="bx-input" rows={3} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)}
          placeholder="Por ejemplo: soy cliente de la empresa y uso la app todos los días." />
      </label>
      {error && <span role="alert" style={{ fontSize: 14, color: '#cf1322' }}>{error}</span>}
      <button type="button" className="bx-btn-primary" disabled={busy} onClick={send} style={{ alignSelf: 'flex-start', height: 36 }}>
        {busy ? 'Enviando…' : 'Solicitar acceso'}
      </button>
    </div>
  );
}
