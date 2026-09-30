'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Steps } from 'antd';
import { rpc } from '@/lib/rpc';
import { Field } from '@/components/ui';
import { useSession, useToast } from '@/components/Providers';
import { SITE_URL } from '@/lib/env';
import { slugify } from '@/lib/format';

export function Onboarding({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useSession();
  const [step, setStep] = useState(0);
  const [team, setTeam] = useState('');
  const [board, setBoard] = useState('');
  const [desc, setDesc] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const host = SITE_URL.replace(/^https?:\/\//, '');

  async function create() {
    setTried(true);
    if (!(board.trim() || team.trim())) return;
    setBusy(true);
    try {
      const r = await rpc<{ slug: string }>('onboard', { p_team_name: team.trim(), p_board_name: board.trim() || team.trim(), p_visibility: 'invite', p_description: desc.trim() });
      await refresh();
      toast.ok('¡Listo! Tu buzón está creado. Invitá a tu Comunidad desde Configuración.');
      router.replace('/app/b/' + r.slug);
    } catch (e) {
      toast.err(e);
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, width: '100%', margin: '8px auto', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Hola{defaultName ? ', ' + defaultName.split(' ')[0] : ''}. Creá tu primer buzón</h1>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>Tu comunidad y tu equipo van a cargar, votar y comentar ideas ahí.</span>
      </div>
      <Steps size="small" current={step} items={[{ title: 'Equipo' }, { title: 'Buzón' }]} />
      {step === 0 ? (
        <>
          <Field label="Nombre del equipo o producto" error={tried && !team.trim() ? 'Ingresá el nombre del equipo' : ''} hint="Por ejemplo, el nombre de tu empresa o de tu app.">
            <input className="bx-input" autoFocus maxLength={60} value={team} placeholder="Ej: Pampa Pagos" onChange={(e) => setTeam(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && team.trim()) { setTried(false); setStep(1); } }} />
          </Field>
          <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-end' }} onClick={() => { setTried(true); if (team.trim()) { setTried(false); setStep(1); } }}>Siguiente</button>
        </>
      ) : (
        <>
          <Field label="Nombre del buzón" hint={`Link del buzón (solo para quienes invites): ${host}/app/b/${slugify(board || team) || 'mi-buzon'}`}>
            <input className="bx-input" autoFocus maxLength={60} value={board} placeholder={team} onChange={(e) => setBoard(e.target.value)} />
          </Field>
          <Field label="Descripción corta (opcional)" hint={`${desc.length} / 200`}>
            <textarea className="bx-input" rows={3} maxLength={200} value={desc} placeholder="Ideas para nuestra app. Proponé, votá y seguí qué entra al Backlog." onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Plan Free: 1 equipo con 1 buzón público. Podés pasar a Pro cuando quieras sumar miembros o más buzones.</span>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="bx-btn" onClick={() => setStep(0)}>Atrás</button>
            <button type="button" className="bx-btn-primary" disabled={busy} onClick={create}>{busy ? 'Creando…' : 'Crear buzón'}</button>
          </div>
        </>
      )}
    </div>
  );
}
