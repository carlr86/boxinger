'use client';
import { useEffect, useState } from 'react';
import { ProPill, Tag } from '@/components/ui';
import { useI18n } from '@/lib/i18n/client';
import { rpc } from '@/lib/rpc';
import type { Idea } from '@/lib/types';
import { customerOnCards, usesMrr, usesSegments, type BoardApi } from './shared';

// MRR and customer segments (optional modules of Producto digital and blank boards, paid plans, team only).
// The detail of an idea edits them; the Admin can also show them on the cards of the Buzón, the Roadmap and the Matrix.
// Backend: supabase/migrations/…064_customer_data.sql.

export const MRR_CURRENCIES = ['USD', 'ARS', 'EUR', 'BRL', 'MXN', 'CLP', 'COP', 'UYU', 'PEN', 'GBP'] as const;
export const SEG_TONE = { l: '', bg: '#f0fdfa', bd: '#99f6e4', fg: '#0f766e' };

/** "USD 2.500" / "USD 800,50" (Spanish), "USD 2,500" (English). */
export function fmtMrr(v: number, currency: string, locale: string) {
  return `${currency} ${Number(v).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** The idea's segments, in the board's order (deleted ones drop out). */
function segmentsOf(api: BoardApi, i: Idea) {
  const mine = new Set(i.segments || []);
  return (api.data.board.segments || []).filter((s) => mine.has(s.id));
}

function MrrValue({ api, i }: { api: BoardApi; i: Idea }) {
  const { t, locale } = useI18n();
  return i.mrr != null
    ? <span style={{ color: 'rgba(0,0,0,0.88)', whiteSpace: 'nowrap' }}>{fmtMrr(i.mrr, api.data.board.mrr_currency || 'USD', locale)}</span>
    : <span style={{ color: 'rgba(0,0,0,0.3)' }}>{t('Sin MRR')}</span>;
}

function SegmentChips({ api, i }: { api: BoardApi; i: Idea }) {
  const { t } = useI18n();
  const segs = segmentsOf(api, i);
  return segs.length
    ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{segs.map((s) => <Tag key={s.id} tone={SEG_TONE} style={{ borderRadius: 10 }}>{s.name}</Tag>)}</span>
    : <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.3)' }}>{t('Sin segmento')}</span>;
}

/** Buzón / Backlog cards: one line, always there when it's on, so the cards stay even. */
export function CustomerCardLine({ api, i }: { api: BoardApi; i: Idea }) {
  const { t } = useI18n();
  if (!customerOnCards(api)) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minHeight: 24, fontSize: 12, color: 'rgba(0,0,0,0.45)' }} title={t('MRR y segmentos · solo visible para el Equipo')}>
      {usesMrr(api) && <span style={{ display: 'flex', gap: 6 }}><span>MRR</span><MrrValue api={api} i={i} /></span>}
      {usesSegments(api) && <SegmentChips api={api} i={i} />}
    </div>
  );
}

/** Roadmap and Matrix cards: label / value rows inside their two-column grid. */
export function CustomerGridRows({ api, i }: { api: BoardApi; i: Idea }) {
  const { t } = useI18n();
  if (!customerOnCards(api)) return null;
  return (
    <>
      {usesMrr(api) && <><span>MRR</span><MrrValue api={api} i={i} /></>}
      {usesSegments(api) && <><span style={{ alignSelf: 'start', lineHeight: '20px' }}>{t('Segmentos')}</span><SegmentChips api={api} i={i} /></>}
    </>
  );
}

/** Detail of an idea: «Clientes», with the MRR and the segments. */
export function CustomerSection({ api, i, act }: { api: BoardApi; i: Idea; act: (p: Promise<unknown>, ok?: string) => Promise<unknown> }) {
  const { t, locale } = useI18n();
  const mrr = usesMrr(api), segs = usesSegments(api);
  const cur = api.data.board.mrr_currency || 'USD';
  const [val, setVal] = useState(i.mrr == null ? '' : String(i.mrr));
  useEffect(() => { setVal(i.mrr == null ? '' : String(i.mrr)); }, [i.mrr]);
  if (!api.isTeam || (!mrr && !segs)) return null;

  async function saveMrr() {
    const v = val.trim() === '' ? null : Number(val);
    if (v != null && (!Number.isFinite(v) || v < 0)) { setVal(i.mrr == null ? '' : String(i.mrr)); return; }
    if (v === (i.mrr == null ? null : Number(i.mrr))) return;
    await act(rpc('update_idea_plan', { p_id: i.id, p_patch: { mrr: v } }), v == null ? 'MRR quitado' : 'MRR guardado');
  }
  const mine = i.segments || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>{t('Clientes')} <ProPill /></span>
        {api.pro && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Solo visible para el Equipo.')}</span>}
      </div>
      {!api.pro ? (
        <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>{t('Anotá el MRR y los segmentos de los clientes que piden cada idea. Disponible en el plan Pro.')}</span>
          <button type="button" className="bx-btn-primary" onClick={api.goPro}>{t('Ver plan Pro')}</button>
        </div>
      ) : (
        <>
          {mrr && (
            <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', alignItems: 'center', gap: 12, fontSize: 14 }}>
              <span style={{ color: 'rgba(0,0,0,0.65)' }}>MRR</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'stretch', maxWidth: 220 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 10px', fontSize: 13, color: 'rgba(0,0,0,0.55)', background: '#fafafa', border: '1px solid #d9d9d9', borderRight: 0, borderRadius: '6px 0 0 6px' }}>{cur}</span>
                  <input className="bx-input" type="number" inputMode="decimal" min={0} step="0.01" value={val} disabled={!api.canWrite} placeholder={t('Sin MRR')}
                    aria-label={t('MRR en {currency}', { currency: cur })}
                    onChange={(e) => setVal(e.target.value)} onBlur={saveMrr} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ borderRadius: '0 6px 6px 0', minWidth: 0 }} />
                </div>
                {i.mrr != null && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('{mrr} / mes', { mrr: fmtMrr(i.mrr, cur, locale) })}</span>}
              </div>
            </div>
          )}
          {segs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>{t('¿Qué clientes la piden? Podés marcar varios.')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(api.data.board.segments || []).map((s) => {
                  const on = mine.includes(s.id);
                  return (
                    <button key={s.id} type="button" disabled={!api.canWrite} aria-pressed={on}
                      onClick={() => act(rpc('update_idea_plan', { p_id: i.id, p_patch: { segments: on ? mine.filter((x) => x !== s.id) : mine.concat(s.id) } }))}
                      style={{ height: 30, padding: '0 12px', borderRadius: 15, fontSize: 13, cursor: api.canWrite ? 'pointer' : 'not-allowed', border: '1px solid ' + (on ? SEG_TONE.bd : '#d9d9d9'), background: on ? SEG_TONE.bg : '#fff', color: on ? SEG_TONE.fg : 'rgba(0,0,0,0.65)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {on && <span aria-hidden>✓</span>}{s.name}
                    </button>
                  );
                })}
                {!(api.data.board.segments || []).length && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('El buzón no tiene segmentos. Agregalos en la configuración del buzón.')}</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
