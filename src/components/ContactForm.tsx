'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { CONTACT_TOPICS, type ContactTopic } from '@/lib/constants';

const TEAM_SIZES = ['1 a 10 personas', '11 a 50 personas', '51 a 200 personas', 'Más de 200 personas'];

const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'rgba(0,0,0,0.88)' };
const input: CSSProperties = { height: 40, fontSize: 15, width: '100%' };

/**
 * Contact form posted to /api/contact, which emails hola@boxinger.com.
 * `hashTopic`: on the landing, links to #contacto-enterprise preselect the Enterprise topic.
 */
export default function ContactForm({ topic: initialTopic = 'general', name: initialName = '', email: initialEmail = '', hashTopic, onSent }: {
  topic?: ContactTopic; name?: string; email?: string; hashTopic?: boolean; onSent?: () => void;
}) {
  const [topic, setTopic] = useState<ContactTopic>(initialTopic);
  const [f, setF] = useState({ name: initialName, email: initialEmail, company: '', team_size: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (!hashTopic) return;
    const sync = () => { if (location.hash === '#contacto-enterprise') { setTopic('enterprise'); setSent(false); } };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [hashTopic]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, topic }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'No pudimos enviar tu mensaje.');
      setSent(true);
      setF((x) => ({ ...x, company: '', team_size: '', message: '' }));
      onSent?.();
    } catch (err) {
      setError((err as Error).message || 'No pudimos enviar tu mensaje. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24, border: '1px solid #b7eb8f', background: '#f6ffed', borderRadius: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>¡Gracias, {f.name.split(' ')[0] || 'recibimos tu mensaje'}!</span>
        <span style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(0,0,0,0.65)' }}>
          Recibimos tu mensaje y te respondemos a <b>{f.email}</b> en menos de 2 días hábiles.
        </span>
        <button type="button" className="bx-btn" style={{ alignSelf: 'flex-start', height: 36 }} onClick={() => setSent(false)}>Enviar otro mensaje</button>
      </div>
    );
  }

  const ent = topic === 'enterprise';
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={label}>Motivo
        <select className="bx-select" style={input} value={topic} onChange={(e) => setTopic(e.target.value as ContactTopic)}>
          {(Object.keys(CONTACT_TOPICS) as ContactTopic[]).map((k) => <option key={k} value={k}>{CONTACT_TOPICS[k]}</option>)}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 16 }}>
        <label style={label}>Nombre
          <input className="bx-input" style={input} required maxLength={120} autoComplete="name" value={f.name} onChange={set('name')} />
        </label>
        <label style={label}>Email
          <input className="bx-input" style={input} required type="email" maxLength={254} autoComplete="email" value={f.email} onChange={set('email')} />
        </label>
      </div>
      {ent && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 16 }}>
          <label style={label}>Empresa
            <input className="bx-input" style={input} maxLength={120} autoComplete="organization" value={f.company} onChange={set('company')} />
          </label>
          <label style={label}>Tamaño del equipo
            <select className="bx-select" style={input} value={f.team_size} onChange={set('team_size')}>
              <option value="">Elegí una opción</option>
              {TEAM_SIZES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        </div>
      )}
      <label style={label}>Mensaje
        <textarea className="bx-input" rows={5} required minLength={10} maxLength={5000} value={f.message} onChange={set('message')} style={{ fontSize: 15 }}
          placeholder={ent ? 'Contanos sobre tu equipo y qué necesitás de Boxinger.' : '¿En qué te podemos ayudar?'} />
      </label>
      {/* Honeypot: hidden from people, bots fill it in. */}
      <input name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} aria-hidden
        style={{ position: 'absolute', left: -10000, width: 1, height: 1, opacity: 0 }} />
      {error && <span role="alert" style={{ fontSize: 14, color: '#cf1322' }}>{error}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button type="submit" className="bx-btn-primary" disabled={busy} style={{ height: 40, padding: '0 22px', fontSize: 15, fontWeight: 500 }}>
          {busy ? 'Enviando…' : 'Enviar mensaje'}
        </button>
        <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Te respondemos por email.</span>
      </div>
    </form>
  );
}
