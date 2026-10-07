'use client';
import { useEffect, useMemo, useState } from 'react';
import { Dropdown, Tooltip } from 'antd';
import { Avatar, Dots, Empty, PageHead, Seg, Tag, TeamIcon, CommunityIcon } from '@/components/ui';
import { GROWTH, IDEA_STATUS, LAUNCHED, ORIGIN, SHADOW_POP, VOTE_KEYS, statusTone } from '@/lib/constants';
import { useI18n } from '@/lib/i18n/client';
import type { Idea } from '@/lib/types';
import { rateOf, voteMode, type BoardApi } from './shared';
import { AiButton, AiPanel, AiTag } from './AiPanel';

const PAGE = 20;
const LAYOUT_KEY = 'bx-ideas-layout';
type Layout = 'cards' | 'list';

/** Cards (default) or list, remembered per browser. */
function useLayout(): [Layout, (l: Layout) => void] {
  const [l, setL] = useState<Layout>('cards');
  useEffect(() => { try { if (localStorage.getItem(LAYOUT_KEY) === 'list') setL('list'); } catch {} }, []);
  const set = (v: Layout) => { setL(v); try { localStorage.setItem(LAYOUT_KEY, v); } catch {} };
  return [l, set];
}

const GridIcon = () => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /></svg>);
const ListIcon = () => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>);

function LayoutToggle({ value, onChange }: { value: Layout; onChange: (l: Layout) => void }) {
  const { t } = useI18n();
  const btn = (k: Layout, icon: React.ReactNode, label: string) => (
    <Tooltip title={label}>
      <button type="button" aria-label={label} aria-pressed={value === k} onClick={() => onChange(k)}
        style={{ width: 32, height: 30, border: 0, borderRadius: 4, display: 'grid', placeItems: 'center', cursor: 'pointer',
          background: value === k ? '#fff' : 'transparent', color: value === k ? '#059669' : 'rgba(0,0,0,0.45)', boxShadow: value === k ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' }}>
        {icon}
      </button>
    </Tooltip>
  );
  return (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 6, background: 'rgba(0,0,0,0.05)' }}>
      {btn('cards', <GridIcon />, t('Ver como tarjetas'))}
      {btn('list', <ListIcon />, t('Ver como lista'))}
    </div>
  );
}

export function useGridCols() {
  const [w, setW] = useState(1200);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return { w, cols: w < 768 ? 1 : w < 992 ? 2 : 3, isMobile: w < 768, isTablet: w >= 768 && w < 992 };
}

export function OriginTag({ origin, ai }: { origin: string; ai?: boolean }) {
  const { t } = useI18n();
  const o = ORIGIN[origin];
  return <><Tag tone={o}>{origin === 'comunidad' ? <CommunityIcon /> : <TeamIcon />}{t(o.l)}</Tag>{ai && <AiTag />}</>;
}

export function IdeaGrid({ api, backlog }: { api: BoardApi; backlog?: boolean }) {
  const { t } = useI18n();
  const { cols, isMobile } = useGridCols();
  const [q, setQ] = useState('');
  const [fCat, setFCat] = useState('all');
  const [fOri, setFOri] = useState<'all' | 'equipo' | 'comunidad'>('all');
  const [fSt, setFSt] = useState('all');
  const [sort, setSort] = useState<'recent' | 'votes' | 'comments'>('recent');
  const [limit, setLimit] = useState(PAGE);
  const [aiOpen, setAiOpen] = useState(false);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let l = api.data.ideas.filter((i) => (fCat === 'all' || i.category_id === fCat) && (fOri === 'all' || i.origin === fOri));
    if (backlog) {
      // With Pro, ideas on the Roadmap leave the Backlog.
      l = l.filter((i) => i.status === 'aprobada' && !(api.pro && i.rm_col)).sort((a, b) => +new Date(b.approved_at || 0) - +new Date(a.approved_at || 0));
    } else {
      // 'aprobada' = approved and not shipped yet; 'lanzada' = shipped.
      const stOf = (i: Idea) => (i.status === 'aprobada' && i.launched_at ? 'lanzada' : i.status);
      l = l.filter((i) => (fSt === 'all' || stOf(i) === fSt) && (!qq || (i.title + ' ' + i.description).toLowerCase().includes(qq)));
      l.sort(sort === 'votes' ? (a, b) => b.votes - a.votes : sort === 'comments' ? (a, b) => b.comments - a.comments : (a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return l;
  }, [api.data.ideas, api.pro, backlog, q, fCat, fOri, fSt, sort]);

  useEffect(() => setLimit(PAGE), [q, fCat, fOri, fSt, sort, backlog]);
  const [layout, setLayout] = useLayout();
  const filtersOn = !!q || fCat !== 'all' || fOri !== 'all' || fSt !== 'all';

  return (
    <>
      <PageHead
        title={backlog ? t('Backlog') : t('Buzón de Ideas')}
        sub={backlog ? t('Ideas aprobadas por el Equipo, candidatas para el roadmap.') : t('Agrega tus ideas, deja tus comentarios y vota para que luego pasen al backlog.')}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!backlog && api.data.role === 'admin' && <AiButton onClick={() => setAiOpen(true)} />}
            <LayoutToggle value={layout} onChange={setLayout} />
            {!backlog && !isMobile && api.me && api.canCreate && <button type="button" className="bx-btn-primary" onClick={api.openNew}>+ {t('Nueva idea')}</button>}
          </div>
        }
      />
      {!backlog && api.me && api.canWrite && !api.canCreate && (
        <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
          {api.isTeam ? t('En este buzón el Admin no habilitó la carga de ideas para los miembros. Podés votar, comentar y gestionar las ideas.') : t('En este buzón solo el Equipo carga ideas. Podés votar y comentar las ideas publicadas.')}
        </div>
      )}
      {isMobile ? (
        // Phones: one column, full-width controls, everything left-aligned.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!backlog && <input className="bx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar en título y descripción')} style={{ width: '100%', height: 36 }} />}
          <Seg options={[['all', t('Todas')], ['equipo', t('Equipo')], ['comunidad', t('Comunidad')]]} value={fOri} onChange={setFOri} style={{ alignSelf: 'flex-start' }} />
          <div style={{ display: 'grid', gridTemplateColumns: backlog ? '1fr' : '1fr 1fr', gap: 10 }}>
            <select className="bx-select" value={fCat} onChange={(e) => setFCat(e.target.value)} style={{ width: '100%', minWidth: 0, height: 36 }}>
              <option value="all">{t('Categorías')}</option>
              {api.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!backlog && (
              <select className="bx-select" value={fSt} onChange={(e) => setFSt(e.target.value)} style={{ width: '100%', minWidth: 0, height: 36 }}>
                <option value="all">{t('Estados')}</option>
                {Object.entries(IDEA_STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.l)}</option>)}
                <option value="lanzada">{t(LAUNCHED.l)}</option>
              </select>
            )}
          </div>
          {!backlog && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>
              {t('Ordenar')}
              <select className="bx-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ height: 36 }}>
                <option value="recent">{t('Más recientes')}</option><option value="votes">{t('Más votadas')}</option><option value="comments">{t('Más comentadas')}</option>
              </select>
            </label>
          )}
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {!backlog && <input className="bx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar en título y descripción')} style={{ flex: 1, minWidth: 200, maxWidth: 320 }} />}
        <Seg options={[['all', t('Todas')], ['equipo', t('Equipo')], ['comunidad', t('Comunidad')]]} value={fOri} onChange={setFOri} style={{ alignSelf: 'auto' }} />
        <select className="bx-select" value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="all">{t('Todas las categorías')}</option>
          {api.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!backlog && (
          <>
            <select className="bx-select" value={fSt} onChange={(e) => setFSt(e.target.value)}>
              <option value="all">{t('Todos los estados')}</option>
              {Object.entries(IDEA_STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.l)}</option>)}
                <option value="lanzada">{t(LAUNCHED.l)}</option>
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{t('Ordenar')}</span>
              <select className="bx-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="recent">{t('Más recientes')}</option><option value="votes">{t('Más votadas')}</option><option value="comments">{t('Más comentadas')}</option>
              </select>
            </div>
          </>
        )}
      </div>
      )}

      {list.length === 0 && (
        <Empty
          text={backlog ? t('Todavía no hay ideas aprobadas.') : filtersOn ? t('No hay ideas que coincidan con los filtros.') : t('Este buzón todavía no tiene ideas.')}
          cta={!backlog && !filtersOn && api.canCreate ? <button type="button" className="bx-btn-primary" onClick={api.openNew}>{t('Cargá la primera idea')}</button> : undefined}
        />
      )}
      {layout === 'list' ? (
        list.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
            {list.slice(0, limit).map((i, k) => <IdeaRow key={i.id} api={api} i={i} backlog={backlog} first={k === 0} />)}
          </div>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 16 }}>
          {list.slice(0, limit).map((i) => <IdeaCard key={i.id} api={api} i={i} backlog={backlog} />)}
        </div>
      )}
      {list.length > limit && (
        <button type="button" className="bx-btn" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + PAGE)}>
          {t('Ver más ideas ({n})', { n: list.length - limit })}
        </button>
      )}
      {api.data.role === 'admin' && <AiPanel api={api} open={aiOpen} onClose={() => setAiOpen(false)} isMobile={isMobile} />}
    </>
  );
}

const VoteIcon = () => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 2.5l5 6H3z" fill="currentColor" /><path d="M4.5 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>);
const CommentIcon = () => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>);
export { VoteIcon, CommentIcon };

/** Who proposed the idea: small avatar + name (team members and Community alike). */
export function AuthorLine({ i, size = 18 }: { i: Pick<Idea, 'author_id' | 'author_name' | 'author_avatar'>; size?: number }) {
  const { t } = useI18n();
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>
      <Avatar name={i.author_name} id={i.author_id || ''} url={i.author_avatar} size={size} color={i.author_id ? undefined : '#d9d9d9'} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.author_id ? i.author_name : t(i.author_name)}</span>
    </span>
  );
}

/** The "Votar" button with its vote menu (or the disabled state that explains why you can't vote). */
function VoteControl({ api, i }: { api: BoardApi; i: Idea }) {
  const { t } = useI18n();
  const [pop, setPop] = useState(false);
  const vm = voteMode(api, i);
  const mine = vm === 'can' ? i.my_vote : null;
  const disabled = vm === 'closed' || vm === 'own';
  const label = vm === 'closed' ? t('Votación cerrada') : vm === 'own' ? t('Tu idea') : mine ? t('Votaste: {option}', { option: api.voteL(mine) }) : t('Votar');
  const voteBtn = (
    <button type="button" disabled={disabled}
      // When it can vote, let the click reach the Dropdown's wrapper (which keeps it from opening the idea).
      onClick={(e) => { if (vm !== 'can') e.stopPropagation(); if (vm === 'login') api.goLogin(true); }}
      style={{ marginLeft: 'auto', height: 28, padding: '0 12px', borderRadius: 6, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        border: '1px solid ' + (disabled ? '#d9d9d9' : '#059669'), background: disabled ? 'rgba(0,0,0,0.04)' : mine ? '#d1fae5' : '#fff', color: disabled ? 'rgba(0,0,0,0.25)' : '#059669' }}>
      {label}
    </button>
  );
  if (vm !== 'can') return voteBtn;
  return (
    <Dropdown open={pop} onOpenChange={setPop} trigger={['click']} placement="topRight"
      popupRender={() => (
        <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, boxShadow: SHADOW_POP, padding: 4, minWidth: 200 }}>
          {VOTE_KEYS.map((k) => (
            <div key={k} className="bx-item" onClick={() => { setPop(false); api.vote(i.id, k); }}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, background: mine === k ? '#d1fae5' : undefined, color: mine === k ? '#059669' : 'rgba(0,0,0,0.88)' }}>
              {api.voteL(k)}<span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{mine === k ? t('Tu voto') : ''}</span>
            </div>
          ))}
          {mine && (
            <>
              <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
              <div className="bx-item" style={{ color: 'rgba(0,0,0,0.45)' }} onClick={() => { setPop(false); api.vote(i.id, null); }}>{t('Quitar mi voto')}</div>
            </>
          )}
        </div>
      )}>
      <span onClick={(e) => e.stopPropagation()} style={{ marginLeft: 'auto' }}>{voteBtn}</span>
    </Dropdown>
  );
}

/** One idea per row: easier to scan when a board has many ideas. */
function IdeaRow({ api, i, backlog, first }: { api: BoardApi; i: Idea; backlog?: boolean; first: boolean }) {
  const { t, dshort, exact, relShort } = useI18n();
  return (
    <div className="bx-idea-row" onClick={() => api.openIdea(i.id)}
      style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 20px', borderTop: first ? undefined : '1px solid #f0f0f0', cursor: 'pointer', opacity: i.hidden ? 0.55 : 1 }}>
      <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{i.title}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <OriginTag origin={i.origin} ai={i.ai} />
          <Tag>{api.catL(i.category_id)}</Tag>
          <Tag tone={statusTone(i)}>{t(statusTone(i).l)}</Tag>
          {i.hidden && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Oculta')}</span>}
          <span style={{ marginLeft: 4 }}><AuthorLine i={i} /></span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: 'rgba(0,0,0,0.45)', flex: 'none', marginLeft: 'auto' }}>
        <Tooltip title={t('Votaciones')}><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><VoteIcon />{i.votes}</span></Tooltip>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CommentIcon />{i.comments}</span>
        <span title={exact(i.created_at)} style={{ whiteSpace: 'nowrap' }}>{backlog && i.approved_at ? t('Aprobada el {date}', { date: dshort(i.approved_at) }) : relShort(i.created_at)}</span>
        {!backlog && <span style={{ minWidth: 0 }}><VoteControl api={api} i={i} /></span>}
      </div>
    </div>
  );
}

function IdeaCard({ api, i, backlog }: { api: BoardApi; i: Idea; backlog?: boolean }) {
  const { t, dshort, exact, relShort } = useI18n();
  const short = i.description.length > 140 ? i.description.slice(0, 140).trimEnd() : i.description;
  const showRate = api.isTeam && api.pro && (i.status === 'aprobada' || i.status === 'rechazada');

  return (
    <div className="bx-card" onClick={() => api.openIdea(i.id)} style={{ opacity: i.hidden ? 0.55 : 1 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <OriginTag origin={i.origin} ai={i.ai} />
        <Tag>{api.catL(i.category_id)}</Tag>
        <Tag tone={statusTone(i)}>{t(statusTone(i).l)}</Tag>
        {i.hidden && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Oculta')}</span>}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.title}</div>
      <AuthorLine i={i} />
      <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 14, lineHeight: 1.57, flex: 1, overflowWrap: 'anywhere' }}>
        {short}{i.description.length > 140 && <><span>… </span><a style={{ color: '#059669' }}>{t('Ver más')}</a></>}
      </div>
      {showRate && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          {(['impact', 'effort'] as const).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{k === 'impact' ? t('Impacto') : t('Esfuerzo')}</span><Dots v={rateOf(i, k)} k={k} />
            </div>
          ))}
        </div>
      )}
      {api.isTeam && api.pro && i.status === 'aprobada' && !!i.growth?.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} title={t('Growth · solo visible para el Equipo')}>
          {i.growth.map((k) => GROWTH[k] && <Tag key={k} tone={GROWTH[k]} style={{ borderRadius: 10 }}>{t(GROWTH[k].l)}</Tag>)}
        </div>
      )}
      {backlog && i.approved_at && (
        <div style={{ fontSize: 13, color: '#389e0d', background: '#f6ffed', borderRadius: 6, padding: '6px 10px' }}>
          {t('Aprobada el {date} · {n} votos finales', { date: dshort(i.approved_at), n: i.votes })}
        </div>
      )}
      {/* One line, so every card's footer sits at the same height. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'rgba(0,0,0,0.45)', borderTop: '1px solid #f0f0f0', paddingTop: 12, flexWrap: 'nowrap' }}>
        <Tooltip title={t('Votaciones')}><span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}><VoteIcon />{i.votes}</span></Tooltip>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}><CommentIcon />{i.comments}</span>
        <Tooltip title={exact(i.created_at)}><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{relShort(i.created_at)}</span></Tooltip>
        {!backlog && <VoteControl api={api} i={i} />}
      </div>
    </div>
  );
}
