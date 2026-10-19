'use client';
import { kindLabel } from '@/lib/board-kinds';
import { useI18n } from '@/lib/i18n/client';

// The board's template type as a small chip (Mis Buzones and next to the board's title). Blank boards show none.
const TONE: Record<string, { bg: string; bd: string; fg: string; icon: string }> = {
  producto: { bg: '#ecfdf5', bd: '#a9cbc2', fg: '#047857', icon: '◆' },
  brainstorm: { bg: '#fff7e6', bd: '#ffd591', fg: '#ad4e00', icon: '✦' },
};

export function KindChip({ kind, style }: { kind?: string | null; style?: React.CSSProperties }) {
  const { t } = useI18n();
  const k = kind || 'producto';
  const tone = TONE[k];
  if (!tone) return null;
  return (
    <span title={t('Tipo de buzón')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, lineHeight: '20px', padding: '0 8px', borderRadius: 999, whiteSpace: 'nowrap',
      background: tone.bg, border: '1px solid ' + tone.bd, color: tone.fg, fontWeight: 500, ...style }}>
      <span aria-hidden style={{ fontSize: 10 }}>{tone.icon}</span>{t(kindLabel(k))}
    </span>
  );
}
