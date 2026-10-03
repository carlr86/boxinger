'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'antd';
import { BellOutlined, CreditCardOutlined, DashboardOutlined, InboxOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useSession, useToast } from '@/components/Providers';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Avatar } from '@/components/ui';
import { Logo } from '@/components/SimpleHeader';
import { NotificationBell } from '@/components/NotificationBell';
import { planTone, SHADOW_POP } from '@/lib/constants';
import type { BoardCard } from '@/lib/types';

const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);
const Gear = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" strokeWidth="1.8" /></svg>
);
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M3 8.5l3 3 7-7" fill="none" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export type HeaderBoard = { id: string; name: string; color: string; isTeam: boolean };
export type HeaderTab = { key: string; label: string };

export function AppHeader({ board, tabs, view, onTab, onConfig, loginNext, slogan }: {
  board?: HeaderBoard;
  slogan?: string;
  tabs?: HeaderTab[];
  view?: string;
  onTab?: (k: string) => void;
  onConfig?: () => void;
  loginNext?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { ctx, setCtx } = useSession();
  const me = ctx?.me;
  const isPro = !!ctx?.account?.pro;
  const hasBoards = !!ctx && (ctx.teams.length > 0 || ctx.guest_boards.length > 0);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    setCtx(null);
    toast.ok('Cerraste sesión');
    router.push('/');
    router.refresh();
  }

  // Phones: the tab strip scrolls sideways; keep the current tab in view.
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = tabsRef.current, on = nav?.querySelector<HTMLElement>('.bx-tab.on');
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  }, [view]);

  const goHome = () => router.push(ctx ? (hasBoards ? '/app/buzones' : '/app') : '/');

  return (
    <header className="bx-appheader" style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 64, position: 'sticky', top: 0, zIndex: 20 }}>
      <div className="bx-ah-brand" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, minWidth: 0 }}>
        <a onClick={goHome} title={hasBoards ? 'Mis Buzones' : 'Inicio'} style={{ color: 'inherit' }}><Logo compactOnMobile={!!board} /></a>
        {slogan && !board && (
          <span className="bx-hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 1, height: 20, background: '#e8e8e8' }} />
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)', whiteSpace: 'nowrap' }}>{slogan}</span>
          </span>
        )}
        {board && (
          <>
            <span style={{ width: 1, height: 20, background: '#f0f0f0' }} />
            {ctx ? <BoardSwitcher current={board} /> : (
              <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.name}</span>
            )}
          </>
        )}
      </div>
      {tabs && tabs.length > 0 ? (
        <nav ref={tabsRef} className="bx-ah-tabs" style={{ display: 'flex', gap: 2, alignSelf: 'stretch', flex: '1 1 auto', minWidth: 'max-content' }}>
          {tabs.map((t) => (
            <a key={t.key} onClick={() => onTab?.(t.key)} className={'bx-tab' + (view === t.key ? ' on' : '')}>{t.label}</a>
          ))}
        </nav>
      ) : <div style={{ flex: 1 }} />}
      <div className="bx-ah-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', marginLeft: 'auto' }}>
        {onConfig && (
          <button type="button" onClick={onConfig} title="Configuración del buzón" className="bx-icon-btn"
            style={{ width: 32, height: 32, color: view === 'config' ? '#059669' : 'rgba(0,0,0,0.65)' }}>
            <Gear />
          </button>
        )}
        {me && <NotificationBell />}
        {me ? (
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            popupRender={() => (
              <div style={{ width: 260, background: '#fff', borderRadius: 8, padding: 4, boxShadow: SHADOW_POP }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px 12px', borderBottom: '1px solid #f0f0f0', marginBottom: 4 }}>
                  <Avatar name={me.name} id={me.id} url={me.avatar_url} size={40} />
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{me.name}</span>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.email}</span>
                    {(() => { const t = planTone(ctx?.account?.plan); return <span style={{ alignSelf: 'flex-start', fontSize: 12, lineHeight: '18px', padding: '0 6px', borderRadius: 4, border: '1px solid ' + t.bd, background: t.bg, color: t.fg }}>Plan {t.l}</span>; })()}
                  </div>
                </div>
                {hasBoards && <Link className="bx-item" style={menuLink} href="/app/buzones"><InboxOutlined style={menuIcon} />Mis Buzones</Link>}
                <Link className="bx-item" style={menuLink} href="/app/perfil"><UserOutlined style={menuIcon} />Mi perfil</Link>
                <Link className="bx-item" style={menuLink} href="/app/perfil?tab=notif"><BellOutlined style={menuIcon} />Notificaciones</Link>
                <Link className="bx-item" style={menuLink} href="/app/perfil?tab=sub"><CreditCardOutlined style={menuIcon} />Suscripción</Link>
                {me.is_super_admin && <Link className="bx-item" style={menuLink} href="/app/admin"><DashboardOutlined style={menuIcon} />Panel de Admin</Link>}
                <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
                <div className="bx-item" style={{ ...menuLink, color: '#cf1322' }} onClick={logout}><LogoutOutlined style={menuIcon} />Cerrar sesión</div>
              </div>
            )}
          >
            <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 8, border: 0, background: 'transparent', cursor: 'pointer', padding: '4px 6px 4px 4px', borderRadius: 6, fontSize: 14, color: 'rgba(0,0,0,0.88)' }}>
              <Avatar name={me.name} id={me.id} url={me.avatar_url} size={32} />
              <span className="bx-hide-mobile" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</span>
              <Chevron />
            </button>
          </Dropdown>
        ) : (
          <button type="button" className="bx-btn" onClick={() => router.push('/app/ingresar?next=' + encodeURIComponent(loginNext || '/app'))}>Ingresar</button>
        )}
      </div>
    </header>
  );
}

const menuLink: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(0,0,0,0.88)' };
const menuIcon: React.CSSProperties = { fontSize: 15, width: 16, flex: 'none' };

function BoardSwitcher({ current }: { current: HeaderBoard }) {
  const router = useRouter();
  const toast = useToast();
  const { ctx } = useSession();
  const [open, setOpen] = useState(false);
  if (!ctx) return null;
  const isPro = !!ctx.account?.pro;
  const groups: { name: string; boards: BoardCard[] }[] = ctx.teams.filter((t) => t.boards.length).map((t) => ({ name: t.name, boards: t.boards }));
  if (ctx.guest_boards.length) groups.push({ name: 'Invitado', boards: ctx.guest_boards });
  const unlocked = ctx.teams.flatMap((t) => t.boards).filter((b) => !b.locked);
  const go = (path: string) => { setOpen(false); router.push(path); };

  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} placement="bottomLeft"
      popupRender={() => (
        <div style={{ width: 280, background: '#fff', borderRadius: 8, padding: 4, boxShadow: SHADOW_POP, maxHeight: '70vh', overflowY: 'auto' }}>
          {groups.map((g) => (
            <div key={g.name}>
              <div style={{ padding: '8px 12px 4px', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{g.name}</div>
              {g.boards.map((b) => {
                const active = b.id === current.id;
                return (
                  <div key={b.id} className="bx-item" title={b.locked ? 'Requiere el plan Pro' : ''}
                    onClick={() => (b.locked ? toast.info('Este buzón requiere el plan Pro') : active ? setOpen(false) : go('/app/b/' + b.slug))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: b.locked ? 'not-allowed' : 'pointer', background: active ? '#d1fae5' : undefined, color: b.locked ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.88)' }}>
                    <Avatar name={b.name} color={b.color} size={22} square style={{ opacity: b.locked ? 0.45 : 1 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    {b.locked && <span style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', borderRadius: 4, border: '1px solid #ffe58f', background: '#fffbe6', color: '#d48806' }}>Pro</span>}
                    {active && <Check />}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
          {ctx.account && (!isPro && unlocked.length <= 1 ? (
            <div style={{ margin: 4, padding: 12, borderRadius: 6, background: '#d1fae5', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#1f4a41' }}>Creá más buzones <span style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', borderRadius: 4, border: '1px solid #a9cbc2', background: '#fff', color: '#059669', fontWeight: 400 }}>Pro</span></span>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>Con Pro tenés equipos y buzones ilimitados, y hasta 4 miembros por equipo.</span>
              <button type="button" className="bx-btn-primary" style={{ height: 28, fontSize: 13 }} onClick={() => go('/app/perfil?tab=sub')}>Pasar a Pro</button>
            </div>
          ) : (
            <div className="bx-item" style={{ color: '#059669' }} onClick={() => go('/app/buzones?crear=1')}>+ Crear Buzón</div>
          ))}
          {!ctx.account && <div className="bx-item" style={{ color: '#059669' }} onClick={() => go('/app/onboarding')}>+ Crear mi propio buzón</div>}
          <div className="bx-item" onClick={() => go('/app/buzones')}>Ver todos mis buzones</div>
        </div>
      )}>
      <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid ' + (open ? '#059669' : '#d9d9d9'), background: '#fff', cursor: 'pointer', fontSize: 14, color: 'rgba(0,0,0,0.88)', maxWidth: 240, minWidth: 0 }}>
        <Avatar name={current.name} color={current.color} size={18} square style={{ fontSize: 10 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</span>
        <Chevron />
      </button>
    </Dropdown>
  );
}
