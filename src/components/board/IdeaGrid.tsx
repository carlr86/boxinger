'use client';
import { useEffect, useMemo, useState } from 'react';
import { Dropdown, Tooltip } from 'antd';
import { Dots, Empty, PageHead, Seg, Tag, TeamIcon, CommunityIcon } from '@/components/ui';
import { GROWTH, IDEA_STATUS, ORIGIN, SHADOW_POP, VOTE, VOTE_KEYS } from '@/lib/constants';
import { dshort, exact, rel } from '@/lib/format';
import type { Idea } from '@/lib/types';
import { rateOf, voteMode, type BoardApi } from './shared';

const PAGE = 20;

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

export function OriginTag({ origin }: { origin: string }) {
  const o = ORIGIN[origin];
  return <Tag tone={o}>{origin === 'comunidad' ? <CommunityIcon /> : <TeamIcon />}{o.l}</Tag>;
}

export function IdeaGrid({ api, backlog }: { api: BoardApi; backlog?: boolean }) {
  const { cols, isMobile } = useGridCols();
  const [q, setQ] = useState('');
  const [fCat, setFCat] = useState('all');
  const [fOri, setFOri] = useState<'all' | 'equipo' | 'comunidad'>('all');
  const [fSt, setFSt] = useState('all');
  const [sort, setSort] = useState<'recent' | 'votes' | 'comments'>('recent');
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let l = api.data.ideas.filter((i) => (fCat === 'all' || i.category_id === fCat) && (fOri === 'all' || i.origin === fOri));
    if (backlog) {
      // With Pro, ideas on the Roadmap leave the Backlog.
      l = l.filter((i) => i.status === 'aprobada' && !(api.pro && i.rm_col)).sort((a, b) => +new Date(b.approved_at || 0) - +new Date(a.approved_at || 0));
    } else {
      l = l.filter((i) => (fSt === 'all' || i.status === fSt) && (!qq || (i.title + ' ' + i.description).toLowerCase().includes(qq)));
      l.sort(sort === 'votes' ? (a, b) => b.votes - a.votes : sort === 'comments' ? (a, b) => b.comments - a.comments : (a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return l;
  }, [api.data.ideas, api.pro, backlog, q, fCat, fOri, fSt, sort]);

  useEffect(() => setLimit(PAGE), [q, fCat, fOri, fSt, sort, backlog]);
  const filtersOn = !!q || fCat !== 'all' || fOri !== 'all' || fSt !== 'all';

  return (
    <>
      <PageHead
        title={backlog ? 'Backlog' : 'Buzón de Ideas'}
        sub={backlog ? 'Ideas aprobadas por el Equipo, candidatas para el roadmap.' : 'Agrega tus ideas, deja tus comentarios y vota para que luego pasen al backlog.'}
        right={!backlog && !isMobile && api.me && api.canCreate ? <button type="button" className="bx-btn-primary" onClick={api.openNew}>+ Nueva idea</button> : undefined}
      />
      {!backlog && api.me && api.canWrite && !api.canCreate && (
        <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
          {api.isTeam ? 'En este buzón el Admin no habilitó la carga de ideas para los miembros. Podés votar, comentar y gestionar las ideas.' : 'En este buzón solo el Equipo carga ideas. Podés votar y comentar las ideas publicadas.'}
        </div>
      )}
      {isMobile ? (
        // Phones: one column, full-width controls, everything left-aligned.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!backlog && <input className="bx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en título y descripción" style={{ width: '100%', height: 36 }} />}
          <Seg options={[['all', 'Todas'], ['equipo', 'Equipo'], ['comunidad', 'Comunidad']]} value={fOri} onChange={setFOri} style={{ alignSelf: 'flex-start' }} />
          <div style={{ display: 'grid', gridTemplateColumns: backlog ? '1fr' : '1fr 1fr', gap: 10 }}>
            <select className="bx-select" value={fCat} onChange={(e) => setFCat(e.target.value)} style={{ width: '100%', minWidth: 0, height: 36 }}>
              <option value="all">Categorías</option>
              {api.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!backlog && (
              <select className="bx-select" value={fSt} onChange={(e) => setFSt(e.target.value)} style={{ width: '100%', minWidth: 0, height: 36 }}>
                <option value="all">Estados</option>
                {Object.entries(IDEA_STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
              </select>
            )}
          </div>
          {!backlog && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>
              Ordenar
              <select className="bx-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ height: 36 }}>
                <option value="recent">Más recientes</option><option value="votes">Más votadas</option><option value="comments">Más comentadas</option>
              </select>
            </label>
          )}
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {!backlog && <input className="bx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en título y descripción" style={{ flex: 1, minWidth: 200, maxWidth: 320 }} />}
        <Seg options={[['all', 'Todas'], ['equipo', 'Equipo'], ['comunidad', 'Comunidad']]} value={fOri} onChange={setFOri} style={{ alignSelf: 'auto' }} />
        <select className="bx-select" value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="all">Todas las categorías</option>
          {api.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!backlog && (
          <>
            <select className="bx-select" value={fSt} onChange={(e) => setFSt(e.target.value)}>
              <option value="all">Todos los estados</option>
              {Object.entries(IDEA_STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>Ordenar</span>
              <select className="bx-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="recent">Más recientes</option><option value="votes">Más votadas</option><option value="comments">Más comentadas</option>
              </select>
            </div>
          </>
        )}
      </div>
      )}

      {list.length === 0 && (
        <Empty
          text={backlog ? 'Todavía no hay ideas aprobadas.' : filtersOn ? 'No hay ideas que coincidan con los filtros.' : 'Este buzón todavía no tiene ideas.'}
          cta={!backlog && !filtersOn && api.canCreate ? <button type="button" className="bx-btn-primary" onClick={api.openNew}>Cargá la primera idea</button> : undefined}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 16 }}>
        {list.slice(0, limit).map((i) => <IdeaCard key={i.id} api={api} i={i} backlog={backlog} />)}
      </div>
      {list.length > limit && (
        <button type="button" className="bx-btn" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + PAGE)}>
          Ver más ideas ({list.length - limit})
        </button>
      )}
    </>
  );
}

const VoteIcon = () => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 2.5l5 6H3z" fill="currentColor" /><path d="M4.5 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>);
const CommentIcon = () => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>);
export { VoteIcon, CommentIcon };

function IdeaCard({ api, i, backlog }: { api: BoardApi; i: Idea; backlog?: boolean }) {
  const [pop, setPop] = useState(false);
  const vm = voteMode(api, i);
  const mine = vm === 'can' ? i.my_vote : null;
  const disabled = vm === 'closed' || vm === 'own';
  const short = i.description.length > 140 ? i.description.slice(0, 140).trimEnd() : i.description;
  const showRate = api.isTeam && api.pro && (i.status === 'aprobada' || i.status === 'rechazada');
  const label = vm === 'closed' ? 'Votación cerrada' : vm === 'own' ? 'Tu idea' : mine ? 'Votaste: ' + VOTE[mine] : 'Votar';

  const voteBtn = (
    <button type="button" disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (vm === 'login') api.goLogin(true); }}
      style={{ marginLeft: 'auto', height: 28, padding: '0 12px', borderRadius: 6, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
        border: '1px solid ' + (disabled ? '#d9d9d9' : '#059669'), background: disabled ? 'rgba(0,0,0,0.04)' : mine ? '#d1fae5' : '#fff', color: disabled ? 'rgba(0,0,0,0.25)' : '#059669' }}>
      {label}
    </button>
  );

  return (
    <div className="bx-card" onClick={() => api.openIdea(i.id)} style={{ opacity: i.hidden ? 0.55 : 1 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <OriginTag origin={i.origin} />
        <Tag>{api.catL(i.category_id)}</Tag>
        <Tag tone={IDEA_STATUS[i.status]}>{IDEA_STATUS[i.status].l}</Tag>
        {i.hidden && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Oculta</span>}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.title}</div>
      <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 14, lineHeight: 1.57, flex: 1, overflowWrap: 'anywhere' }}>
        {short}{i.description.length > 140 && <><span>… </span><a style={{ color: '#059669' }}>Ver más</a></>}
      </div>
      {showRate && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          {(['impact', 'effort'] as const).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{k === 'impact' ? 'Impacto' : 'Esfuerzo'}</span><Dots v={rateOf(i, k)} k={k} />
            </div>
          ))}
        </div>
      )}
      {api.isTeam && api.pro && i.status === 'aprobada' && !!i.growth?.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} title="Growth · solo visible para el Equipo">
          {i.growth.map((k) => GROWTH[k] && <Tag key={k} tone={GROWTH[k]} style={{ borderRadius: 10 }}>{GROWTH[k].l}</Tag>)}
        </div>
      )}
      {backlog && i.approved_at && (
        <div style={{ fontSize: 13, color: '#389e0d', background: '#f6ffed', borderRadius: 6, padding: '6px 10px' }}>
          Aprobada el {dshort(i.approved_at)} · {i.votes} votos finales
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: 'rgba(0,0,0,0.45)', borderTop: '1px solid #f0f0f0', paddingTop: 12, flexWrap: 'wrap' }}>
        <Tooltip title="Votaciones"><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><VoteIcon />{i.votes}</span></Tooltip>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CommentIcon />{i.comments}</span>
        <span title={exact(i.created_at)}>{rel(i.created_at)}</span>
        {!backlog && (vm === 'can' ? (
          <Dropdown open={pop} onOpenChange={setPop} trigger={['click']} placement="topRight"
            popupRender={() => (
              <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, boxShadow: SHADOW_POP, padding: 4, minWidth: 200 }}>
                {VOTE_KEYS.map((k) => (
                  <div key={k} className="bx-item" onClick={() => { setPop(false); api.vote(i.id, k); }}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, background: mine === k ? '#d1fae5' : undefined, color: mine === k ? '#059669' : 'rgba(0,0,0,0.88)' }}>
                    {VOTE[k]}<span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{mine === k ? 'Tu voto' : ''}</span>
                  </div>
                ))}
                {mine && (
                  <>
                    <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
                    <div className="bx-item" style={{ color: 'rgba(0,0,0,0.45)' }} onClick={() => { setPop(false); api.vote(i.id, null); }}>Quitar mi voto</div>
                  </>
                )}
              </div>
            )}>
            <span onClick={(e) => e.stopPropagation()} style={{ marginLeft: 'auto' }}>{voteBtn}</span>
          </Dropdown>
        ) : voteBtn)}
      </div>
    </div>
  );
}
