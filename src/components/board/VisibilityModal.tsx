'use client';
import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { rpc } from '@/lib/rpc';
import { Note, ProPill } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import { VISIBILITY, VISIBILITY_ORDER } from '@/lib/constants';
import type { Visibility as Vis } from '@/lib/types';

/** Changes a board between invite-only, public and private, explaining what happens to its Community. */
export function VisibilityModal({ board, pro, onClose, onDone, onGoPro }: {
  board: { id: string; name: string; visibility: Vis; guests: number } | null;
  pro: boolean;
  onClose: () => void;
  onDone: () => void;
  onGoPro: () => void;
}) {
  const toast = useToast();
  const { t, plural } = useI18n();
  const [value, setValue] = useState<Vis>('invite');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (board) setValue(board.visibility); }, [board]);
  if (!board) return <Modal open={false} />;

  const changed = value !== board.visibility;
  const needsPro = value === 'private' && !pro;

  async function save() {
    if (!changed || needsPro) return;
    setBusy(true);
    try {
      const r = await rpc<{ guests: number; revoked: number }>('set_board_visibility', { p_board: board!.id, p_visibility: value });
      toast.ok(t('Visibilidad: {v}', { v: t(VISIBILITY[value].l) }));
      if (value === 'private' && r.revoked) toast.info(plural(r.revoked, 'invitación pendiente cancelada', 'invitaciones pendientes canceladas'));
      onDone();
      onClose();
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }

  return (
    <Modal open onCancel={onClose} footer={null} title={t('Visibilidad del buzón')} width={480} destroyOnHidden>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Elegí quién puede ver {board}. La URL no cambia.', { board: board.name })}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {VISIBILITY_ORDER.map((k) => {
            const { l, d } = VISIBILITY[k];
            const on = value === k;
            return (
              <div key={k} onClick={() => setValue(k)}
                style={{ border: on ? '2px solid #059669' : '1px solid #d9d9d9', background: on ? '#d1fae5' : '#fff', borderRadius: 8, padding: on ? '11px 13px' : '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  {t(l)}{k === 'private' && <ProPill />}{k === board.visibility && <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(0,0,0,0.45)' }}>· {t('actual')}</span>}
                </span>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>{t(d)}</span>
              </div>
            );
          })}
        </div>
        {needsPro && <Note>{t('Los buzones privados están disponibles en Pro.')} <a onClick={onGoPro}>{t('Ver planes')}</a></Note>}
        {changed && !needsPro && value === 'private' && (
          <Note tone="warn">
            {board.guests > 0
              ? t('{people} de ver el buzón y sus ideas. No se borra nada: si lo volvés a abrir a invitados, recuperan el acceso.', { people: plural(board.guests, 'persona de la Comunidad deja', 'personas de la Comunidad dejan') })
              : t('Solo el Equipo va a poder verlo.')}{' '}
            {t('Las invitaciones pendientes a la Comunidad se cancelan.')}
          </Note>
        )}
        {changed && value === 'invite' && (
          <Note>
            {board.visibility === 'public'
              ? t('Quien no esté invitado deja de ver el buzón, aunque tenga el link. Las personas que ya participaron siguen como invitadas.')
              : board.guests > 0 ? t('Vas a poder invitar personas por email y {guests} a tener acceso.', { guests: plural(board.guests, 'invitado vuelve', 'invitados vuelven') }) : t('Vas a poder invitar personas por email.')}
          </Note>
        )}
        {changed && value === 'public' && (
          <Note tone="warn">{board.guests > 0 && board.visibility === 'private' ? t('Cualquiera con el link va a poder ver las ideas, aunque no esté invitado, y {guests} a tener acceso.', { guests: plural(board.guests, 'invitado vuelve', 'invitados vuelven') }) : t('Cualquiera con el link va a poder ver las ideas, aunque no esté invitado.')}</Note>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="bx-btn" onClick={onClose}>{t('Cancelar')}</button>
          <button type="button" className="bx-btn-primary" disabled={!changed || needsPro || busy} onClick={save}>{t('Guardar')}</button>
        </div>
      </div>
    </Modal>
  );
}
