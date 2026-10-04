'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Dropdown, Modal } from 'antd';
import { DeleteOutlined, EditOutlined, InfoCircleOutlined, LinkOutlined, LockOutlined, LogoutOutlined, SettingOutlined, StarFilled, StarOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import { AppHeader } from '@/components/AppHeader';
import { useSession, useToast } from '@/components/Providers';
import { Avatar, Choice, EmailChips, Note, PageHead, Seg, Tag, WarnPill, ToggleRow } from '@/components/ui';
import { useGridCols } from '@/components/board/IdeaGrid';
import { rpc, flushEmails } from '@/lib/rpc';
import { boardUrl, displayUrl } from '@/lib/env';
import { useI18n } from '@/lib/i18n/client';
import { MAX_MEMBERS, VISIBILITY, VISIBILITY_ORDER } from '@/lib/constants';
import type { BoardCard, TeamCtx, Visibility } from '@/lib/types';
import { TeamDrawer } from './TeamDrawer';
import { BoardDetail } from './BoardDetail';
import { VisibilityModal } from '@/components/board/VisibilityModal';
import { FreeBoardSelect } from '@/components/FreeBoardSelect';

type ModalState =
  | { type: 'create'; teamId: string }
  | { type: 'createTeam' }
  | { type: 'rename'; board: BoardCard }
  | { type: 'renameTeam'; team: TeamCtx }
  | { type: 'delete'; board: BoardCard }
  | { type: 'leave'; board: BoardCard }
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
  const { t, plural, rel, dlong } = useI18n();
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
  const noBoards = !ctx.account && ctx.teams.length === 0 && ctx.guest_boards.length === 0; // skipped the onboarding

  const copy = (txt: string, msg: string) => { navigator.clipboard?.writeText(txt).catch(() => {}); toast.ok(msg); };
  const fav = async (b: BoardCard) => { await rpc('toggle_favorite', { p_board: b.id }).catch((e) => toast.err(e)); await refresh(); toast.ok(b.fav ? 'Quitado de favoritos' : 'Agregado a favoritos'); };

  const card = (b: BoardCard, tc: TeamCtx | null) => {
    const priv = b.visibility === 'private';
    const guestOnly = !tc;
    const admin = !!tc?.is_admin;
    const memberN = tc ? tc.members.filter((m) => m.role !== 'admin').length : 0;
    const items = [
      { key: 'detail', icon: <InfoCircleOutlined />, label: t('Ver detalle del buzón'), onClick: () => setDetail(b) },
      ...(!guestOnly ? [{ key: 'config', icon: <SettingOutlined />, label: t('Configuración del buzón'), onClick: () => router.push('/app/b/' + b.slug + '/config') }] : []),
      ...(admin ? [{ key: 'rename', icon: <EditOutlined />, label: t('Cambiar nombre'), onClick: () => setModal({ type: 'rename', board: b }) }] : []),
      { key: 'url', icon: <LinkOutlined />, label: t('Compartir URL del buzón'), onClick: () => copy(boardUrl(b.slug), 'URL del buzón copiada') },
      ...(!guestOnly ? [{ key: 'guests', icon: <UserAddOutlined />, label: b.visibility === 'invite' ? t('Invitar personas') : t('Compartir link a invitados'), disabled: priv, title: priv ? t('Los buzones privados no admiten invitados') : '', onClick: () => (priv ? toast.info('Los buzones privados no admiten invitados de la Comunidad') : setModal({ type: 'guests', board: b })) }] : []),
      ...(admin ? [{ key: 'vis', icon: <LockOutlined />, label: t('Cambiar visibilidad'), onClick: () => (b.locked ? toast.info('Este buzón requiere el plan Pro') : setVisFor(b)) }] : []),
      ...(admin ? [{ key: 'access', icon: <TeamOutlined />, label: <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>{t('Acceso de miembros')} <Tag tone={{ l: '', bg: '#d1fae5', bd: '#a9cbc2', fg: '#059669' }} style={{ fontSize: 11, lineHeight: '18px' }}>Pro</Tag></span>, disabled: !isPro, onClick: () => (isPro ? setModal({ type: 'access', board: b, team: tc! }) : toast.info('Sumar miembros al equipo está disponible en Pro')) }] : []),
      { key: 'fav', icon: b.fav ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />, label: b.fav ? t('Quitar de favoritos') : t('Agregar a favoritos'), onClick: () => fav(b) },
      ...(admin ? [{ type: 'divider' as const }, { key: 'delete', icon: <DeleteOutlined />, label: t('Eliminar buzón'), danger: true, onClick: () => setModal({ type: 'delete', board: b }) }] : []),
      ...(guestOnly ? [{ type: 'divider' as const }, { key: 'leave', icon: <LogoutOutlined />, label: t('Salir del buzón'), danger: true, onClick: () => setModal({ type: 'leave', board: b }) }] : []),
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
            <button type="button" title={t('Acciones')} className="bx-icon-btn"><More /></button>
          </Dropdown>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag>{t(VISIBILITY[b.visibility].l)}</Tag>
          {guestOnly && <Tag tone={{ l: '', bg: '#f9f0ff', bd: '#d3adf7', fg: '#531dab' }}>{t('Invitado')}</Tag>}
          {guestOnly && <Tag>{b.team_name}</Tag>}
          {tc && tc.pro && memberN > 0 && admin && <Tag title={t('Miembros del equipo con acceso')}>{t('Equipo: {n} personas', { n: memberN + 1 })}</Tag>}
          {tc && !tc.own && <Tag tone={{ l: '', bg: '#eff6ff', bd: '#93c5fd', fg: '#3b82f6' }}>{t('Miembro')}</Tag>}
          {b.locked && <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>{t('Requiere Pro')}</Tag>}
          {b.status !== 'active' && <Tag tone={{ l: '', bg: '#fff2f0', bd: '#ffccc7', fg: '#cf1322' }}>{t('Suspendido')}</Tag>}
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.57, color: 'rgba(0,0,0,0.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 44 }}>{b.description || t('Sin descripción.')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
          <Num l={t('Ideas')} v={b.ideas} />
          <Num l={t('Miembros')} v={priv ? t('Solo Equipo') : b.guests} small={priv} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Última actividad')}</span><span style={{ fontSize: 13, lineHeight: '27px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rel(b.last_activity_at)}</span></div>
        </div>
        <button type="button" disabled={b.locked} onClick={() => router.push('/app/b/' + b.slug)}
          style={{ height: 32, borderRadius: 6, fontSize: 14, cursor: b.locked ? 'not-allowed' : 'pointer', border: '1px solid ' + (b.locked ? '#d9d9d9' : '#0F172A'), background: b.locked ? 'rgba(0,0,0,0.04)' : '#0F172A', color: b.locked ? 'rgba(0,0,0,0.25)' : '#fff' }}>
          {b.locked ? t('Requiere Pro') : t('Ver Buzón')}
        </button>
      </div>
    );
  };

  return (
    <>
      <AppHeader slogan="From idea to Product" />
      <main className="bx-main">
        <PageHead title={t('Mis Buzones de ideas')}
          sub={<>{t('Elegí un buzón para entrar.')} {ctx.account ? (ctx.account.plan === 'enterprise' ? (ctx.account.member_limit == null ? t('Plan Enterprise · equipos, buzones y miembros ilimitados.') : t('Plan Enterprise · equipos y buzones ilimitados, hasta {n} miembros por equipo.', { n: ctx.account.member_limit })) : isPro ? t('Plan Pro · equipos y buzones ilimitados.') : t('Plan Free · 1 equipo · 1 buzón.')) : ''}</>}
          right={ctx.account ? (
            <button type="button" className="bx-btn" onClick={() => (isPro ? setModal({ type: 'createTeam' }) : toast.info('Equipos ilimitados en el plan Pro'))} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              + {t('Crear equipo')}{!isPro && <WarnPill>Pro</WarnPill>}
            </button>
          ) : (
            <button type="button" className="bx-btn-primary" onClick={() => router.push('/app/onboarding')}>+ {t('Crear mi buzón')}</button>
          )} />
        {(() => {
          const sub = ctx.account?.subscription;
          if (!ctx.account || ctx.account.plan === 'free' || !sub?.cancel_at_period_end) return null;
          if (ctx.account.plan === 'enterprise') return (
            <Note tone="warn">
              {sub.current_period_end
                ? t('Cancelaste tu suscripción Enterprise. Seguís con Enterprise hasta el {date}; después tu cuenta pasa a Free y los buzones que superan el plan quedan en solo lectura.', { date: dlong(sub.current_period_end) })
                : t('Cancelaste tu suscripción Enterprise. Seguís con Enterprise hasta el fin del período pagado; después tu cuenta pasa a Free y los buzones que superan el plan quedan en solo lectura.')}{' '}
              <a onClick={() => router.push('/app/perfil?tab=sub')}>{t('Volver a Enterprise')}</a>
              <FreeBoardSelect style={{ display: 'flex', marginTop: 8, fontSize: 13 }} />
            </Note>
          );
          return (
            <Note tone="warn">
              {sub.current_period_end
                ? t('Cancelaste tu suscripción Pro. Seguís con Pro hasta el {date}; después tu cuenta pasa a Free y los buzones que superan el plan quedan en solo lectura.', { date: dlong(sub.current_period_end) })
                : t('Cancelaste tu suscripción Pro. Seguís con Pro hasta el fin del período pagado; después tu cuenta pasa a Free y los buzones que superan el plan quedan en solo lectura.')}{' '}
              <a onClick={() => router.push('/app/perfil?tab=sub')}>{t('Volver a Pro')}</a>
              <FreeBoardSelect style={{ display: 'flex', marginTop: 8, fontSize: 13 }} />
            </Note>
          );
        })()}
        {ctx.account && !isPro && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
            <span style={{ flex: 1, minWidth: 240, color: 'rgba(0,0,0,0.65)' }}>{t('Tu plan Free incluye 1 equipo con 1 buzón, solo para vos. Con Pro tenés equipos y buzones ilimitados, y hasta 4 miembros por equipo.')}</span>
            <a onClick={() => router.push('/app/perfil?tab=sub')}>{t('Ver planes')}</a>
            {allOwnBoards.length > 1 && (
              <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>
                <FreeBoardSelect style={{ fontSize: 13 }} />
                <span>{t('Los demás quedan en solo lectura. Lo podés cambiar una vez cada 30 días.')}</span>
              </div>
            )}
          </div>
        )}
        {!ctx.account && ctx.teams.length === 0 && ctx.guest_boards.length > 0 && (
          <Note>{t('Estás como Invitado en estos buzones. También podés')} <a onClick={() => router.push('/app/onboarding')}>{t('crear tu propio buzón gratis')}</a> {t('y sumar a tu comunidad.')}</Note>
        )}
        {noBoards && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{t('Todavía no tenés buzones')}</span>
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)', maxWidth: 420 }}>{t('Creá tu primer buzón para recibir ideas de tu comunidad y tu equipo. Si te invitan a un buzón, también va a aparecer acá.')}</span>
            <button type="button" className="bx-btn-primary" style={{ height: 36 }} onClick={() => router.push('/app/onboarding')}>{t('Crear mi primer buzón')}</button>
          </div>
        )}
        {!noBoards && <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="bx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar buzón')} style={{ flex: 1, minWidth: 200, maxWidth: 320 }} />
          <Seg options={[['all', t('Todos')], ['fav', t('Favoritos')]]} value={f} onChange={setF} style={{ alignSelf: 'auto' }} />
        </div>}
        {nothing && !noBoards && (
          <div style={{ background: '#fff', borderRadius: 8, padding: '48px 24px', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>
            {f === 'fav' ? t('Todavía no marcaste buzones como favoritos.') : bq ? t('No hay buzones con ese nombre.') : t('Todavía no tenés buzones.')}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {teams.map(({ t: tc, shown }) => {
            const people = [tc.owner].concat(tc.members);
            return (
              <div key={tc.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid #e8e8e8' }}>
                  <Avatar name={tc.name} color={tc.color} size={36} square style={{ opacity: tc.locked ? 0.45 : 1, fontSize: 13 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{tc.own ? t('Equipo') : t('Equipo · sos Miembro')}</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{tc.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                    {people.slice(0, 5).map((p, k) => (
                      <span key={k} title={p.name || p.email} style={{ marginLeft: k ? -6 : 0, border: '2px solid #f5f5f5', borderRadius: '50%' }}>
                        <Avatar name={p.name || p.email} id={p.id || p.user_id} url={p.avatar_url} size={26} />
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{tc.pro ? plural(people.length, 'persona', 'personas') : t('Solo vos')}</span>
                  {tc.locked && <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>{t('Requiere Pro')}</Tag>}
                  {(tc.is_admin || tc.can_create_boards) && (
                    // Phones: the actions get their own row under the team, so a long member list never pushes them around.
                    <div style={isMobile ? { flexBasis: '100%', display: 'flex', gap: 8, flexWrap: 'wrap' } : { marginLeft: 'auto', display: 'flex', gap: 12 }}>
                      {tc.is_admin && (
                        <button type="button" className="bx-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setTeamId(tc.id)}><Users />{t('Gestionar equipo')}</button>
                      )}
                      {tc.can_create_boards && (
                        <button type="button" className="bx-btn-primary" onClick={() => (tc.locked ? toast.info('Este equipo requiere el plan Pro') : openCreate(tc.id))}>+ {t('Crear Buzón')}</button>
                      )}
                    </div>
                  )}
                </div>
                {shown.length === 0 && (
                  <div style={{ background: '#fff', borderRadius: 8, padding: '32px 24px', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>
                    {tc.boards.length ? t('Ningún buzón de este equipo coincide con el filtro.') : t('Este equipo todavía no tiene buzones.')}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 16 }}>{shown.map((b) => card(b, tc))}</div>
              </div>
            );
          })}
          {guests.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid #e8e8e8' }}>
                <span style={{ width: 36, height: 36, borderRadius: 8, background: '#f9f0ff', color: '#531dab', display: 'grid', placeItems: 'center' }}><Users /></span>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Invitado')}</span>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{t('Buzones donde participás')}</span>
                </div>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Podés proponer ideas, votar y comentar.')}</span>
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
  const { t, plural } = useI18n();
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

  const kind = modal?.type;
  const exec = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(true);
    try { await fn(); toast.ok(ok); await refresh(); onClose(); after?.(); } catch (e) { toast.err(e); } finally { setBusy(false); }
  };
  const nameErr = tried && !input.trim() ? t('El nombre es obligatorio') : '';

  let title = '', text: React.ReactNode = '', body: React.ReactNode = null, okL = '', ok: (() => void) | null = null, danger = false, cancelL = t('Cancelar');
  if (kind === 'create') {
    const teamPro = !!ownTeams.find((x) => x.id === team)?.pro;
    title = t('Crear buzón');
    text = t(VISIBILITY[vis].d) + ' ' + t('Todos los miembros del equipo tienen acceso.');
    body = (
      <>
        <input className={'bx-input' + (nameErr ? ' err' : '')} autoFocus maxLength={60} placeholder={t('Nombre del buzón')} value={input} onChange={(e) => setInput(e.target.value)} />
        <Choice options={VISIBILITY_ORDER.map((k) => [k, t(VISIBILITY[k].l)] as [Visibility, string])} value={vis} onChange={(v) => (v === 'private' && !teamPro ? toast.info('Los buzones privados están disponibles en Pro.') : setVis(v))} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Quiénes pueden crear ideas')}</span>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('El dueño del equipo y vos siempre pueden. Todos pueden votar y comentar.')}</span>
          </div>
          {teamPro && <ToggleRow label={t('Miembros del equipo')} on={membersIdeas} onChange={setMembersIdeas} />}
          {vis !== 'private' ? <ToggleRow label={t('Invitados')} desc={vis === 'invite' ? t('Las personas que invites a este buzón.') : t('La Comunidad que se suma con el link o por invitación.')} on={guestsIdeas} onChange={setGuestsIdeas} />
            : <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Los buzones privados no admiten invitados.')}</span>}
          {!teamPro && vis !== 'private' && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Con Pro también podés decidir si tus miembros cargan ideas.')}</span>}
        </div>
        {ownTeams.length > 1 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('Equipo')}
            <select className="bx-select" value={team} onChange={(e) => setTeam(e.target.value)}>{ownTeams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
        )}
      </>
    );
    okL = t('Crear buzón');
    ok = () => { setTried(true); if (!input.trim()) return; setBusy(true); rpc<{ slug: string }>('create_board', { p_team: team, p_name: input, p_visibility: vis, p_members_ideas: membersIdeas, p_guests_ideas: guestsIdeas }).then(async (r) => { toast.ok('Buzón creado'); await refresh(); onClose(); router.push('/app/b/' + r.slug + '/config'); }).catch((e) => toast.err(e)).finally(() => setBusy(false)); };
  } else if (kind === 'createTeam') {
    title = t('Crear equipo');
    text = ctx?.account?.plan === 'enterprise' && ctx.account.member_limit == null ? t('Cada equipo tiene sus propios buzones y miembros ilimitados.') : t('Cada equipo tiene sus propios buzones y hasta {n} miembros además de vos.', { n: ctx?.account?.member_limit ?? MAX_MEMBERS });
    body = (
      <>
        <input className={'bx-input' + (nameErr ? ' err' : '')} autoFocus maxLength={60} placeholder={t('Nombre del equipo')} value={input} onChange={(e) => setInput(e.target.value)} />
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px' }}>
          <ToggleRow label={t('Los miembros pueden crear buzones')} desc={t('Si lo activás, los miembros que invites pueden crear buzones en este equipo y cargar ideas en ellos.')} on={memberBoards} onChange={setMemberBoards} />
        </div>
      </>
    );
    okL = t('Crear equipo');
    ok = () => { setTried(true); if (!input.trim()) return; setBusy(true); rpc<string>('create_team', { p_name: input, p_members_create_boards: memberBoards }).then(async (id) => { toast.ok('Equipo creado'); await refresh(); onOpenTeam(id); }).catch((e) => toast.err(e)).finally(() => setBusy(false)); };
  } else if (kind === 'rename' && modal?.type === 'rename') {
    title = t('Cambiar nombre');
    text = t('El nombre se ve en el header del buzón y en las invitaciones. La URL no cambia.');
    body = <input className={'bx-input' + (nameErr ? ' err' : '')} autoFocus maxLength={60} placeholder={t('Nombre del buzón')} value={input} onChange={(e) => setInput(e.target.value)} />;
    okL = t('Guardar');
    ok = () => { setTried(true); if (input.trim()) exec(() => rpc('update_board', { p_board: modal.board.id, p_name: input }), 'Nombre actualizado'); };
  } else if (kind === 'renameTeam' && modal?.type === 'renameTeam') {
    title = t('Cambiar nombre del equipo');
    text = t('El nombre del equipo se ve en Mis Buzones y en las invitaciones.');
    body = <input className={'bx-input' + (nameErr ? ' err' : '')} autoFocus maxLength={60} placeholder={t('Nombre del equipo')} value={input} onChange={(e) => setInput(e.target.value)} />;
    okL = t('Guardar');
    ok = () => { setTried(true); if (input.trim()) exec(() => rpc('rename_team', { p_team: modal.team.id, p_name: input }), 'Nombre del equipo actualizado'); };
  } else if (kind === 'delete' && modal?.type === 'delete') {
    const b = modal.board, match = input.trim() === b.name;
    title = t('Eliminar buzón');
    text = t('Se eliminan {ideas} con sus votos y comentarios. Esta acción no se puede deshacer. Escribí "{name}" para confirmar.', { ideas: plural(b.ideas, 'idea', 'ideas'), name: b.name });
    body = (
      <>
        <input className={'bx-input' + (tried && !match ? ' err' : '')} autoFocus maxLength={60} placeholder={b.name} value={input} onChange={(e) => setInput(e.target.value)} />
        {tried && !match && <span style={{ fontSize: 13, color: '#ff4d4f' }}>{t('El nombre no coincide')}</span>}
      </>
    );
    okL = t('Eliminar'); danger = true;
    ok = () => { setTried(true); if (match) exec(() => rpc('delete_board', { p_board: b.id, p_confirm: input.trim() }), 'Buzón eliminado'); };
  } else if (kind === 'leave' && modal?.type === 'leave') {
    const b = modal.board;
    title = t('Salir del buzón');
    text = b.visibility === 'public'
      ? t('Dejás de ser parte de la Comunidad de {name} y deja de aparecer en Mis Buzones. Tus ideas y comentarios quedan publicados. Podés volver a sumarte con el link.', { name: b.name })
      : t('Dejás de ver {name} y deja de aparecer en Mis Buzones. Tus ideas y comentarios quedan publicados. Para volver, te tienen que invitar de nuevo o podés pedir acceso.', { name: b.name });
    okL = t('Salir'); danger = true;
    ok = () => exec(() => rpc('leave_board', { p_board: b.id }), t('Saliste de {name}', { name: b.name }));
  } else if (kind === 'guests' && modal?.type === 'guests') {
    const b = modal.board;
    const inv = b.visibility === 'invite';
    title = inv ? t('Invitar personas') : t('Compartir link a invitados');
    text = inv
      ? (isPro ? t('Invitá por email a quienes quieras sumar a {name}. El link solo funciona para las personas invitadas; quien no lo esté puede solicitar acceso y vos decidís.', { name: b.name }) : t('Invitá por email a quienes quieras sumar a {name}. El link solo funciona para las personas invitadas.', { name: b.name }))
      : t('Quien se registre desde este link queda como Comunidad de {name}. También podés enviarlo por email.', { name: b.name });
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 4px 4px 11px', background: '#fafafa' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl(b.slug)}</span>
          <a style={{ padding: '4px 10px' }} onClick={() => { navigator.clipboard?.writeText(boardUrl(b.slug) + '?unirme=1').catch(() => {}); toast.ok('Link de invitación copiado'); }}>{t('Copiar')}</a>
        </div>
        <EmailChips value={emails} onChange={setEmails} onInvalid={(e) => toast.info(t('Email inválido: {email}', { email: e }))} />
      </>
    );
    okL = t('Enviar invitaciones');
    ok = () => {
      if (!emails.length) return toast.info('Agregá al menos un email');
      exec(async () => { await rpc('invite_guests', { p_board: b.id, p_emails: emails }); flushEmails(); }, emails.length === 1 ? t('Invitación enviada') : t('{n} invitaciones enviadas', { n: emails.length }));
    };
  } else if (kind === 'access' && modal?.type === 'access') {
    const { board: b, team: tm } = modal;
    title = t('Acceso de miembros');
    text = t('Los miembros de {team} ven todos los buzones del equipo. Podés quitarle el acceso a {board} a un miembro específico.', { team: tm.name, board: b.name });
    cancelL = t('Listo');
    body = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MemberRow name={tm.owner.name} email={tm.owner.email} id={tm.owner.id} status={t('Admin')} />
          {tm.members.map((m) => {
            const on = access ? access[m.user_id!] !== false : true;
            return (
              <MemberRow key={m.user_id} name={m.name} email={m.email} id={m.user_id} status={on ? t('Con acceso') : t('Sin acceso')} warn={!on}
                toggle={access ? { on, onClick: async () => {
                  setAccess({ ...access, [m.user_id!]: !on });
                  try { await rpc('set_board_access', { p_board: b.id, p_user: m.user_id, p_has: !on }); toast.ok(on ? t('{name} ya no ve {board}', { name: m.name, board: b.name }) : t('{name} vuelve a ver {board}', { name: m.name, board: b.name })); refresh(); }
                  catch (e) { setAccess({ ...access }); toast.err(e); }
                } } : undefined} />
            );
          })}
          {tm.pending.map((p) => <MemberRow key={p.id} name={p.email} email={p.email} status={t('Invitación pendiente')} warn />)}
        </div>
        <a onClick={() => onOpenTeam(tm.id)} style={{ fontSize: 14 }}>{tm.members.length ? t('Gestionar equipo') : t('Invitar miembros al equipo')}</a>
      </>
    );
  }

  return (
    <Modal open={!!modal} onCancel={onClose} title={title} width={460} destroyOnHidden footer={null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>{text}</span>
        {body}
        {nameErr && kind !== 'delete' && <span style={{ fontSize: 13, color: '#ff4d4f' }}>{nameErr}</span>}
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

