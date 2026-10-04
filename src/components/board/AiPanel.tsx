'use client';
import { useEffect, useState } from 'react';
import { Drawer, Popconfirm, Tooltip } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { Note, Seg, Tag } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { rpc } from '@/lib/rpc';
import { statusTone } from '@/lib/constants';
import { useI18n } from '@/lib/i18n/client';
import type { BoardApi } from './shared';

// Enterprise AI assistant on a board: suggest new ideas and pick the best pending ones for the Backlog.
// The model runs in /api/ai; this panel shows the product description, uses left and the last results.

type Suggestion = { title: string; description: string; category_id: string; why: string };
type Rank = { summary: string; candidates: { idea_id: number; reason: string; confidence: 'alta' | 'media' | 'baja' }[]; duplicates: { idea_ids: number[]; note: string }[] };
type Status = {
  enabled: boolean; can_edit: boolean; context: string | null;
  used: { suggest: number; rank: number }; limits: { suggest: number; rank: number };
  left?: { suggest: number; rank: number }; // smaller of the board's and the whole client's monthly uses left
  last_suggest: { at: string; result: { suggestions: Suggestion[] } } | null;
  last_rank: { at: string; result: Rank } | null;
};
type Kind = 'suggest' | 'rank';

const AI = '#4338ca';
const CONF: Record<string, { l: string; bg: string; bd: string; fg: string }> = {
  alta: { l: 'Confianza alta', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' },
  media: { l: 'Confianza media', bg: '#fff7e6', bd: '#ffd591', fg: '#d46b08' },
  baja: { l: 'Confianza baja', bg: '#fafafa', bd: '#d9d9d9', fg: 'rgba(0,0,0,0.65)' },
};

export const Sparkle = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ flex: 'none' }}>
    <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="currentColor" />
    <path d="M13 11l.6 1.4 1.4.6-1.4.6L13 15l-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" />
  </svg>
);

/** Mark on ideas that came from an AI suggestion (the author is whoever added it). */
export function AiTag() {
  const { t } = useI18n();
  return <Tag tone={{ l: '', bg: '#eef2ff', bd: '#c7d2fe', fg: AI }} title={t('Idea sugerida por el Asistente IA')}><Sparkle size={11} />{t('IA')}</Tag>;
}

export function AiButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="bx-btn" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: AI, borderColor: '#c7d2fe' }}>
      <Sparkle />{t('Asistente IA')}
    </button>
  );
}

export function AiPanel({ api, open, onClose, isMobile }: { api: BoardApi; open: boolean; onClose: () => void; isMobile: boolean }) {
  const { t, rel } = useI18n();
  const toast = useToast();
  const [st, setSt] = useState<Status | null>(null);
  const [tab, setTab] = useState<Kind>('rank');
  const [busy, setBusy] = useState<Kind | null>(null);
  const [editing, setEditing] = useState(false);
  const [ctx, setCtx] = useState('');
  const board = api.data.board.id;

  const load = () => rpc<Status>('ai_status', { p_board: board }).then((s) => { setSt(s); setCtx(s.context || ''); setEditing(s.can_edit && !s.context); }).catch((e) => toast.err(e));
  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCtx() {
    if (ctx.trim().length < 30) return toast.err(new Error(t('Contá un poco más: al menos 30 caracteres.')));
    try { await rpc('set_ai_context', { p_board: board, p_text: ctx }); toast.ok(t('Guardado')); setEditing(false); load(); }
    catch (e) { toast.err(e); }
  }

  async function run(kind: Kind) {
    setBusy(kind);
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board, kind }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Algo salió mal. Probá de nuevo.');
      await load();
    } catch (e) { toast.err(e); }
    finally { setBusy(null); }
  }

  // Discard = "this kind of idea doesn't fit" (the AI avoids similar ones); clear = empty the list.
  async function dismiss(title: string) {
    setSt((x) => x && x.last_suggest ? { ...x, last_suggest: { ...x.last_suggest, result: { suggestions: x.last_suggest.result.suggestions.filter((s) => s.title !== title) } } } : x);
    try { await rpc('ai_dismiss_suggestion', { p_board: board, p_title: title, p_discard: true }); toast.ok(t('Idea descartada: la IA va a evitar ideas parecidas')); }
    catch (e) { toast.err(e); load(); }
  }
  async function clearAll() {
    try { await rpc('ai_clear_suggestions', { p_board: board }); load(); } catch (e) { toast.err(e); }
  }
  const left = (k: Kind) => (!st ? 0 : st.left ? st.left[k] : Math.max(0, st.limits[k] - st.used[k]));
  const ready = !!st?.enabled && !!st.context && st.context.length >= 30 && !editing;

  return (
    <Drawer open={open} placement="right" onClose={onClose} closable={false} width={isMobile ? '100%' : 560}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
        <a onClick={onClose} style={{ color: 'rgba(0,0,0,0.45)', fontSize: 20, lineHeight: 1 }} aria-label={t('Cerrar')}>×</a>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: AI }}><Sparkle size={16} />{t('Asistente IA')}</span>
        <Tag tone={{ l: '', bg: '#eef2ff', bd: '#c7d2fe', fg: AI }}>Enterprise</Tag>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!st ? <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{t('Cargando…')}</span> : !st.enabled ? <Upsell api={api} /> : (
          <>
            {/* The product description everything else is based on. */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t('Sobre tu producto')}</span>
                {st.can_edit && !editing && st.context && <a style={{ fontSize: 13, color: '#059669' }} onClick={() => setEditing(true)}>{t('Editar')}</a>}
              </div>
              {editing ? (
                <>
                  <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', textWrap: 'pretty' }}>{t('Contale a la IA qué hace tu producto, para quién es y qué objetivo tienen ahora. Cuanto más concreto, mejores sugerencias.')}</span>
                  <textarea className="bx-input" rows={6} maxLength={2000} value={ctx} onChange={(e) => setCtx(e.target.value)}
                    placeholder={t('Ej.: Somos un CRM para inmobiliarias chicas de Argentina. Lo usan agentes desde el celular. Este trimestre queremos que carguen propiedades más rápido y reducir las bajas.')} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', flex: 1 }}>{ctx.length} / 2000</span>
                    {st.context && <button type="button" className="bx-btn" onClick={() => { setCtx(st.context || ''); setEditing(false); }}>{t('Cancelar')}</button>}
                    <button type="button" className="bx-btn-primary" onClick={saveCtx}>{t('Guardar')}</button>
                  </div>
                </>
              ) : st.context ? (
                <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', whiteSpace: 'pre-wrap', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px' }}>{st.context}</span>
              ) : (
                <Note>{t('El Admin del buzón todavía no describió el producto. Cuando lo haga, vas a poder usar el asistente.')}</Note>
              )}
            </section>

            <Seg options={[['rank', t('Ideas del Buzón')], ['suggest', t('Sugerir nuevas ideas')]]} value={tab} onChange={setTab} />

            {tab === 'rank' ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', textWrap: 'pretty' }}>{t('La IA lee las ideas pendientes y en revisión, con sus votos y comentarios, y te dice cuáles conviene aprobar según tu producto. La decisión es siempre del Equipo.')}</span>
                <RunBar busy={busy === 'rank'} ready={ready} left={left('rank')} at={st.last_rank?.at} rel={rel}
                  label={st.last_rank ? t('Analizar de nuevo') : t('Analizar ideas')} onRun={() => run('rank')} />
                {busy === 'rank' && <Working text={t('Leyendo las ideas… puede tardar hasta un minuto.')} />}
                {st.last_rank && busy !== 'rank' && <RankView api={api} r={st.last_rank.result} />}
              </section>
            ) : (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', textWrap: 'pretty' }}>{t('La IA propone ideas nuevas para tu producto, distintas de las que ya están en el buzón. Agregá las que te sirvan y descartá las que no: la IA aprende qué tipo de ideas no aplican.')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <RunBar busy={busy === 'suggest'} ready={ready} left={left('suggest')} at={st.last_suggest?.at} rel={rel}
                      label={st.last_suggest?.result.suggestions.length ? t('Sugerir otras') : t('Sugerir ideas')} onRun={() => run('suggest')} />
                  </div>
                  {!!st.last_suggest?.result.suggestions.length && busy !== 'suggest' && (
                    <Popconfirm title={t('¿Limpiar todas las sugerencias?')} okText={t('Limpiar')} cancelText={t('Cancelar')} onConfirm={clearAll}>
                      <Tooltip title={t('Limpiar sugerencias')}>
                        <button type="button" className="bx-icon-btn" aria-label={t('Limpiar sugerencias')}><DeleteOutlined /></button>
                      </Tooltip>
                    </Popconfirm>
                  )}
                </div>
                {busy === 'suggest' && <Working text={t('Pensando ideas para tu producto…')} />}
                {st.last_suggest && busy !== 'suggest' && st.last_suggest.result.suggestions.map((s) => (
                  <div key={s.title} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ flex: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{s.title}</span>
                      <Tag>{api.catL(s.category_id)}</Tag>
                    </div>
                    <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', lineHeight: 1.55 }}>{s.description}</span>
                    <span style={{ fontSize: 13, color: AI, background: '#eef2ff', borderRadius: 6, padding: '6px 10px', display: 'flex', gap: 6 }}><Sparkle size={12} /><span>{s.why}</span></span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button type="button" className="bx-btn" onClick={() => dismiss(s.title)}>{t('Descartar idea')}</button>
                      {api.canCreate ? (
                        <button type="button" className="bx-btn-primary" onClick={() => api.openNewWith({ title: s.title, description: s.description, category_id: s.category_id, ai: true, suggestion: s.title }, () => { load(); })}>
                          {t('Agregar al buzón')}
                        </button>
                      ) : <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', alignSelf: 'center' }}>{t('No tenés permiso para cargar ideas en este buzón.')}</span>}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function RunBar({ busy, ready, left, at, label, onRun, rel }: { busy: boolean; ready: boolean; left: number; at?: string; label: string; onRun: () => void; rel: (d: string) => string }) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {/* Disabled keeps the standard grey button; the AI violet only when it can run. */}
      <button type="button" className="bx-btn-primary" disabled={busy || !ready || left === 0} onClick={onRun}
        style={{ ...(busy || !ready || left === 0 ? {} : { background: AI, borderColor: AI }), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Sparkle />{busy ? t('Trabajando…') : label}
      </button>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
        {left === 1 ? t('Te queda 1 uso este mes') : t('Te quedan {n} usos este mes', { n: left })}
        {at ? ' · ' + t('Último: {when}', { when: rel(at) }) : ''}
      </span>
    </div>
  );
}

function Working({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: AI, background: '#eef2ff', borderRadius: 8, padding: '12px 14px' }}>
      <span className="bx-spin" style={{ width: 14, height: 14, border: '2px solid #c7d2fe', borderTopColor: AI, borderRadius: '50%', display: 'inline-block', animation: 'bx-spin 0.8s linear infinite' }} />
      {text}
      <style>{'@keyframes bx-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

function RankView({ api, r }: { api: BoardApi; r: Rank }) {
  const { t } = useI18n();
  const byId = new Map(api.data.ideas.map((i) => [i.id, i]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {r.summary && <span style={{ fontSize: 14, lineHeight: 1.55 }}>{r.summary}</span>}
      {!r.candidates.length && <Note>{t('La IA no encontró ideas que convenga aprobar por ahora.')}</Note>}
      {r.candidates.map((c, k) => {
        const i = byId.get(c.idea_id);
        if (!i) return null;
        const open = i.status === 'pendiente' || i.status === 'en_revision';
        return (
          <div key={c.idea_id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#eef2ff', color: AI, fontSize: 13, fontWeight: 600, display: 'grid', placeItems: 'center', flex: 'none' }}>{k + 1}</span>
              <a onClick={() => api.openIdea(i.id)} style={{ flex: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: 'rgba(0,0,0,0.88)' }}>{i.title}</a>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Tag tone={CONF[c.confidence]}>{t(CONF[c.confidence].l)}</Tag>
              <Tag>{api.catL(i.category_id)}</Tag>
              <Tag>{t('{n} votos', { n: i.votes })}</Tag>
              {!open && <Tag tone={statusTone(i)}>{t(statusTone(i).l)}</Tag>}
            </div>
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', lineHeight: 1.55 }}>{c.reason}</span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="bx-btn" onClick={() => api.openIdea(i.id)}>{t('Ver idea')}</button>
              {open && api.isTeam && api.canWrite && <button type="button" className="bx-btn-primary" onClick={() => api.setStatus(i.id, 'aprobada')}>{t('Aprobar')}</button>}
            </div>
          </div>
        );
      })}
      {r.duplicates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Ideas que parecen repetidas')}</span>
          {r.duplicates.map((d, k) => (
            <div key={k} style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>{d.note}</span>
              <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {d.idea_ids.map((id) => byId.get(id) && <a key={id} style={{ color: '#059669' }} onClick={() => api.openIdea(id)}>{byId.get(id)!.title}</a>)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Upsell({ api }: { api: BoardApi }) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 18, fontWeight: 600 }}>{t('Decidí qué construir con ayuda de la IA')}</span>
      {[t('Contale a la IA de qué se trata tu producto y te propone ideas nuevas, distintas de las que ya tenés.'),
        t('Analiza las ideas pendientes con sus votos y comentarios y te dice cuáles conviene aprobar, y por qué.'),
        t('Detecta ideas repetidas que conviene unir.')].map((x) => (
        <span key={x} style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.55, color: 'rgba(0,0,0,0.75)' }}><span style={{ color: AI, marginTop: 2 }}><Sparkle /></span>{x}</span>
      ))}
      <Note>{t('El asistente de IA está incluido en el plan Enterprise.')}</Note>
      <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start', background: AI, borderColor: AI }} onClick={api.goPro}>{t('Conocé Enterprise')}</button>
    </div>
  );
}
