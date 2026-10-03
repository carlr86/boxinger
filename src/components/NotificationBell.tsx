'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dropdown, Tooltip } from 'antd';
import { rpc } from '@/lib/rpc';
import { useSession } from '@/components/Providers';
import { IDEA_STATUS, SHADOW_POP } from '@/lib/constants';
import { rel } from '@/lib/format';

type P = Record<string, string | number | boolean | null | undefined>;
type Notice = { id: number; kind: string; payload: P; created_at: string; read: boolean };

const Bell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M6 9a6 6 0 1112 0c0 4.5 1.5 6 2 7H4c.5-1 2-2.5 2-7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M10 19.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const s = (v: unknown) => (v == null ? '' : String(v));
const B = ({ children }: { children: React.ReactNode }) => <b style={{ fontWeight: 600 }}>{children}</b>;

/** What each notice says and where it leads. */
function describe(n: Notice): { text: React.ReactNode; href: string } {
  const p = n.payload;
  const board = '/app/b/' + s(p.slug);
  const idea = board + '/idea/' + s(p.idea_id);
  switch (n.kind) {
    case 'access_request':
      return {
        text: <><B>{s(p.name)}</B> pidió acceso a <B>{s(p.board_name)}</B>{p.resolved ? (p.resolved === 'approved' ? ' · aprobada' : ' · rechazada') : ''}</>,
        href: board + '/config?seccion=comunidad',
      };
    case 'access_granted':
      return { text: <>Ya tenés acceso a <B>{s(p.board_name)}</B></>, href: board };
    case 'new_idea':
      return { text: <><B>{s(p.author)}</B> cargó una idea nueva: <B>{s(p.title)}</B></>, href: idea };
    case 'new_comment':
      return { text: <><B>{s(p.author)}</B> comentó tu idea <B>{s(p.title)}</B></>, href: idea };
    case 'team_reply':
      return { text: <>El Equipo respondió tu comentario en <B>{s(p.title)}</B></>, href: idea };
    case 'idea_status':
      return { text: <>Tu idea <B>{s(p.title)}</B> pasó a <B>{IDEA_STATUS[s(p.to)]?.l || s(p.to)}</B></>, href: idea };
    case 'idea_launched':
      return { text: <>Se lanzó <B>{s(p.title)}</B>{p.mine ? ', tu idea' : ', una idea que votaste'}</>, href: idea };
    default:
      return { text: s(p.title || p.board_name || 'Novedad'), href: board };
  }
}

/** The bell: unread count, and the latest notices of all the person's boards. */
export function NotificationBell() {
  const router = useRouter();
  const { ctx, setCtx } = useSession();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Notice[] | null>(null);
  const unread = ctx?.unread_notifications || 0;
  const setUnread = useCallback((n: number) => setCtx((c) => (c && c.unread_notifications !== n ? { ...c, unread_notifications: n } : c)), [setCtx]);

  // Keep the count fresh while the tab is visible.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') rpc<number>('notifications_unread').then(setUnread).catch(() => {}); };
    const t = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [setUnread]);

  useEffect(() => {
    if (!open) return;
    rpc<Notice[]>('get_notifications', { p_limit: 30 }).then(setList).catch(() => setList([]));
  }, [open]);

  async function markAll() {
    setList((l) => l?.map((n) => ({ ...n, read: true })) ?? l);
    setUnread(0);
    await rpc('mark_notifications_read', { p_ids: null }).catch(() => {});
  }
  async function clearAll() {
    setList([]);
    setUnread(0);
    await rpc('delete_notifications', { p_ids: null }).catch(() => {});
  }
  async function remove(n: Notice) {
    setList((l) => l?.filter((x) => x.id !== n.id) ?? l);
    if (!n.read) setUnread(Math.max(0, unread - 1));
    await rpc('delete_notifications', { p_ids: [n.id] }).catch(() => {});
  }
  async function go(n: Notice, href: string) {
    setOpen(false);
    if (!n.read) {
      setList((l) => l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? l);
      setUnread(Math.max(0, unread - 1));
      rpc('mark_notifications_read', { p_ids: [n.id] }).catch(() => {});
    }
    router.push(href);
  }

  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} placement="bottomRight"
      popupRender={() => (
        <div style={{ width: 360, maxWidth: 'calc(100vw - 24px)', background: '#fff', borderRadius: 8, boxShadow: SHADOW_POP, display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Notificaciones</span>
            {!!list?.length && (
              <span style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                {list.some((n) => !n.read) && <a onClick={markAll} style={{ color: '#059669' }}>Marcar como leídas</a>}
                <Tooltip title="Vaciar notificaciones">
                  <button type="button" aria-label="Vaciar notificaciones" onClick={clearAll} className="bx-icon-btn bx-icon-danger" style={{ width: 28, height: 28 }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2.5 4h11M6.5 4V2.7h3V4M4 4l.7 9.3h6.6L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M6.7 6.6v4.4M9.3 6.6v4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                  </button>
                </Tooltip>
              </span>
            )}
          </div>
          <div style={{ overflowY: 'auto' }}>
            {list === null && <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Cargando…</div>}
            {list && list.length === 0 && (
              <div style={{ padding: '36px 24px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#f0fdf6', color: '#059669', display: 'grid', placeItems: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 9a6 6 0 1112 0c0 4.5 1.5 6 2 7H4c.5-1 2-2.5 2-7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 19.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(0,0,0,0.85)' }}>Estás al día</span>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', maxWidth: 260 }}>Acá te avisamos cuando haya ideas nuevas, comentarios, cambios de estado o solicitudes de acceso.</span>
              </div>
            )}
            {list?.map((n) => {
              const { text, href } = describe(n);
              return (
                <div key={n.id} className="bx-item" onClick={() => go(n, href)}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 0, background: n.read ? undefined : '#f6fffb', borderBottom: '1px solid #f5f5f5' }}>
                  <span aria-hidden style={{ flex: 'none', width: 8, height: 8, marginTop: 7, borderRadius: '50%', background: n.read ? 'transparent' : '#059669' }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(0,0,0,0.85)', overflowWrap: 'anywhere' }}>{text}</span>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{s(n.payload.board_name)}{n.payload.board_name ? ' · ' : ''}{rel(n.created_at)}</span>
                  </div>
                  <button type="button" aria-label="Eliminar notificación" title="Eliminar" className="bx-notif-del"
                    onClick={(e) => { e.stopPropagation(); remove(n); }}
                    style={{ flex: 'none', width: 24, height: 24, border: 0, borderRadius: 4, background: 'transparent', color: 'rgba(0,0,0,0.35)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}>
      <button type="button" title={unread ? `Notificaciones · ${unread} sin leer` : 'Notificaciones'} aria-label="Notificaciones" className="bx-icon-btn"
        style={{ position: 'relative', width: 32, height: 32, color: open ? '#059669' : 'rgba(0,0,0,0.65)' }}>
        <Bell />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#ff4d4f', color: '#fff', fontSize: 10, fontWeight: 600, lineHeight: '16px', textAlign: 'center' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </Dropdown>
  );
}
