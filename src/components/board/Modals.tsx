'use client';
import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { Choice, Field } from '@/components/ui';
import type { Category, Idea } from '@/lib/types';
import { useI18n } from '@/lib/i18n/client';

export function IdeaForm({ open, idea, cats, isTeam, onClose, onSubmit, isMobile }: {
  open: boolean; idea: Idea | null; cats: Category[]; isTeam: boolean; isMobile: boolean;
  onClose: () => void; onSubmit: (v: { title: string; description: string; category_id: string }) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [f, setF] = useState({ title: '', description: '', category_id: '' });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setF(idea ? { title: idea.title, description: idea.description, category_id: idea.category_id } : { title: '', description: '', category_id: '' });
      setTried(false);
    }
  }, [open, idea]);

  const tl = f.title.trim().length, d = f.description.trim().length;
  const e = {
    title: tl < 5 || tl > 80 ? t('El título debe tener entre 5 y 80 caracteres') : '',
    desc: d < 20 || d > 2000 ? t('La descripción debe tener entre 20 y 2.000 caracteres') : '',
    cat: !f.category_id ? t('Elegí una categoría') : '',
  };
  async function submit() {
    setTried(true);
    if (e.title || e.desc || e.cat || busy) return;
    setBusy(true);
    const ok = await onSubmit(f);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={idea ? t('Editar idea') : t('Nueva idea')} destroyOnHidden
      width={isMobile ? '100%' : 520} style={isMobile ? { top: 'auto', bottom: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : { top: '10vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 8 }}>
        <Field label={t('Título')}>
          <input className={'bx-input' + (tried && e.title ? ' err' : '')} maxLength={80} placeholder={t('Resumí la idea en una línea')} value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} autoFocus />
          <Counter err={tried ? e.title : ''} n={f.title.length} max={80} />
        </Field>
        <Field label={t('Descripción')}>
          <textarea className={'bx-input' + (tried && e.desc ? ' err' : '')} maxLength={2000} rows={5} placeholder={t('Contá qué problema resuelve y para quién')} value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} />
          <Counter err={tried ? e.desc : ''} n={f.description.length} max={2000} />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
          {t('Categoría')}
          <Choice options={cats.map((c) => [c.id, c.name] as [string, string])} value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} />
          {tried && e.cat && <span style={{ fontSize: 13, color: '#ff4d4f' }}>{e.cat}</span>}
        </div>
        {!idea && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{isTeam ? t('Se publica al instante con estado Pendiente de revisión y tag Equipo.') : t('Se publica al instante con estado Pendiente de revisión y tag Comunidad.')}</span>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="bx-btn" onClick={onClose}>{t('Cancelar')}</button>
          <button type="button" className="bx-btn-primary" disabled={busy} onClick={submit}>{idea ? t('Guardar') : t('Publicar idea')}</button>
        </div>
      </div>
    </Modal>
  );
}

function Counter({ err, n, max }: { err: string; n: number; max: number }) {
  const { locale } = useI18n();
  const tag = locale === 'en' ? 'en-US' : 'es-AR';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 13, color: '#ff4d4f' }}>{err}</span>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>{n.toLocaleString(tag)} / {max.toLocaleString(tag)}</span>
    </div>
  );
}

export function RejectModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setReason(''); setTried(false); } }, [open]);
  const err = tried && !reason.trim() ? t('El motivo es obligatorio') : '';
  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('Rechazar idea')} width={440} destroyOnHidden>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('El motivo es obligatorio y queda visible para todos. Se notifica al autor por email.')}</span>
        <textarea className={'bx-input' + (err ? ' err' : '')} rows={3} placeholder={t('Motivo del rechazo')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        {err && <span style={{ fontSize: 13, color: '#ff4d4f' }}>{err}</span>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="bx-btn" onClick={onClose}>{t('Cancelar')}</button>
          <button type="button" className="bx-btn-primary" style={{ background: '#ff4d4f' }}
            onClick={async () => { setTried(true); if (reason.trim()) await onConfirm(reason.trim()); }}>{t('Rechazar')}</button>
        </div>
      </div>
    </Modal>
  );
}
