'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Dropdown, Modal } from 'antd';
import { AppHeader } from '@/components/AppHeader';
import { useSession, useToast } from '@/components/Providers';
import { Avatar, Choice, EmailChips, Note, PageHead, Seg, Tag, WarnPill, ToggleRow } from '@/components/ui';
import { useGridCols } from '@/components/board/IdeaGrid';
import { rpc, flushEmails } from '@/lib/rpc';
import { boardUrl, displayUrl } from '@/lib/env';
import { plural, rel } from '@/lib/format';
import { MAX_MEMBERS, VISIBILITY, VISIBILITY_ORDER } from '@/lib/constants';
import type { BoardCard, TeamCtx, Visibility } from '@/lib/types';
import { TeamDrawer } from './TeamDrawer';
import { BoardDetail } from './BoardDetail';
import { VisibilityModal } from '@/components/board/VisibilityModal';

type ModalState =
  | { type: 'create'; teamId: string }
  | { type: 'createTeam' }
  | { type: 'rename'; board: BoardCard }
  | { type: 'renameTeam'; team: TeamCtx }
  | { type: 'delete'; board: BoardCard }
  | { type: 'guests'; board: BoardCard }
  | { type: 'access'; board: BoardCard; team: TeamCtx }
  | null;

const Star = () => (<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="#faad14" /></svg>);
const More = () => (<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="3.5" cy="8" r="1.3" fill="currentColor" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="12.5" cy="8" r="1.3" fill="currentColor" /></svg>);
const Users = () => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M1.5 13.5c.6-2.2 2.4-3.5 4.5-3.5s3.9 1.3 4.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M11 4.2a2.3 2.3 0 010 4.1M12.5 10.3c1 .5 1.7 1.6 2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>);

export function BoardsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { ctx, refresh } = useSession();
  const { cols, isMobile } = useGridCols();
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'fav'>('all');
  const [modal, setModal] = useState<ModalState>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BoardCard | null>(null);
  const [visFor, setVisFor] = useState<BoardCard | null>(null);

  const isPro = !!ctx?.account?.pro;
  const ownTeams = ctx?.teams.filter((t) => t.own) || [];
  const allOwnBoards = ownTeams.flatMap((t) => t.boards);
  // Teams where the user can create boards: their own, or teams whose owner lets members do it.
  const creatableTeams = ctx?.teams.filter((t) => t.can_create_boards) || [];

  useEffect(() => {
    if (sp.get('crear') === '1' && creatableTeams.length) {
      openCreate(creatableTeams[0].id);
      router.replace('/app/buzones');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ctx) return null;

  function openCreate(tid?: string) {
    const target = creatableTeams.find((x) => x.id === tid) || creatableTeams[0];
    if (!target) return router.push('/app/onboarding');
    if (target.own && !isPro && allOwnBoards.length >= 1) return toast.info('En Free tenés 1 buzón. Pasá a Pro para crear más.');
    setModal({ type: 'create', teamId: target.id });
  }

  const bq = q.trim().toLowerCase();
  const match = (b: BoardCard) => (f === 'all' || b.fav) && (!bq || b.name.toLowerCase().includes(bq));
  const sortFav = (l: BoardCard[]) => l.map((b, k) => ({ b, k })).sort((x, y) => Number(y.b.fav) - Number(x.b.fav) || x.k - y.k).map((x) => x.b);
  const teams = ctx.teams.map((t) => ({ t, shown: sortFav(t.boards.filter(match)) })).filter(({ t, shown }) => shown.length > 0 || (!bq && f === 'all') || (t.boards.length === 0 && !bq && f === 'all'));
  const guests = sortFav(ctx.guest_boards.filter(match));
  const nothing = teams.every((x) => x.shown.length === 0) && guests.length === 0;

  const copy = (txt: string, msg: string) => { navigator.clipboard?.writeText(txt).catch(() => {}); toast.ok(msg); };
  const fav = async (b: BoardCard) => { await rpc('toggle_favorite', { p_board: b.id }).catch((e) => toast.err(e)); await refresh(); toast.ok(b.fav ? 'Quitado de favoritos' : 'Agregado a favoritos'); };

  const card = (b: BoardCard, t: TeamCtx | null) => {
    const priv = b.visibility === 'private';
    const guestOnly = !t;
    const admin = !!t?.is_admin;
    const memberN = t ? t.members.filter((m) => m.role !== 'admin').length : 0;
    const items = [
      { key: 'detail', label: 'Ver detalle del buzón', onClick: () => setDetail(b) },
      ...(admin ? [{ key: 'rename', label: 'Cambiar nombre', onClick: () => setModal({ type: 'rename', board: b }) }] : []),
      { key: 'url', label: 'Compartir URL del buzón', onClick: () => copy(boardUrl(b.slug), 'URL del buzón copiada') },
      ...(!guestOnly ? [{ key: 'guests', label: b.visibility === 'invite' ? 'Invitar personas' : 'Compartir link a invitados', disabled: priv, title: priv ? 'Los buzones privados no admiten invitados' : '', onClick: () => (priv ? toast.info('Los buzones privados no admiten invitados de la Comunidad') : setModal({ type: 'guests', board: b })) }] : []),
      ...(admin ? [{ key: 'vis', label: 'Cambiar visibilidad', onClick: () => (b.locked ? toast.info('Este buzón requiere el plan Pro') : setVisFor(b)) }] : []),
      ...(admin ? [{ key: 'access', label: <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>Acceso de miembros <Tag tone={{ l: '', bg: '#d1fae5', bd: '#a9cbc2', fg: '#059669' }} style={{ fontSize: 11, lineHeight: '18px' }}>Pro</Tag></span>, disabled: !isPro, onClick: () => (isPro ? setModal({ type: 'access', board: b, team: t! }) : toast.info('Sumar miembros al equipo está disponible en Pro')) }] : []),
      { key: 'fav', label: b.fav ? 'Quitar de favoritos' : 'Agregar a favoritos', onClick: () => fav(b) },
      ...(admin ? [{ type: 'divider' as const }, { key: 'delete', label: 'Eliminar buzón', danger: true, onClick: () => setModal({ type: 'delete', board: b }) }] : []),
    ];
    return (
      <div key={b.id} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {b.logo_url ? <Avatar name={b.name} url={b.logo_url} size={40} square /> : <Avatar name={b.name} color={b.color} size={40} square />}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <a onClick={() => (b.locked ? toast.info('Este buzón requiere el plan Pro') : router.push('/app/b/' + b.slug))} className="bx-row-link" style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</a>
              {b.fav && <Star />}
            </div>
            <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, color: 'rgba(0,0,0,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/app/b/{b.slug}</span>
          </div>
          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items }}>
            <button type="button" title="Acciones" className="bx-icon-btn"><More /></button>
          </Dropdown>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag>{VISIBILITY[b.visibility].l}</Tag>
          {guestOnly && <Tag tone={{ l: '', bg: '#f9f0ff', bd: '#d3adf7', fg: '#531dab' }}>Invitado</Tag>}
          {guestOnly && <Tag>{b.team_name}</Tag>}
          {t && t.pro && memberN > 0 && admin && <Tag title="Miembros del equipo con acceso">Equipo: {memberN + 1} personas</Tag>}
          {t && !t.own && <Tag tone={{ l: '', bg: '#eff6ff', bd: '#93c5fd', fg: '#3b82f6' }}>Miembro</Tag>}
          {b.locked && <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>Requiere Pro</Tag>}
          {b.status !== 'active' && <Tag tone={{ l: '', bg: '#fff2f0', bd: '#ffccc7', fg: '#cf1322' }}>Suspendido</Tag>}
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.57, color: 'rgba(0,0,0,0.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 44 }}>{b.description || 'Sin descripción.'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
          <Num l="Ideas" v={b.ideas} />
          <Num l="Miembros" v={priv ? 'Solo Equipo' : b.guests} small={priv} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Última actividad</span><span style={{ fontSize: 13, lineHeight: '27px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rel(b.last_activity_at)}</span></div>
        </div>
        <button type="button" disabled={b.locked} onClick={() => router.push('/app/b/' + b.slug)}
          style={{ height: 32, borderRadius: 6, fontSize: 14, cursor: b.locked ? 'not-allowed' : 'pointer', border: '1px solid ' + (b.locked ? '#d9d9d9' : '#0F172A'), background: b.locked ? 'rgba(0,0,0,0.04)' : '#0F172A', color: b.locked ? 'rgba(0,0,0,0.25)' : '#fff' }}>
          {b.locked ? 'Requiere Pro' : 'Ver Buzón'}
        </button>
      </div>
    );
  };

  return (
    <>
      <AppHeader slogan="From idea to Product" />
      <main className="bx-main">
        <PageHead title="Mis Buzones de ideas"
          sub={<>Elegí un buzón para entrar. {ctx.account ? (ctx.account.plan === 'enterprise' ? 'Plan Enterprise · equipos, buzones y miembros ilimitados.' : isPro ? 'Plan Pro · equipos y buzones ilimitados.' : 'Plan Free · 1 equipo · 1 buzón.') : ''}</>}
          right={ctx.account ? (
            <button type="button" className="bx-btn" onClick={() => (isPro ? setModal({ type: 'createTeam' }) : toast.info('Equipos ilimitados en el plan Pro'))} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              + Crear equipo{!isPro && <WarnPill>Pro</WarnPill>}
            </button>
          ) : (
            <button type="button" className="bx-btn-primary" onClick={() => router.push('/app/onboarding')}>+ Crear mi buzón</button>
          )} />
        {ctx.account && !isPro && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
            <span style={{ flex: 1, minWidth: 240, color: 'rgba(0,0,0,0.65)' }}>Tu plan Free incluye 1 equipo con 1 buzón, solo para vos. Con Pro tenés equipos y buzones ilimitados, y hasta 4 miembros por equipo.</span>
            <a onClick={() => router.push('/app/perfil?tab=sub')}>Ver planes</a>
          </div>
        )}
        {!ctx.account && ctx.teams.length === 0 && (
          <Note>Estás como Invitado en estos buzones. También podés crear tu propio buzón gratis y sumar a tu comunidad.</Note>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="bx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar buzón" style={{ flex: 1, minWidth: 200, maxWidth: 320 }} />
          <Seg options={[['all', 'Todos'], ['fav', 'Favoritos']]} value={f} onChange={setF} style={{ alignSelf: 'auto' }} />
        </div>
        {nothing && (
          <div style={{ background: '#fff', borderRadius: 8, padding: '48px 24px', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>
            {f === 'fav' ? 'Todavía no marcaste buzones como favoritos.' : bq ? 'No hay buzones con ese nombre.' : 'Todavía no tenés buzones.'}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {teams.map(({ t, shown }) => {
            const people = [t.owner].concat(t.members);
            return (
              <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid #e8e8e8' }}>
                  <Avatar name={t.name} color={t.color} size={36} square style={{ opacity: t.locked ? 0.45 : 1, fontSize: 13 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t.own ? 'Equipo' : 'Equipo · sos Miembro'}</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{t.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                    {people.slice(0, 5).map((p, k) => (
                      <span key={k} title={p.name || p.email} style={{ marginLeft: k ? -6 : 0, border: '2px solid #f5f5f5', borderRadius: '50%' }}>
                        <Avatar name={p.name || p.email} id={p.id || p.user_id} url={p.avatar_url} size={26} />
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t.pro ? plural(people.length, 'persona', 'personas') : 'Solo vos'}</span>
                  {t.locked && <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>Requiere Pro</Tag>}
                  {(t.is_admin || t.can_create_boards) && (
                    // Phones: the actions get their own row under the team, so a long member list never pushes them around.
                    <div style={isMobile ? { flexBasis: '100%', display: 'flex', gap: 8, flexWrap: 'wrap' } : { marginLeft: 'auto', display: 'flex', gap: 12 }}>
                      {t.is_admin && (
                        <button type="button" className="bx-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setTeamId(t.id)}><Users />Gestionar equipo</button>
                      )}
                      {t.can_create_boards && (
                        <button type="button" className="bx-btn-primary" onClick={() => (t.locked ? toast.info('Este equipo requiere el plan Pro') : openCreate(t.id))}>+ Crear Buzón</button>
                      )}
                    </div>
                  )}
                </div>
                {shown.length === 0 && (
                  <div style={{ background: '#fff', borderRadius: 8, padding: '32px 24px', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>
                    {t.boards.length ? 'Ningún buzón de este equipo coincide con el filtro.' : 'Este equipo todavía no tiene buzones.'}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 16 }}>{shown.map((b) => card(b, t))}</div>
              </div>
            );
          })}
          {guests.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid #e8e8e8' }}>
                <span style={{ width: 36, height: 36, borderRadius: 8, background: '#f9f0ff', color: '#531dab', display: 'grid', placeItems: 'center' }}><Users /></span>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Invitado</span>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>Buzones donde participás</span>
                </div>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Podés proponer ideas, votar y comentar.</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 16 }}>{guests.map((b) => card(b, null))}</div>
            </div>
          )}
        </div>
      </main>

      <BoardModals modal={modal} onClose={() => setModal(null)} ownTeams={creatableTeams} isPro={isPro} onOpenTeam={(id) => { setModal(null); setTeamId(id); }} />
      {teamId && <TeamDrawer teamId={teamId} onClose={() => setTeamId(null)} onRename={(t) => setModal({ type: 'renameTeam', team: t })} />}
      <VisibilityModal board={visFor ? { id: visFor.id, name: visFor.name, visibility: visFor.visibility, guests: visFor.guests } : null} pro={isPro}
        onClose={() => setVisFor(null)} onDone={() => refresh()} onGoPro={() => router.push('/app/perfil?tab=sub')} />
      {detail && <BoardDetail board={detail} team={ctx.teams.find((t) => t.id === detail.team_id) || null} onClose={() => setDetail(null)} />}
    </>
  );
}

function Num({ l, v, small }: { l: string; v: React.ReactNode; small?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{l}</span>
      <span style={{ fontSize: small ? 13 : 18, fontWeight: small ? 400 : 600, lineHeight: small ? '27px' : undefined }}>{v}</span>
    </div>
  );
}

function BoardModals({ modal, onClose, ownTeams, isPro, onOpenTeam }: {
  modal: ModalState; onClose: () => void; ownTeams: TeamCtx[]; isPro: boolean; onOpenTeam: (id: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { ctx, refresh } = useSession();
  const [input, setInput] = useState('');
  const [vis, setVis] = useState<Visibility>('invite');
  const [membersIdeas, setMembersIdeas] = useState(true);
  const [guestsIdeas, setGuestsIdeas] = useState(true);
  const [memberBoards, setMemberBoards] = useState(false);
  const [team, setTeam] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    setTried(false); setEmails([]); setVis('invite'); setBusy(false); setAccess(null);
    setMembersIdeas(true); setGuestsIdeas(true); setMemberBoards(false);
    if (!modal) return;
    setInput(modal.type === 'rename' ? modal.board.name : modal.type === 'renameTeam' ? modal.team.name : '');
    if (modal.type === 'create') setTeam(modal.teamId);
    if (modal.type === 'access') {
      rpc<{ boards: { id: string; access: Record<string, boolean> }[] }>('get_team', { p_team: modal.team.id })
        .then((t) => setAccess(t.boards.find((x) => x.id === modal.board.id)?.access || {}))
        .catch((e) => toast.err(e));
    }
  }, [modal]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = modal?.type;
  const exec = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(true);
    try { await fn(); toast.ok(ok); await refresh(); onClose(); after?.(); } catch (e) { toast.err(e); } finally { setBusy(false); }
  };
  const nameErr = tried && !input.trim() ? 'El nombre es obligatorio' : '';

  let title = '', text: React.ReactNode = '', body: React.ReactNode = null, okL = '', ok: (() => void) | null = null, danger = false, cancelL = 'Cancelar';
  if (t === 'create') {
    const teamPro = !!ownTeams.find((x) => x.id === team)?.pro;
    title = 'Crear buzón';
    text = VISIBILITY[vis].d + ' Todos los miembros del equipo tienen acceso.';
    body = (
      <>
        <input className={'bx-input' + (nameErr ? ' err' : '')} autoFocus maxLength={60} placeholder="Nombre del buzón" value={input} onChange={(e) => setInput(e.target.value)} />
        <Choice options={VISIBILITY_ORDER.map((k) => [k, VISIBILITY[k].l] as [Visibility, string])} value={vis} onChange={(v) => (v === 'private' && !teamPro ? toast.info('Los buzones privados están disponibles en Pro.') : setVis(v))} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Quiénes pueden crear ideas</span>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>El dueño del equipo y vos siempre pueden. Todos pueden votar y comentar.</span>
          </div>
          {teamPro && <ToggleRow label="Miembros del equipo" on={membersIdeas} onChange={setMembersIdeas} />}
          {vis !== 'private' ? <ToggleRow label="Invitados" desc={vis === 'invite' ? 'Las personas que invites a este buzón.' : 'La Comunidad que se suma con el link o por invitación.'} on={guestsIdeas} onChange={setGuestsIdeas} />
            : <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Los buzones privados no admiten invitados.</span>}
          {!teamPro && vis !== 'private' && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Con Pro también podés decidir si tus miembros cargan ideas.</span>}
        </div>
        {ownTeams.length > 1 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Equipo
            <select className="bx-select" value={team} onChange={(e) => setTeam(e.target.value)}>{ownTeams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
        )}
      </>
    );
    okL = 'Crear buzón';
    ok = () => { setTried(true); if (!input.trim()) return; setBusy(true); rpc<{ slug: string }>('create_board', { p_team: team, p_name: input, p_visibility: vis, p_members_ideas: membersIdeas, p_guests_ideas: guestsIdeas }).then(async (r) => { toast.ok('Buzón creado'); await refresh(); onClose(); router.push('/app/b/' + r.slug + '/config'); }).catch((e) => toast.err(e)).finally(() => setBusy(false)); };
  } else if (t === 'createTeam') {
    title = 'Crear equipo';
    text = ctx?.account?.plan === 'enterprise' ? 'Cada equipo tiene sus propios buzones y miembros ilimitados.' : `Cada equipo tiene sus propios buzones y hasta ${MAX_MEMBERS} miembros además de vos.`;
    body = (
      <>
        <input className={'bx-input' + (nameErr ? ' err' : '')} autoFocus maxLength={60} placeholder="Nombre del equipo" value={input} onChange={(e) => setInput(e.target.value)} />
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px' }}>
          <ToggleRow label="Los miembros pueden crear buzones" desc="Si lo activás, los miembros que invites pueden crear buzones en este equipo y cargar ideas en ellos." on={memberBoards} onChange={setMemberBoards} />
        </div>
      </>
    );
    okL = 'Crear equipo';
    ok = () => { setTried(true); if (!input.trim()) return; setBusy(true); rpc<string>('create_team', { p_name: input, p_members_create_boards: memberBoards }).then(async (id) => { toast.ok('Equipo creado'); await refresh(); onOpenTeam(id); }).catch((e) => toast.err(e)).finally(() => setBusy(false)); };
  } else if (t === 'rename' && modal?.type === 'rename') {
    title = 'Cambiar nombre';
    text = 'El nombre se ve en el header del buzón y en las invitaciones. La URL no cambia.';
    body = <input className={'bx-input' + (nameErr ? ' err' : '')} autoFocus maxLength={60} placeholder="Nombre del buzón" value={input} onChange={(e) => setInput(e.target.value)} />;
    okL = 'Guardar';
    ok = () => { setTried(true); if (input.trim()) exec(() => rpc('update_board', { p_board: modal.board.id, p_name: input }), 'Nombre actualizado'); };
  } else if (t === 'renameTeam' && modal?.type === 'renameTeam') {
    title = 'Cambiar nombre del equipo';
    text = 'El nombre del equipo se ve en Mis Buzones y en las invitaciones.';
    body = <input className={'bx-input' + (nameErr ? ' err' : '')} autoFocus maxLength={60} placeholder="Nombre del equipo" value={input} onChange={(e) => setInput(e.target.value)} />;
    okL = 'Guardar';
    ok = () => { setTried(true); if (input.trim()) exec(() => rpc('rename_team', { p_team: modal.team.id, p_name: input }), 'Nombre del equipo actualizado'); };
  } else if (t === 'delete' && modal?.type === 'delete') {
    const b = modal.board, match = input.trim() === b.name;
    title = 'Eliminar buzón';
    text = <>Se eliminan {plural(b.ideas, 'idea', 'ideas')} con sus votos y comentarios. Esta acción no se puede deshacer. Escribí &quot;{b.name}&quot; para confirmar.</>;
    body = (
      <>
        <input className={'bx-input' + (tried && !match ? ' err' : '')} autoFocus maxLength={60} placeholder={b.name} value={input} onChange={(e) => setInput(e.target.value)} />
        {tried && !match && <span style={{ fontSize: 13, color: '#ff4d4f' }}>El nombre no coincide</span>}
      </>
    );
    okL = 'Eliminar'; danger = true;
    ok = () => { setTried(true); if (match) exec(() => rpc('delete_board', { p_board: b.id, p_confirm: input.trim() }), 'Buzón eliminado'); };
  } else if (t === 'guests' && modal?.type === 'guests') {
    const b = modal.board;
    const inv = b.visibility === 'invite';
    title = inv ? 'Invitar personas' : 'Compartir link a invitados';
    text = inv
      ? `Invitá por email a quienes quieras sumar a ${b.name}. El link solo funciona para las personas invitadas.`
      : `Quien se registre desde este link queda como Comunidad de ${b.name}. También podés enviarlo por email.`;
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 4px 4px 11px', background: '#fafafa' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl(b.slug)}</span>
          <a style={{ padding: '4px 10px' }} onClick={() => { navigator.clipboard?.writeText(boardUrl(b.slug) + '?unirme=1').catch(() => {}); toast.ok('Link de invitación copiado'); }}>Copiar</a>
        </div>
        <EmailChips value={emails} onChange={setEmails} onInvalid={(e) => toast.info('Email inválido: ' + e)} />
      </>
    );
    okL = 'Enviar invitaciones';
    ok = () => {
      if (!emails.length) return toast.info('Agregá al menos un email');
      exec(async () => { await rpc('invite_guests', { p_board: b.id, p_emails: emails }); flushEmails(); }, emails.length === 1 ? 'Invitación enviada' : emails.length + ' invitaciones enviadas');
    };
  } else if (t === 'access' && modal?.type === 'access') {
    const { board: b, team: tm } = modal;
    title = 'Acceso de miembros';
    text = `Los miembros de ${tm.name} ven todos los buzones del equipo. Podés quitarle el acceso a ${b.name} a un miembro específico.`;
    cancelL = 'Listo';
    body = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MemberRow name={tm.owner.name} email={tm.owner.email} id={tm.owner.id} status="Admin" />
          {tm.members.map((m) => {
            const on = access ? access[m.user_id!] !== false : true;
            return (
              <MemberRow key={m.user_id} name={m.name} email={m.email} id={m.user_id} status={on ? 'Con acceso' : 'Sin acceso'} warn={!on}
                toggle={access ? { on, onClick: async () => {
                  setAccess({ ...access, [m.user_id!]: !on });
                  try { await rpc('set_board_access', { p_board: b.id, p_user: m.user_id, p_has: !on }); toast.ok(on ? `${m.name} ya no ve ${b.name}` : `${m.name} vuelve a ver ${b.name}`); refresh(); }
                  catch (e) { setAccess({ ...access }); toast.err(e); }
                } } : undefined} />
            );
          })}
          {tm.pending.map((p) => <MemberRow key={p.id} name={p.email} email={p.email} status="Invitación pendiente" warn />)}
        </div>
        <a onClick={() => onOpenTeam(tm.id)} style={{ fontSize: 14 }}>{tm.members.length ? 'Gestionar equipo' : 'Invitar miembros al equipo'}</a>
      </>
    );
  }

  return (
    <Modal open={!!modal} onCancel={onClose} title={title} width={460} destroyOnHidden footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>{text}</span>
        {body}
        {nameErr && t !== 'delete' && <span style={{ fontSize: 13, color: '#ff4d4f' }}>{nameErr}</span>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="bx-btn" onClick={onClose}>{cancelL}</button>
          {ok && <button type="button" className="bx-btn-primary" disabled={busy} style={danger ? { background: '#ff4d4f' } : undefined} onClick={ok}>{okL}</button>}
        </div>
      </div>
    </Modal>
  );
}

export function MemberRow({ name, email, id, status, warn, toggle, action }: {
  name: string; email: string; id?: string; status: string; warn?: boolean;
  toggle?: { on: boolean; onClick: () => void }; action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Avatar name={name} id={id} size={32} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
      </div>
      <span style={{ fontSize: 13, color: warn ? '#d48806' : 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>{status}</span>
      {toggle && (
        <button type="button" onClick={toggle.onClick} aria-pressed={toggle.on}
          style={{ flex: 'none', position: 'relative', width: 44, height: 22, borderRadius: 11, border: 0, cursor: 'pointer', background: toggle.on ? '#059669' : 'rgba(0,0,0,0.25)', transition: 'background .2s' }}>
          <span style={{ position: 'absolute', top: 2, left: toggle.on ? 24 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,35,11,0.2)', transition: 'left .2s' }} />
        </button>
      )}
      {action}
    </div>
  );
}

