'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Popconfirm } from 'antd';
import { rpc } from '@/lib/rpc';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useSession, useToast } from '@/components/Providers';
import { Avatar, Seg, Tag } from '@/components/ui';
import { useGridCols } from '@/components/board/IdeaGrid';
import { BAD, OK, PRO_TAG, planTone, type Tone } from '@/lib/constants';
import { ddmmyyyy, money, rel } from '@/lib/format';
import { boardUrl } from '@/lib/env';
import { adminSendActivation, adminUpdateSubscription } from '@/app/app/admin/actions';
import { Table, type Col, type MenuItems } from './Table';
import { Dashboard } from './Dashboard';
import { ErrorsPage, type ErrorsData } from './Errors';
import { AdminBoardDrawer, ClientDrawer, EditSubscriptionModal, NewClientModal, SchedulePriceModal } from './AdminModals';
import type { AdminBoard, AdminUser, Client, Prices } from './types';

type Tab = 'dashboard' | 'clientes' | 'boards' | 'suscripciones' | 'usuarios' | 'errores' | 'perfil';
const TABS: [Tab, string][] = [['dashboard', 'Dashboard'], ['clientes', 'Clientes'], ['boards', 'Buzones'], ['suscripciones', 'Suscripciones'], ['usuarios', 'Usuarios'], ['errores', 'Errores']];
const TITLE: Record<Tab, string> = { dashboard: 'Dashboard', clientes: 'Clientes', boards: 'Buzones', suscripciones: 'Suscripciones', usuarios: 'Usuarios', errores: 'Errores', perfil: 'Mi perfil' };
const PROVIDER_L: Record<string, string> = { paypal: 'PayPal', mercadopago: 'Mercado Pago', lemonsqueezy: 'Lemon Squeezy', creem: 'Creem', manual: 'Manual' };
const sec = 'rgba(0,0,0,0.45)';
const planTag = (p: string) => <Tag tone={planTone(p)}>{p}</Tag>;
const planRank = (p: string) => ({ Free: 0, Pro: 1, Enterprise: 2 } as Record<string, number>)[p] ?? 0;
const statusTag = (ok: boolean, okL = 'Activa', badL = 'Suspendida') => <Tag tone={ok ? OK : BAD}>{ok ? okL : badL}</Tag>;

export function AdminApp() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { ctx, setCtx } = useSession();
  const { isMobile } = useGridCols();
  const [tab, setTab] = useState<Tab>(((TABS.map((t) => t[0]) as string[]).concat('perfil').includes(sp.get('tab') || '') ? sp.get('tab') : 'dashboard') as Tab);
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');
  const [clients, setClients] = useState<Client[] | null>(null);
  const [boards, setBoards] = useState<AdminBoard[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [openErrors, setOpenErrors] = useState(0);
  useEffect(() => { rpc<ErrorsData>('admin_errors', { p_limit: 1 }).then((r) => setOpenErrors(r.open)).catch(() => {}); }, []);
  const [clientId, setClientId] = useState<string | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [editSub, setEditSub] = useState<Client | null>(null);
  const [newClient, setNewClient] = useState(false);
  const [pp, setPp] = useState<'USD' | 'ARS' | null>(null);

  const load = useCallback(async (t: Tab) => {
    try {
      if (t === 'clientes' || t === 'suscripciones') setClients(await rpc<Client[]>('admin_clients'));
      if (t === 'suscripciones' || t === 'dashboard' || t === 'clientes') setPrices(await rpc<Prices>('admin_prices'));
      if (t === 'boards') setBoards(await rpc<AdminBoard[]>('admin_boards'));
      if (t === 'usuarios') setUsers(await rpc<AdminUser[]>('admin_users'));
    } catch (e) { toast.err(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(tab); }, [tab, load]);
  const go = (t: Tab) => { setTab(t); setQ(''); router.replace('/app/admin' + (t === 'dashboard' ? '' : '?tab=' + t)); };
  const reloadAll = () => load(tab);

  const match = (...xs: (string | null | undefined)[]) => !q.trim() || xs.join(' ').toLowerCase().includes(q.trim().toLowerCase());
  const act = async (p: Promise<unknown>, ok: string) => { try { await p; toast.ok(ok); reloadAll(); } catch (e) { toast.err(e); } };
  const setPlan = async (c: Client, plan: 'free' | 'pro' | 'enterprise') => {
    const r = await adminUpdateSubscription({ account: c.account_id, plan, dealType: null, value: null, until: null, note: '', notify: false });
    if (!r.ok) return toast.err(new Error(r.error));
    if (r.data.warning) toast.info(r.data.warning);
    toast.ok(plan === 'enterprise' ? 'Cuenta pasada a Enterprise' : 'Plan actualizado manualmente'); reloadAll();
  };
  const suspendItem = (c: Client): MenuItems[number] => ({
    key: 'st', danger: c.status === 'active', label: c.status === 'active' ? 'Suspender cuenta' : 'Reactivar cuenta',
    onClick: () => act(rpc('admin_set_account_status', { p_account: c.account_id, p_status: c.status === 'active' ? 'suspended' : 'active' }), c.status === 'active' ? 'Cuenta suspendida · queda en solo lectura' : 'Cuenta reactivada'),
  });
  const clientStatus = (c: Client) => {
    if (c.status !== 'active') return <Tag tone={BAD}>Suspendida</Tag>;
    if (!c.activated) return <Tag tone={c.invite === 'sent' ? ({ l: '', bg: '#e6f4ff', bd: '#91caff', fg: '#0958d9' } as Tone) : ({ l: '', bg: '#fafafa', bd: '#d9d9d9', fg: 'rgba(0,0,0,0.65)' } as Tone)}>{c.invite === 'sent' ? 'Acceso enviado' : 'Sin acceso'}</Tag>;
    return <Tag tone={OK}>Activa</Tag>;
  };
  const priceCell = (c: Client) => c.plan === 'Enterprise' ? <span style={{ color: '#4338ca' }}>A medida</span> : c.plan !== 'Pro' ? '—' : <span style={{ color: c.deal_type ? '#d46b08' : undefined }}>{money(c.currency, Number(c.amount))}{c.deal_type ? (c.deal_type === 'fixed' ? ' · exclusivo' : ' · −' + c.deal_value + '%') : ''}</span>;

  const clientCols: Col<Client>[] = [
    { key: 'name', title: 'Nombre', width: '1.2fr', sort: (c) => c.name, render: (c) => <a onClick={() => setClientId(c.account_id)}>{c.name}</a> },
    { key: 'email', title: 'Email', width: '1.6fr', render: (c) => <span style={{ color: sec }}>{c.email}</span> },
    { key: 'alta', title: 'Alta', width: '110px', sort: (c) => +new Date(c.created_at), render: (c) => ddmmyyyy(c.created_at) },
    { key: 'plan', title: 'Plan', width: '120px', sort: (c) => planRank(c.plan), render: (c) => planTag(c.plan) },
    { key: 'boards', title: 'Buzones', width: '100px', sort: (c) => c.boards, render: (c) => <a onClick={() => setClientId(c.account_id)}>{c.boards}</a> },
    { key: 'login', title: 'Acceso', width: '120px', render: (c) => <span style={{ color: sec }}>{c.login}</span> },
    { key: 'act', title: 'Última actividad', width: '150px', sort: (c) => +new Date(c.last_activity_at), render: (c) => <span style={{ color: sec }}>{c.activated ? rel(c.last_activity_at) : 'Sin actividad'}</span> },
    { key: 'st', title: 'Estado', width: '130px', sort: (c) => (c.status === 'active' ? 1 : 0), render: clientStatus },
  ];
  const clientMenu = (c: Client): MenuItems => [
    { key: 'd', label: 'Ver detalle', onClick: () => setClientId(c.account_id) },
    ...(!c.activated ? [{ key: 'acc', label: c.invite === 'sent' ? 'Reenviar acceso' : 'Enviar acceso', onClick: async () => { const r = await adminSendActivation(c.account_id, true); if (r.ok) { toast.ok((c.invite === 'sent' ? 'Acceso reenviado a ' : 'Acceso enviado a ') + c.email); reloadAll(); } else toast.err(new Error(r.error)); } }] : []),
    { key: 'mail', label: <a href={'mailto:' + c.email}>Contactar</a> },
    ...(['free', 'pro', 'enterprise'] as const).filter((k) => k !== c.plan.toLowerCase()).map((k) => ({ key: 'plan-' + k, label: 'Cambiar a ' + { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' }[k], onClick: () => setPlan(c, k) })),
    { type: 'divider' },
    suspendItem(c),
  ];

  const boardCols: Col<AdminBoard>[] = [
    { key: 'name', title: 'Nombre', width: '1.1fr', sort: (b) => b.name, render: (b) => <a onClick={() => setBoardId(b.board_id)}>{b.name}</a> },
    { key: 'owner', title: 'Dueño', width: '1.1fr', sort: (b) => b.owner_name, render: (b) => b.owner_name },
    { key: 'plan', title: 'Plan', width: '120px', sort: (b) => planRank(b.plan), render: (b) => planTag(b.plan) },
    { key: 'url', title: 'URL', width: '1.4fr', render: (b) => <span style={{ color: sec, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12 }}>/app/b/{b.slug}</span> },
    { key: 'ideas', title: 'Ideas', width: '80px', sort: (b) => b.ideas, render: (b) => b.ideas },
    { key: 'guests', title: 'Miembros', width: '100px', sort: (b) => b.guests, render: (b) => (b.visibility === 'private' ? <span style={{ color: sec }}>Privado</span> : b.guests) },
    { key: 'act', title: 'Última actividad', width: '150px', sort: (b) => +new Date(b.last_activity_at), render: (b) => <span style={{ color: sec }}>{rel(b.last_activity_at)}</span> },
    { key: 'st', title: 'Estado', width: '110px', sort: (b) => (b.status === 'active' ? 1 : 0), render: (b) => statusTag(b.status === 'active', 'Activo', 'Suspendido') },
  ];
  const boardMenu = (b: AdminBoard): MenuItems => [
    { key: 'd', label: 'Ver detalle', onClick: () => setBoardId(b.board_id) },
    { key: 'copy', label: 'Copiar link', onClick: () => { navigator.clipboard?.writeText(boardUrl(b.slug)).catch(() => {}); toast.ok('Link del buzón copiado'); } },
    { key: 'open', label: <a href={'/app/b/' + b.slug} target="_blank" rel="noreferrer">Ver buzón</a> },
    { key: 'mail', label: <a href={'mailto:' + b.owner_email}>Contactar al dueño</a> },
    { type: 'divider' },
    { key: 'st', danger: b.status === 'active', label: b.status === 'active' ? 'Suspender buzón' : 'Reactivar buzón', onClick: () => act(rpc('admin_set_board_status', { p_board: b.board_id, p_status: b.status === 'active' ? 'suspended' : 'active' }), b.status === 'active' ? 'Buzón suspendido · queda en solo lectura' : 'Buzón reactivado') },
  ];

  const subCols: Col<Client>[] = [
    { key: 'name', title: 'Cuenta', width: '1.2fr', sort: (c) => c.name, render: (c) => <a onClick={() => setClientId(c.account_id)}>{c.name}</a> },
    { key: 'email', title: 'Email', width: '1.4fr', render: (c) => <span style={{ color: sec }}>{c.email}</span> },
    { key: 'plan', title: 'Plan', width: '120px', sort: (c) => planRank(c.plan), render: (c) => planTag(c.plan) },
    { key: 'precio', title: 'Precio', width: '170px', sort: (c) => (c.plan === 'Pro' ? Number(c.amount) * (c.currency === 'ARS' ? 0.001 : 1) : 0), render: priceCell },
    { key: 'prov', title: 'Cobro', width: '120px', render: (c) => <span style={{ color: sec }}>{c.plan === 'Pro' ? PROVIDER_L[c.provider || ''] || '—' : c.plan === 'Enterprise' ? 'A medida' : '—'}</span> },
    { key: 'inicio', title: 'Inicio', width: '110px', sort: (c) => +new Date(c.plan !== 'Free' ? c.pro_since || c.created_at : c.created_at), render: (c) => ddmmyyyy(c.plan !== 'Free' ? c.pro_since || c.created_at : c.created_at) },
    { key: 'st', title: 'Estado', width: '170px', render: (c) => c.sub_status === 'past_due' ? <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>Pago pendiente</Tag> : c.cancel_at_period_end && c.plan === 'Pro' ? (
      // Cancelled by the customer: keeps Pro until the end of the paid period.
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>Cancelado</Tag>
        {c.current_period_end && <span style={{ fontSize: 12, color: sec, whiteSpace: 'nowrap' }}>Pro hasta {ddmmyyyy(c.current_period_end)}</span>}
      </span>
    ) : statusTag(c.status === 'active') },
  ];
  const subMenu = (c: Client): MenuItems => [
    { key: 'd', label: 'Ver detalle', onClick: () => setClientId(c.account_id) },
    { key: 'e', label: 'Editar suscripción', onClick: () => setEditSub(c) },
    { key: 'mail', label: <a href={'mailto:' + c.email}>Contactar</a> },
    ...(['free', 'pro', 'enterprise'] as const).filter((k) => k !== c.plan.toLowerCase()).map((k) => ({ key: 'plan-' + k, label: 'Cambiar a ' + { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' }[k], onClick: () => setPlan(c, k) })),
    { type: 'divider' },
    suspendItem(c),
  ];

  const userCols: Col<AdminUser>[] = [
    { key: 'name', title: 'Nombre', width: '1.2fr', sort: (u) => u.name, render: (u) => u.name },
    { key: 'email', title: 'Email', width: '1.6fr', render: (u) => <span style={{ color: sec }}>{u.email}</span> },
    { key: 'rol', title: 'Rol', width: '120px', sort: (u) => u.role, render: (u) => u.role },
    { key: 'board', title: 'Buzón', width: '1fr', sort: (u) => u.board?.name || '', render: (u) => (u.board ? <a onClick={() => setBoardId(u.board!.id)}>{u.board.name}</a> : <span style={{ color: sec }}>—</span>) },
    { key: 'alta', title: 'Alta', width: '110px', sort: (u) => +new Date(u.created_at), render: (u) => ddmmyyyy(u.created_at) },
    { key: 'st', title: 'Estado', width: '110px', sort: (u) => (u.status === 'active' ? 1 : 0), render: (u) => statusTag(u.status === 'active', 'Activo', 'Bloqueado') },
  ];
  const userMenu = (u: AdminUser): MenuItems => [
    ...(u.board ? [{ key: 'b', label: 'Ver buzón', onClick: () => setBoardId(u.board!.id) }] : []),
    { key: 'mail', label: <a href={'mailto:' + u.email}>Contactar</a> },
    ...(u.board && (u.role === 'Miembro' || u.role === 'Invitado') ? [{
      key: 'role', label: 'Cambiar rol',
      children: ([['member', 'Miembro', 'Gestiona las ideas del equipo'], ['guest', 'Invitado', 'Propone, vota y comenta']] as const).map(([k, l, d]) => {
        const cur = u.role === l;
        return {
          key: 'role-' + k, disabled: cur,
          label: (
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, padding: '2px 0' }}>
              <span>{l}{cur ? ' · actual' : ''}</span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{d}</span>
            </span>
          ),
          onClick: () => act(rpc('admin_set_user_role', { p_user: u.user_id, p_board: u.board!.id, p_role: k }), `${u.name} ahora es ${l} en ${u.board!.name}`),
        };
      }),
    }] : []),
    { type: 'divider' },
    { key: 'st', danger: u.status === 'active', disabled: u.user_id === ctx?.me.id, label: u.status === 'active' ? 'Bloquear usuario' : 'Desbloquear usuario',
      onClick: () => act(rpc('admin_set_user_status', { p_user: u.user_id, p_status: u.status === 'active' ? 'blocked' : 'active' }), u.status === 'active' ? 'Usuario bloqueado' : 'Usuario desbloqueado') },
  ];

  const me = ctx?.me;
  async function logout() {
    await supabaseBrowser().auth.signOut();
    setCtx(null);
    toast.ok('Cerraste sesión');
    router.replace('/');
  }

  return (
    <div style={{ flex: isMobile ? 1 : 'none', minHeight: 0, display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap', height: isMobile ? 'auto' : '100vh', overflow: isMobile ? 'visible' : 'hidden' }}>
      <aside style={{ background: '#fff', borderRight: '1px solid #f0f0f0', width: isMobile ? '100%' : 220, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 4, height: isMobile ? 'auto' : '100%', overflowY: 'auto', flex: 'none' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px 16px', color: 'rgba(0,0,0,0.88)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 6, background: '#059669', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>B</span>
          <span style={{ fontWeight: 600 }}>Boxinger Admin</span>
        </a>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 4, flexWrap: 'wrap' }}>
          {TABS.map(([k, l]) => (
            <a key={k} onClick={() => go(k)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 16px', borderRadius: 8, fontSize: 14, background: tab === k ? '#d1fae5' : 'transparent', color: tab === k ? '#059669' : 'rgba(0,0,0,0.88)' }}>
              {l}
              {k === 'errores' && openErrors > 0 && <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: '#ff4d4f', color: '#fff', fontSize: 12, lineHeight: '20px', textAlign: 'center' }}>{openErrors}</span>}
            </a>
          ))}
        </div>
        {me && (
          <div style={{ marginTop: 'auto', borderTop: '1px solid #f0f0f0', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <a onClick={() => go('perfil')} title="Mi perfil" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, color: 'rgba(0,0,0,0.88)', background: tab === 'perfil' ? 'rgba(5,150,105,0.08)' : 'transparent' }}>
              <Avatar name={me.name} url={me.avatar_url} color="#1f2a27" size={32} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</span>
                <span style={{ fontSize: 12, color: sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.email}</span>
              </div>
            </a>
          </div>
        )}
      </aside>
      <div style={{ flex: 1, minWidth: 0, height: isMobile ? 'auto' : '100%', overflowY: 'auto' }}>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, flex: 1 }}>{TITLE[tab]}</h1>
            {tab === 'dashboard' && <Seg options={[['7', '7 días'], ['30', '30 días'], ['90', '90 días']]} value={period} onChange={setPeriod} style={{ alignSelf: 'auto' }} />}
            {tab === 'clientes' && <button type="button" className="bx-btn-primary" style={{ order: 2 }} onClick={() => setNewClient(true)}>+ Crear cliente</button>}
            {['clientes', 'boards', 'suscripciones', 'usuarios'].includes(tab) && <input className="bx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" style={{ width: 240 }} />}
          </div>

          {tab === 'dashboard' && <Dashboard period={period} openClient={setClientId} openBoard={setBoardId} />}
          {tab === 'clientes' && (clients ? <Table cols={clientCols} rows={clients.filter((c) => match(c.name, c.email, c.plan, c.account_name))} rowKey={(c) => c.account_id} menu={clientMenu} minWidth={1100} empty="No hay clientes." /> : <Loading />)}
          {tab === 'boards' && (boards ? <Table cols={boardCols} rows={boards.filter((b) => match(b.name, b.owner_name, b.plan, b.slug))} rowKey={(b) => b.board_id} menu={boardMenu} minWidth={1120} empty="No hay buzones." /> : <Loading />)}
          {tab === 'suscripciones' && (
            <>
              {prices && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16, alignItems: 'start' }}>
                  {(['USD', 'ARS'] as const).map((cur) => <PriceCard key={cur} cur={cur} prices={prices} onNew={() => setPp(cur)} onCancel={(id) => act(rpc('admin_cancel_price', { p_id: id }), 'Cambio de precio cancelado')} />)}
                </div>
              )}
              {clients ? <Table cols={subCols} rows={clients.filter((c) => match(c.name, c.email, c.plan))} rowKey={(c) => c.account_id} menu={subMenu} minWidth={1080} /> : <Loading />}
            </>
          )}
          {tab === 'usuarios' && (users ? <Table cols={userCols} rows={users.filter((u) => match(u.name, u.email, u.role, u.board?.name))} rowKey={(u) => u.user_id} menu={userMenu} minWidth={1000} /> : <Loading />)}
          {tab === 'errores' && <ErrorsPage onCount={setOpenErrors} />}
          {tab === 'perfil' && ctx && <AdminProfile onLogout={logout} />}
        </div>
      </div>

      {clientId && <ClientDrawer accountId={clientId} onClose={() => setClientId(null)} openBoard={(id) => { setClientId(null); setBoardId(id); }} onEditSub={(c) => setEditSub(c)} reload={reloadAll} />}
      {boardId && <AdminBoardDrawer boardId={boardId} onClose={() => setBoardId(null)} onChanged={reloadAll} openClient={(id) => { setBoardId(null); setClientId(id); }} />}
      <EditSubscriptionModal client={editSub} onClose={() => setEditSub(null)} onDone={() => { reloadAll(); if (clientId) { const id = clientId; setClientId(null); setTimeout(() => setClientId(id)); } }} />
      <NewClientModal open={newClient} onClose={() => setNewClient(false)} onDone={reloadAll} prices={{ USD: Number(prices?.current.USD || ctx?.prices.USD || 0) }} />
      <SchedulePriceModal open={!!pp} currency={pp || 'USD'} prices={prices} onClose={() => setPp(null)} onDone={reloadAll} />
    </div>
  );
}

const Loading = () => <div style={{ color: sec, fontSize: 14 }}>Cargando…</div>;

function PriceCard({ cur, prices, onNew, onCancel }: { cur: 'USD' | 'ARS'; prices: Prices; onNew: () => void; onCancel: (id: string) => void }) {
  const rows = prices.rows.filter((r) => r.currency === cur);
  const n = prices.pro_count[cur];
  const ST: Record<string, Tone> = { current: OK, scheduled: { l: 'Programado', bg: '#e6f4ff', bd: '#91caff', fg: '#0958d9' }, previous: { l: 'Anterior', bg: '#fafafa', bd: '#d9d9d9', fg: sec } };
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 14, color: sec }}>Precio vigente del plan Pro · {cur === 'USD' ? 'Tarjeta internacional · Creem (USD)' : 'Mercado Pago (ARS)'}</span>
          <span style={{ fontSize: 28, fontWeight: 600 }}>{money(cur, Number(prices.current[cur]))}<span style={{ fontSize: 14, fontWeight: 400, color: sec }}> / mes</span></span>
          <span style={{ fontSize: 12, color: sec }}>Vigente desde el {ddmmyyyy(prices.current_since[cur])} · {n} {n === 1 ? 'suscripción activa' : 'suscripciones activas'}</span>
        </div>
        <button type="button" className="bx-btn" onClick={onNew}>Programar nuevo precio</button>
      </div>
      {rows.length > 1 && (
        <div style={{ borderTop: '1px solid #f0f0f0', overflowX: 'auto' }}>
          <div style={{ minWidth: 520 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1.3fr 110px 80px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontSize: 13, fontWeight: 600 }}>
              {['Precio', 'Desde', 'Aplica a', 'Estado', ''].map((h, k) => <div key={k} style={{ padding: '10px 16px' }}>{h}</div>)}
            </div>
            {rows.map((r) => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1.3fr 110px 80px', borderBottom: '1px solid #f0f0f0', fontSize: 13, alignItems: 'center' }}>
                <div style={{ padding: '10px 16px' }}>{money(cur, Number(r.amount))}</div>
                <div style={{ padding: '10px 16px' }}>{ddmmyyyy(r.effective_from)}</div>
                <div style={{ padding: '10px 16px', color: sec }}>{r.scope === 'all' ? 'Todas las suscripciones' : 'Solo nuevas suscripciones'}</div>
                <div style={{ padding: '10px 16px' }}><Tag tone={ST[r.state]}>{r.state === 'current' ? 'Vigente' : ST[r.state].l}</Tag></div>
                <div style={{ padding: '10px 16px' }}>
                  {r.state === 'scheduled' && (
                    <Popconfirm title="¿Cancelar este cambio de precio?" okText="Cancelar cambio" cancelText="Volver" onConfirm={() => onCancel(r.id)}><a>Cancelar</a></Popconfirm>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminProfile({ onLogout }: { onLogout: () => void }) {
  const toast = useToast();
  const { ctx, refresh } = useSession();
  const me = ctx!.me;
  const [name, setName] = useState(me.name);
  const [nf, setNf] = useState(me.admin_notif);
  const card: React.CSSProperties = { background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 };
  const rows: [string, string, string][] = [
    ['clients', 'Nuevos clientes', 'Cuando se registra una cuenta o se activa un cliente creado desde el admin.'],
    ['payfail', 'Pagos fallidos', 'Cuando falla el cobro de una suscripción Pro.'],
    ['churn', 'Riesgo alto de churn', 'Cuando una suscripción Pro pasa 14 días sin actividad.'],
    ['weekly', 'Resumen semanal', 'Un email por semana con altas, ventas y actividad de la plataforma.'],
  ];
  const toggle = async (k: string) => {
    const next = { ...nf, [k]: !nf[k] };
    setNf(next);
    try { await rpc('update_notifications', { p_notif: { [k]: next[k] }, p_admin: true }); refresh(); } catch (e) { setNf(nf); toast.err(e); }
  };
  return (
    <>
      <p style={{ margin: 0, color: sec, fontSize: 14 }}>Tus datos, seguridad y notificaciones como administrador de la plataforma.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16, alignItems: 'start' }}>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Datos personales</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><Avatar name={name || me.name} url={me.avatar_url} color="#1f2a27" size={64} /></div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Nombre<input className="bx-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Email
            <input className="bx-input" value={me.email} disabled style={{ background: 'rgba(0,0,0,0.04)', color: sec }} />
            <span style={{ fontSize: 12, color: sec }}>Cuenta de administrador de la plataforma.</span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Rol<div><Tag tone={PRO_TAG}>Super Admin</Tag></div></div>
          <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            if (!name.trim()) return toast.err(new Error('Ingresá tu nombre'));
            try { await rpc('update_profile', { p_name: name }); await refresh(); toast.ok('Perfil actualizado'); } catch (e) { toast.err(e); }
          }}>Guardar cambios</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Seguridad</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 14 }}>Contraseña</span><span style={{ fontSize: 13, color: sec }}>Te enviamos un link por email para cambiarla.</span></div>
              <button type="button" className="bx-btn" onClick={async () => {
                const { error } = await supabaseBrowser().auth.resetPasswordForEmail(me.email, { redirectTo: `${location.origin}/app/auth/callback?next=/app/nueva-contrasena` });
                if (error) toast.err(new Error(error.message)); else toast.ok('Te enviamos un link a ' + me.email + ' (válido 1 hora)');
              }}>Cambiar contraseña</button>
            </div>
          </div>
          <div style={{ ...card, gap: 0, paddingBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Notificaciones</div>
            {rows.map(([k, l, d]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 14 }}>{l}</span><span style={{ fontSize: 13, color: sec }}>{d}</span></div>
                <button type="button" onClick={() => toggle(k)} aria-pressed={nf[k] !== false}
                  style={{ flex: 'none', position: 'relative', width: 44, height: 22, borderRadius: 11, border: 0, cursor: 'pointer', background: nf[k] !== false ? '#059669' : 'rgba(0,0,0,0.25)' }}>
                  <span style={{ position: 'absolute', top: 2, left: nf[k] !== false ? 24 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </button>
              </div>
            ))}
            <p style={{ margin: '12px 0 0', fontSize: 13, color: sec }}>Todas las notificaciones se envían a {me.email}.</p>
          </div>
          <div style={{ ...card, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 14 }}>Sesión</span><span style={{ fontSize: 13, color: sec }}>Cerrá la sesión de administrador en este dispositivo.</span></div>
            <button type="button" className="bx-btn-danger" onClick={onLogout}>Cerrar sesión</button>
          </div>
        </div>
      </div>
    </>
  );
}
