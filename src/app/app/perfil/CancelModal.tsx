'use client';
import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { rpc } from '@/lib/rpc';
import { useI18n } from '@/lib/i18n/client';
import { proKeeps, proLosses, type ProUsage } from '@/lib/pro-loss';
import { FreeBoardSelect } from '@/components/FreeBoardSelect';

const REASONS: [string, string][] = [
  ['precio', 'Es caro para lo que lo uso'],
  ['poco_uso', 'No lo estoy usando lo suficiente'],
  ['falta_funcion', 'Me falta una función'],
  ['otra_herramienta', 'Me paso a otra herramienta'],
  ['temporal', 'Es por un tiempo, después vuelvo'],
  ['otro', 'Otro motivo'],
];

const X = () => (<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden style={{ flex: 'none', marginTop: 4 }}><path d="M4 4l8 8M12 4l-8 8" stroke="#cf1322" strokeWidth="1.8" strokeLinecap="round" /></svg>);
const Ok = () => (<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden style={{ flex: 'none', marginTop: 4 }}><path d="M3 8.5l3 3 7-7" fill="none" stroke="#389e0d" strokeWidth="1.8" strokeLinecap="round" /></svg>);

/** Retention step before cancelling Pro: what they lose, which board stays, and why they leave. */
export function CancelModal({ open, until, onClose, onConfirm }: {
  open: boolean; until: string | null; onClose: () => void; onConfirm: (reason: string | null, note: string) => Promise<void>;
}) {
  const { t, dlong } = useI18n();
  const [usage, setUsage] = useState<ProUsage | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => rpc<ProUsage>('my_pro_usage').then(setUsage).catch(() => {});
  useEffect(() => { if (open) { setReason(null); setNote(''); setBusy(false); load(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={520} destroyOnHidden title={t('¿Seguro que querés cancelar Pro?')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
          {until ? t('Si cancelás, el {date} tu cuenta pasa a Free y perdés:', { date: dlong(until) }) : t('Si cancelás, al terminar el mes pagado tu cuenta pasa a Free y perdés:')}
        </span>
        {!usage ? <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{t('Cargando…')}</span> : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: '12px 14px' }}>
              {proLosses(usage, t).map((x) => <span key={x} style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.5 }}><X />{x}</span>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.5 }}><Ok />{proKeeps(usage, t)}</span>
              <FreeBoardSelect style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', paddingLeft: 22 }} onChange={load} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{t('¿Por qué cancelás? (opcional)')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {REASONS.map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="radio" name="cancel-reason" checked={reason === k} onChange={() => setReason(k)} style={{ accentColor: '#059669' }} />{t(l)}
              </label>
            ))}
          </div>
          {reason && (
            <textarea className="bx-input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={reason === 'falta_funcion' ? t('¿Qué función te faltó?') : t('Contanos un poco más (opcional)')} />
          )}
        </div>
        <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>{t('Si después volvés a Pro, recuperás todo tal como estaba.')}</span>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="bx-btn" disabled={busy} style={{ color: '#cf1322', borderColor: '#ffccc7' }}
            onClick={async () => { setBusy(true); await onConfirm(reason, note); setBusy(false); }}>{busy ? t('Cancelando…') : t('Cancelar igual')}</button>
          <button type="button" className="bx-btn-primary" onClick={onClose}>{t('Quedarme en Pro')}</button>
        </div>
      </div>
    </Modal>
  );
}
