'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Steps } from 'antd';
import { rpc } from '@/lib/rpc';
import { Choice, ToggleRow } from '@/components/ui';
import { useSession, useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import { VISIBILITY, VISIBILITY_ORDER } from '@/lib/constants';
import type { TeamCtx, Visibility } from '@/lib/types';
import { KindPicker } from './KindPicker';

// «Crear buzón» in three steps: 1) blank or a template (and which type), 2) name and description, 3) access.
export function CreateBoardModal({ open, teamId, ownTeams, onClose }: { open: boolean; teamId: string; ownTeams: TeamCtx[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useI18n();
  const { refresh } = useSession();
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<'blank' | 'template'>('template');
  const [kind, setKind] = useState('producto');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [team, setTeam] = useState(teamId);
  const [vis, setVis] = useState<Visibility>('invite');
  const [membersIdeas, setMembersIdeas] = useState(true);
  const [guestsIdeas, setGuestsIdeas] = useState(true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0); setStart('template'); setKind('producto'); setName(''); setDesc(''); setTeam(teamId);
    setVis('invite'); setMembersIdeas(true); setGuestsIdeas(true); setTried(false); setBusy(false);
  }, [open, teamId]);

  const teamPro = !!ownTeams.find((x) => x.id === team)?.pro;
  const finalKind = start === 'blank' ? 'blank' : kind;
  const next = () => {
    if (step === 1) { setTried(true); if (!name.trim()) return; }
    setTried(false); setStep(step + 1);
  };
  async function create() {
    setBusy(true);
    try {
      const r = await rpc<{ id: string; slug: string }>('create_board', { p_team: team, p_name: name.trim(), p_visibility: vis, p_members_ideas: membersIdeas, p_guests_ideas: guestsIdeas, p_kind: finalKind });
      if (desc.trim()) await rpc('update_board', { p_board: r.id, p_description: desc.trim() }).catch(() => {});
      toast.ok('Buzón creado');
      await refresh();
      onClose();
      router.push('/app/b/' + r.slug + '/config');
    } catch (e) { toast.err(e); setBusy(false); }
  }

  const option = (k: 'blank' | 'template', title: string, d: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setStart(k)} style={{
      flex: 1, minWidth: 200, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 10, cursor: 'pointer', font: 'inherit', color: 'inherit',
      border: start === k ? '2px solid #059669' : '1px solid #e5e7eb', background: start === k ? '#ecfdf5' : '#fff',
    }}>
      <span style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', background: start === k ? '#d1fae5' : '#f5f5f5', color: '#047857' }}>{icon}</span>
      <b style={{ fontSize: 15, fontWeight: 600 }}>{title}</b>
      <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', lineHeight: 1.45 }}>{d}</span>
    </button>
  );

  return (
    <Modal open={open} onCancel={onClose} title={t('Crear buzón')} width={step === 0 && start === 'template' ? 620 : 520} destroyOnHidden footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 4 }}>
        <Steps size="small" current={step} items={[{ title: t('Tipo') }, { title: t('Nombre') }, { title: t('Accesos') }]} />

        {step === 0 && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {option('blank', t('Buzón en blanco'), t('Armalo a tu medida: elegí los módulos en la configuración.'),
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>)}
              {option('template', t('Usar una plantilla'), t('Elegí un tipo de buzón que ya viene armado para tu caso.'),
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /></svg>)}
            </div>
            {start === 'template' && <KindPicker value={kind} onChange={setKind} pro={teamPro} templatesOnly />}
          </>
        )}

        {step === 1 && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('Nombre del buzón')}
              <input className={'bx-input' + (tried && !name.trim() ? ' err' : '')} autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') next(); }} />
              {tried && !name.trim() && <span style={{ fontSize: 13, color: '#ff4d4f' }}>{t('El nombre es obligatorio')}</span>}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('Descripción (opcional)')}
              <textarea className="bx-input" rows={3} maxLength={200} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('Para qué es este buzón y qué tipo de ideas esperás.')} />
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{desc.length} / 200</span>
            </label>
            {ownTeams.length > 1 && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('Equipo')}
                <select className="bx-select" value={team} onChange={(e) => setTeam(e.target.value)}>{ownTeams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              </label>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('¿Quién puede verlo?')}</span>
              <Choice options={VISIBILITY_ORDER.map((k) => [k, t(VISIBILITY[k].l)] as [Visibility, string])} value={vis} onChange={(v) => (v === 'private' && !teamPro ? toast.info('Los buzones privados están disponibles en Pro.') : setVis(v))} />
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', textWrap: 'pretty' }}>{t(VISIBILITY[vis].d)} {t('Todos los miembros del equipo tienen acceso.')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Quiénes pueden crear ideas')}</span>
                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('El dueño del equipo y vos siempre pueden. Todos pueden votar y comentar.')}</span>
              </div>
              {teamPro && <ToggleRow label={t('Miembros del equipo')} on={membersIdeas} onChange={setMembersIdeas} />}
              {vis !== 'private' ? <ToggleRow label={t('Invitados')} desc={vis === 'invite' ? t('Las personas que invites a este buzón.') : t('La Comunidad que se suma con el link o por invitación.')} on={guestsIdeas} onChange={setGuestsIdeas} />
                : <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Los buzones privados no admiten invitados.')}</span>}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
          {step === 0 ? <button type="button" className="bx-btn" onClick={onClose}>{t('Cancelar')}</button> : <button type="button" className="bx-btn" onClick={() => setStep(step - 1)}>{t('Atrás')}</button>}
          {step < 2
            ? <button type="button" className="bx-btn-primary" onClick={next}>{t('Siguiente')}</button>
            : <button type="button" className="bx-btn-primary" disabled={busy} onClick={create}>{busy ? t('Creando…') : t('Crear buzón')}</button>}
        </div>
      </div>
    </Modal>
  );
}
