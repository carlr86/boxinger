'use client';
import { useState } from 'react';
import { rpc } from '@/lib/rpc';
import { useSession, useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';

/** Owner picks which board keeps working on Free (the rest go read-only). Hidden with a single board. */
export function FreeBoardSelect({ style, onChange }: { style?: React.CSSProperties; onChange?: () => void }) {
  const { ctx, refresh } = useSession();
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const boards = (ctx?.teams || []).filter((x) => x.own).flatMap((x) => x.boards);
  const current = ctx?.account?.free_board || boards[0]?.id || '';
  if (boards.length < 2) return null;
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14, ...style }}>
      {t('Buzón que sigue activo en Free')}
      <select className="bx-select" value={current} disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          try { await rpc('set_free_board', { p_board: e.target.value }); await refresh(); toast.ok('Listo: ese buzón sigue activo en Free'); onChange?.(); }
          catch (err) { toast.err(err); }
          finally { setBusy(false); }
        }}>
        {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
}
