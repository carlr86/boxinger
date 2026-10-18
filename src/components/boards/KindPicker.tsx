'use client';
import { BLANK, KIND_CATEGORIES } from '@/lib/board-kinds';
import { ProPill } from '@/components/ui';
import { useI18n } from '@/lib/i18n/client';

/** «¿Cómo querés empezar?»: a blank board, or a category › type. «Próximamente» ones are shown but can't be picked. */
export function KindPicker({ value, onChange, pro, templatesOnly }: { value: string; onChange: (k: string) => void; pro: boolean; templatesOnly?: boolean }) {
  const { t } = useI18n();
  const card = (on: boolean, disabled?: boolean): React.CSSProperties => ({
    textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
    border: on ? '2px solid #059669' : '1px solid #e5e7eb', background: on ? '#ecfdf5' : disabled ? '#fafafa' : '#fff', opacity: disabled ? 0.6 : 1, font: 'inherit', color: 'inherit',
  });
  const soon = <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.45)', background: '#f0f0f0', borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>{t('Próximamente')}</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!templatesOnly && <>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{t('¿Cómo querés empezar?')}</span>
        <button type="button" style={card(value === BLANK.k)} onClick={() => onChange(BLANK.k)}>
          <b style={{ fontSize: 14, fontWeight: 600 }}>{t(BLANK.l)}</b>
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>{t(BLANK.d)}</span>
        </button>
      </>}
      {KIND_CATEGORIES.map((c) => (
        <div key={c.k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }}>
            {t(c.l)}{c.status === 'soon' && soon}
          </span>
          {c.status === 'soon' ? <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: -4 }}>{t(c.d)}</span> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8 }}>
              {c.types.map((x) => {
                const off = x.status === 'soon', locked = !off && x.pro && !pro;
                return (
                  <button key={x.k} type="button" disabled={off} style={card(value === x.k, off)} onClick={() => !off && onChange(x.k)} title={locked ? t('Disponible en los planes Pro, Team y Enterprise.') : undefined}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                      <b style={{ fontSize: 14, fontWeight: 600 }}>{t(x.l)}</b>{off ? soon : locked ? <ProPill /> : null}
                    </span>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>{t(x.d)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
