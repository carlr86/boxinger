'use client';
import { useEffect, useState } from 'react';
import { Dropdown } from 'antd';
import { rpc, flushEmails } from '@/lib/rpc';
import { Dots, Help, PageHead, ProLock, Seg, Tag } from '@/components/ui';
import { DEV, LAUNCH_COL, LAUNCH_RECENT_DAYS, NO_PRIO, PRIO, RM_COLS, SHADOW_POP } from '@/lib/constants';
import { useI18n } from '@/lib/i18n/client';
import { useToast } from '@/components/Providers';
import type { Idea } from '@/lib/types';
import { rateOf, scoreOf, type BoardApi } from './shared';
import { AuthorLine } from './IdeaGrid';

const Pencil = () => (<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>);
const More = () => (<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="3.5" cy="8" r="1.3" fill="currentColor" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="12.5" cy="8" r="1.3" fill="currentColor" /></svg>);
const Yes = () => (<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
const No = () => (<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);

type Density = 'expanded' | 'compact';
const DENSITY_KEY = 'bx-roadmap-density';

/** Expanded (default) or compact cards; remembered per browser. */
function useDensity(): [Density, (d: Density) => void] {
  const [d, setD] = useState<Density>('expanded');
  useEffect(() => { try { if (localStorage.getItem(DENSITY_KEY) === 'compact') setD('compact'); } catch {} }, []);
  const set = (v: Density) => { setD(v); try { localStorage.setItem(DENSITY_KEY, v); } catch {} };
  return [d, set];
}

function ValueHelp() {
  const { t } = useI18n();
  return (
    <>
      <b>{t('Valor = Impacto × Puntaje de votos ÷ Esfuerzo')}</b>. {t('Si la idea no tiene votos que sumen, el puntaje cuenta como 1.')}{' '}
      {t('Cuanto más alto, más valor por el esfuerzo. Ejemplo: impacto 4, esfuerzo 2 y 8 puntos de votos = 16. Necesita impacto y esfuerzo calificados.')}
    </>
  );
}

export function Roadmap({ api }: { api: BoardApi }) {
  const { t, ddmmyyyy, plural } = useI18n();
  const toast = useToast();
  const [density, setDensity] = useDensity();
  const compact = density === 'compact';
  const densityToggle = <Seg options={[['expanded', t('Expandidas')], ['compact', t('Compactas')]]} value={density} onChange={(v) => setDensity(v as Density)} style={{ alignSelf: 'auto' }} />;
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<{ col: string; before: number | null } | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editCol, setEditCol] = useState<string | null>(null);
  const [nameVal, setNameVal] = useState('');
  const names = api.data.board.roadmap_names || {};
  const colL = (k: string) => names[k] || t(RM_COLS.find((c) => c.k === k)!.l);

  const ideas = api.data.ideas;
  const inRm = ideas.filter((i) => i.status === 'aprobada' && i.rm_col && i.dev_status !== 'lanzada');
  const [allLaunched, setAllLaunched] = useState(false);
  const launched = ideas.filter((i) => i.status === 'aprobada' && i.launched_at && !i.hidden)
    .sort((a, b) => +new Date(b.launched_at!) - +new Date(a.launched_at!));
  const recentFrom = Date.now() - LAUNCH_RECENT_DAYS * 864e5;
  const launchedShown = allLaunched ? launched : launched.filter((i) => +new Date(i.launched_at!) >= recentFrom);
  const launchedMore = launched.length - launchedShown.length;
  // Last column: shipped ideas (recent ones by default). Reached with "Marcar como lanzada", not by dragging.
  const launchCol = (card: (i: Idea) => React.ReactNode) => (
    <div style={{ flex: '1 0 260px', maxWidth: 360, minHeight: compact ? 200 : 320, background: LAUNCH_COL.bg, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 4px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, lineHeight: '22px', padding: '0 8px', borderRadius: 4, border: '1px solid ' + LAUNCH_COL.cbd, background: LAUNCH_COL.cbg, color: LAUNCH_COL.cfg, fontWeight: 500 }}>{t(LAUNCH_COL.l)}</span>
          <Help label="Qué muestra">{allLaunched ? t('Las ideas que el equipo ya lanzó. Llegan acá al marcarlas como lanzadas.') : t('Las ideas que el equipo ya lanzó, de los últimos {n} días. Llegan acá al marcarlas como lanzadas.', { n: LAUNCH_RECENT_DAYS })}</Help>
        </span>
        <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{launchedShown.length}</span>
      </div>
      {launchedShown.map(card)}
      {launchedShown.length === 0 && <div style={{ border: '1px dashed rgba(0,0,0,0.12)', borderRadius: 8, padding: '20px 12px', textAlign: 'center', fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{launched.length ? t('Nada lanzado en los últimos {n} días.', { n: LAUNCH_RECENT_DAYS }) : t('Todavía no hay ideas lanzadas.')}</div>}
      {(launchedMore > 0 || allLaunched) && launched.length > 0 && (
        <a onClick={() => setAllLaunched(!allLaunched)} style={{ fontSize: 13, color: LAUNCH_COL.cfg, padding: '2px 4px', alignSelf: 'flex-start' }}>
          {allLaunched ? t('Ver solo los últimos {n} días', { n: LAUNCH_RECENT_DAYS }) : t('Ver todas ({n})', { n: launched.length })}
        </a>
      )}
    </div>
  );
  const launchDate = (i: Idea) => <span style={{ fontSize: 12, color: LAUNCH_COL.cfg }}>{t('Lanzada el {date}', { date: ddmmyyyy(i.launched_at!) })}</span>;

  const backlog = ideas.filter((i) => i.status === 'aprobada' && !i.rm_col && !i.hidden && !i.launched_at).sort((a, b) => +new Date(b.approved_at || 0) - +new Date(a.approved_at || 0));

  async function move(id: number, col: string | null, before: number | null, ok?: string) {
    // optimistic: update the column locally, then reload
    api.patchIdea(id, { rm_col: col, rm_order: before == null ? 9999 : (ideas.find((x) => x.id === before)?.rm_order ?? 0) - 0.5 });
    setDrag(null); setOver(null);
    const told = await api.run(rpc<number>('move_roadmap', { p_id: id, p_col: col, p_before: before }));
    if (told !== undefined) {
      if (told) { toast.ok(t('{ok} · Le avisamos a {who} que la propusieron o votaron', { ok: ok || t('Pasó al Roadmap'), who: plural(told, 'persona', 'personas') })); flushEmails(); }
      else if (ok) toast.ok(ok);
    }
    api.reload();
  }
  async function saveName() {
    if (!editCol) return;
    const k = editCol;
    setEditCol(null);
    await api.run(rpc('rename_roadmap_column', { p_board: api.data.board.id, p_col: k, p_name: nameVal }));
    api.reload();
  }

  if (!api.isTeam) {
    return (
      <>
        <PageHead title={t('Roadmap')} sub={t('Las ideas aprobadas que el equipo planea desarrollar, y en qué etapa está cada una.')} right={densityToggle} />
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, alignItems: 'stretch' }}>
          {RM_COLS.map((c) => {
            const cards = inRm.filter((i) => i.rm_col === c.k).sort((a, b) => (a.rm_order ?? 0) - (b.rm_order ?? 0));
            return (
              <div key={c.k} style={{ flex: '1 0 260px', maxWidth: 360, minHeight: 320, background: c.bg, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 4px' }}>
                  <span style={{ fontSize: 13, lineHeight: '22px', padding: '0 8px', borderRadius: 4, border: '1px solid ' + c.cbd, background: c.cbg, color: c.cfg, fontWeight: 500 }}>{colL(c.k)}</span>
                  <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{cards.length}</span>
                </div>
                {cards.map((i) => {
                  const D = DEV[i.dev_status || 'por_empezar'];
                  return (
                    <div key={i.id} className="bx-rm-card" onClick={() => api.openIdea(i.id)}
                      style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: compact ? '10px 12px' : '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', cursor: 'pointer' }}>
                      <span style={{ fontSize: compact ? 14 : 15, fontWeight: 600, lineHeight: 1.35 }}>{i.title}</span>
                      {!compact && <AuthorLine i={i} />}
                      {!compact && <span style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(0,0,0,0.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.description}</span>}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Tag>{api.catL(i.category_id)}</Tag><Tag tone={D}>{t(D.l)}</Tag></div>
                    </div>
                  );
                })}
                {cards.length === 0 && <div style={{ border: '1px dashed rgba(0,0,0,0.12)', borderRadius: 8, padding: '20px 12px', textAlign: 'center', fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Sin ideas por ahora.')}</div>}
              </div>
            );
          })}
          {launchCol((i) => (
            <div key={i.id} className="bx-rm-card" onClick={() => api.openIdea(i.id)}
              style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: compact ? '10px 12px' : '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', cursor: 'pointer' }}>
              <span style={{ fontSize: compact ? 14 : 15, fontWeight: 600, lineHeight: 1.35 }}>{i.title}</span>
              {!compact && <AuthorLine i={i} />}
              {!compact && <span style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(0,0,0,0.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.description}</span>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><Tag>{api.catL(i.category_id)}</Tag>{launchDate(i)}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (!api.pro) {
    return (
      <>
        <PageHead title={t('Roadmap')} sub={t('Sumá ideas desde el Backlog y ordenalas por prioridad. Arrastrá las tarjetas para moverlas o reordenarlas.')} />
        <ProLock title={t('Planificá con el Roadmap')} text={t('Pasá ideas aprobadas del Backlog al Roadmap y organizalas en Ahora, Siguiente y Más adelante. Lo que ya salió queda en Lanzadas.')} onGo={api.goPro} />
      </>
    );
  }

  const pickList = backlog.filter((i) => !q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHead title={t('Roadmap')} sub={t('Sumá ideas desde el Backlog y ordenalas por prioridad. Arrastrá las tarjetas para moverlas o reordenarlas.')}
        right={<div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}><span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{plural(backlog.length, 'idea en el Backlog', 'ideas en el Backlog')}</span>{densityToggle}</div>} />
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, alignItems: 'stretch' }}>
        {RM_COLS.map((c) => {
          const cards = inRm.filter((i) => i.rm_col === c.k).sort((a, b) => (a.rm_order ?? 0) - (b.rm_order ?? 0));
          return (
            <div key={c.k}
              onDragOver={(e) => { e.preventDefault(); if (over?.col !== c.k || over.before) setOver({ col: c.k, before: null }); }}
              onDrop={(e) => { e.preventDefault(); if (drag) move(drag, c.k, over?.col === c.k ? over.before : null); }}
              style={{ flex: '1 0 280px', maxWidth: 360, minHeight: 480, background: c.bg, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: drag && over?.col === c.k ? 'inset 0 0 0 2px ' + c.cbd : 'none', transition: 'box-shadow .15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 4px' }}>
                {editCol === c.k ? (
                  <input autoFocus value={nameVal} maxLength={24} placeholder={t('Nombre de la columna')} onChange={(e) => setNameVal(e.target.value)} onBlur={saveName}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditCol(null); }}
                    style={{ flex: 1, minWidth: 0, marginRight: 8, height: 26, padding: '0 8px', border: '1px solid #059669', borderRadius: 4, fontSize: 13, outline: 'none', boxShadow: '0 0 0 2px rgba(5,150,105,0.1)' }} />
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13, lineHeight: '22px', padding: '0 8px', borderRadius: 4, border: '1px solid ' + c.cbd, background: c.cbg, color: c.cfg, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{colL(c.k)}</span>
                    {api.canWrite && <a onClick={() => { setEditCol(c.k); setNameVal(colL(c.k)); }} title={t('Cambiar nombre de la columna')} style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 4, color: 'rgba(0,0,0,0.45)' }}><Pencil /></a>}
                  </span>
                )}
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{cards.length}</span>
              </div>
              {cards.map((i, idx) => (
                <RmCard key={i.id} api={api} i={i} compact={compact} dragging={drag === i.id} overMe={!!drag && over?.before === i.id && drag !== i.id}
                  onDragStart={() => setDrag(i.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                  onOver={() => { if (over?.before !== i.id) setOver({ col: c.k, before: i.id }); }}
                  onDrop={() => { if (drag && drag !== i.id) move(drag, c.k, i.id); else { setDrag(null); setOver(null); } }}
                  menu={[
                    { key: 'open', label: t('Ver detalle'), onClick: () => api.openIdea(i.id) },
                    ...(idx > 0 ? [{ key: 'up', label: t('Subir'), onClick: () => move(i.id, c.k, cards[idx - 1].id) }] : []),
                    ...(idx < cards.length - 1 ? [{ key: 'down', label: t('Bajar'), onClick: () => move(i.id, c.k, cards[idx + 2]?.id ?? null) }] : []),
                    { type: 'group' as const, key: 'to', label: t('Mover a'), children: RM_COLS.filter((x) => x.k !== c.k).map((x) => ({ key: 'm' + x.k, label: colL(x.k), onClick: () => move(i.id, x.k, null, t('Movida a {col}', { col: colL(x.k) })) })) },
                    { type: 'divider' as const },
                    { key: 'launch', label: t('Marcar como lanzada'), onClick: async () => { await api.run(rpc('update_idea_plan', { p_id: i.id, p_patch: { dev_status: 'lanzada' } }), 'Idea lanzada · pasó a la columna Lanzadas'); flushEmails(); api.reload(); } },
                    { type: 'divider' as const },
                    { key: 'back', label: t('Volver al Backlog'), onClick: () => move(i.id, null, null, 'Volvió al Backlog') },
                  ]} />
              ))}
              {cards.length === 0 && <div style={{ border: '1px dashed rgba(0,0,0,0.12)', borderRadius: 8, padding: '20px 12px', textAlign: 'center', fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Arrastrá una tarjeta o añadí una idea del Backlog.')}</div>}
              <div style={{ flex: 1 }} />
              {api.canWrite && (pick === c.k ? (
                <>
                  <div style={{ background: '#fff', borderRadius: 8, boxShadow: SHADOW_POP, padding: 4, display: 'flex', flexDirection: 'column', maxHeight: 260, overflowY: 'auto' }}>
                    {pickList.map((i) => (
                      <div key={i.id} className="bx-item" style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '8px 10px' }}
                        onClick={() => { setPick(null); setQ(''); move(i.id, c.k, null, t('"{title}" pasó al Roadmap', { title: i.title })); }}>
                        <span style={{ flex: 'none', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>ID-{i.id}</span>
                        <span style={{ minWidth: 0 }}>{i.title}</span>
                      </div>
                    ))}
                    {pickList.length === 0 && <span style={{ padding: 10, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{backlog.length ? t('No hay ideas con ese nombre.') : t('El Backlog está vacío. Aprobá ideas para sumarlas.')}</span>}
                  </div>
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar idea del Backlog')} className="bx-input"
                    onKeyDown={(e) => { if (e.key === 'Escape') setPick(null); if (e.key === 'Enter' && pickList[0]) { setPick(null); setQ(''); move(pickList[0].id, c.k, null, t('"{title}" pasó al Roadmap', { title: pickList[0].title })); } }}
                    style={{ borderColor: '#059669', boxShadow: '0 0 0 2px rgba(5,150,105,0.1)' }} />
                  <a onClick={() => setPick(null)} style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', alignSelf: 'flex-start', padding: '0 4px' }}>{t('Cancelar')}</a>
                </>
              ) : (
                <a onClick={() => { setPick(c.k); setQ(''); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>{t('Añadir')}
                </a>
              ))}
            </div>
          );
        })}
        {launchCol((i) => (
          <RmCard key={i.id} api={api} i={i} compact={compact} launched dragging={false} overMe={false}
            onDragStart={() => {}} onDragEnd={() => {}} onOver={() => {}} onDrop={() => {}}
            menu={[
              { key: 'open', label: t('Ver detalle'), onClick: () => api.openIdea(i.id) },
              { key: 'undo', label: t('Deshacer lanzamiento'), onClick: async () => {
                await api.run(rpc('update_idea_plan', { p_id: i.id, p_patch: { dev_status: 'en_curso' } }));
                await move(i.id, 'ahora', null, t('Volvió a {col}, en curso', { col: colL('ahora') }));
              } },
            ]} />
        ))}
      </div>
    </>
  );
}

type MenuItem = { key?: string; label?: string; onClick?: () => void; type?: 'group' | 'divider'; children?: MenuItem[] };

function RmCard({ api, i, compact, launched, dragging, overMe, onDragStart, onDragEnd, onOver, onDrop, menu }: {
  api: BoardApi; i: Idea; compact: boolean; launched?: boolean; dragging: boolean; overMe: boolean; menu: MenuItem[];
  onDragStart: () => void; onDragEnd: () => void; onOver: () => void; onDrop: () => void;
}) {
  const { t, ddmmyyyy, locale } = useI18n();
  const sc = scoreOf(i);
  const num = (n: number) => (locale === 'en' ? String(n) : String(n).replace('.', ','));
  const imp = rateOf(i, 'impact'), eff = rateOf(i, 'effort');
  const P = i.priority ? PRIO[i.priority] : NO_PRIO;
  const D = DEV[i.dev_status || 'por_empezar'];
  return (
    <div draggable={api.canWrite && !launched}
      onDragStart={(e) => { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i.id)); } catch {} onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onOver(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
      onClick={() => api.openIdea(i.id)}
      className="bx-rm-card"
      style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: compact ? '10px 12px' : '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10, cursor: 'pointer', opacity: dragging ? 0.4 : 1, boxShadow: overMe ? '0 -3px 0 0 #7aa7f5' : '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: compact ? 14 : 15, fontWeight: 600, lineHeight: 1.35 }}>{i.title}</span>
        {api.canWrite && (
          <span onClick={(e) => e.stopPropagation()}>
            <Dropdown trigger={['click']} menu={{ items: menu as never }} placement="bottomRight">
              <button type="button" title={t('Acciones')} className="bx-icon-btn" style={{ width: 26, height: 26 }}><More /></button>
            </Dropdown>
          </span>
        )}
      </div>
      {launched && i.launched_at && <span style={{ fontSize: 12, color: LAUNCH_COL.cfg }}>{t('Lanzada el {date}', { date: ddmmyyyy(i.launched_at) })}</span>}
      {compact ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag tone={P}>{t(P.l)}</Tag>
          {!launched && <Tag tone={D}>{t(D.l)}</Tag>}
          {sc != null && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>{t('Valor')} {num(sc)}</span>}
        </div>
      ) : <>
      <AuthorLine i={i} />
      <span style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(0,0,0,0.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.description}</span>
      <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', rowGap: 6, alignItems: 'center', fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
        <span>{t('Categoría')}</span><span><Tag>{api.catL(i.category_id)}</Tag></span>
        <span>{t('Prioridad')}</span><span><Tag tone={P}>{t(P.l)}</Tag></span>
        {imp > 0 && eff > 0 && (
          <>
            <span>{t('Impacto')}</span><Dots v={imp} k="impact" />
            <span>{t('Esfuerzo')}</span><Dots v={eff} k="effort" />
          </>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t('Valor')} <Help><ValueHelp /></Help></span><span style={{ color: 'rgba(0,0,0,0.88)' }}>{sc == null ? t('Sin calificar') : num(sc)}</span>
        <span>{t('Desarrollo')}</span><span><Tag tone={D}>{t(D.l)}</Tag></span>
        {([['chk_design', t('Diseño')], ['chk_prd', 'PRD / SPEC']] as const).map(([k, l]) => (
          <span key={k} style={{ display: 'contents' }}>
            <span>{l}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: i[k] ? '#389e0d' : 'rgba(0,0,0,0.45)' }}>{i[k] ? <Yes /> : <No />}{i[k] ? t('Sí') : t('No')}</span>
          </span>
        ))}
      </div>
      </>}
    </div>
  );
}
