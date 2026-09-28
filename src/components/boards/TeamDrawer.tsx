'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer, Popconfirm } from 'antd';
import { rpc, flushEmails } from '@/lib/rpc';
import { Avatar, EmailChips, Note } from '@/components/ui';
import { useSession, useToast } from '@/components/Providers';
import { useGridCols } from '@/components/board/IdeaGrid';
import { plural } from '@/lib/format';
import { MAX_MEMBERS } from '@/lib/constants';
import type { TeamCtx } from '@/lib/types';
import { MemberRow } from './BoardsPage';

type Team = {
  id: string; name: string; color: string; pro: boolean; max_members: number;
  owner: { id: string; name: string; email: string; avatar_url: string | null };
  members: { user_id: string; name: string; email: string; avatar_url: string | null; role: string; all_boards: boolean }[];
  pending: { id: string; email: string; created_at: string; board_id: string | null }[];
  boards: { id: string; name: string; slug: string; color: string; visibility: string; access: Record<string, boolean> }[];
};

export function TeamDrawer({ teamId, onClose, onRename }: { teamId: string; onClose: () => void; onRename: (t: TeamCtx) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { ctx, refresh } = useSession();
  const { isMobile } = useGridCols();
  const [t, setT] = useState<Team | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [scope, setScope] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setT(await rpc<Team>('get_team', { p_team: teamId })); } catch (e) { toast.err(e); onClose(); }
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const teamCtx = ctx?.teams.find((x) => x.id === teamId);
  const used = t ? t.members.length + t.pending.length : 0;
  const free = MAX_MEMBERS - used;

  async function invite() {
    if (!t) return;
    if (!emails.length) return toast.info('Agregá al menos un email');
    if (emails.length > free) return toast.info(`Tu equipo puede tener hasta ${MAX_MEMBERS} miembros además de vos`);
    setBusy(true);
    try {
      await rpc('invite_team_members', { p_team: t.id, p_emails: emails, p_board: scope || null });
      flushEmails();
      toast.ok(emails.length === 1 ? 'Invitación enviada' : emails.length + ' invitaciones enviadas');
      setEmails([]);
      await Promise.all([load(), refresh()]);
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }

  const toggle = async (boardId: string, userId: string, on: boolean, boardName: string, name: string) => {
    if (!t) return;
    setT({ ...t, boards: t.boards.map((b) => (b.id === boardId ? { ...b, access: { ...b.access, [userId]: !on } } : b)) });
    try { await rpc('set_board_access', { p_board: boardId, p_user: userId, p_has: !on }); toast.ok(on ? `${name} ya no ve ${boardName}` : `${name} vuelve a ver ${boardName}`); refresh(); }
    catch (e) { toast.err(e); load(); }
  };

  return (
    <Drawer open placement="right" onClose={onClose} closable={false} width={isMobile ? '100%' : 520}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
        <a onClick={onClose} style={{ color: 'rgba(0,0,0,0.45)', fontSize: 20, lineHeight: 1 }}>×</a>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Gestionar equipo</span>
        {teamCtx && <a style={{ fontSize: 14 }} onClick={() => onRename(teamCtx)}>Cambiar nombre</a>}
      </div>
      {t && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={t.name} color={t.color} size={44} square />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{t.name}</h2>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{plural(t.boards.length, 'buzón', 'buzones')} · {t.pro ? `${t.members.length + 1} de ${MAX_MEMBERS + 1} personas` : 'solo vos'}</span>
            </div>
          </div>
          {!t.pro && (
            <Note>En Free el equipo es solo vos. Con Pro podés sumar hasta {MAX_MEMBERS} miembros. <a onClick={() => { onClose(); router.push('/app/perfil?tab=sub'); }}>Ver planes</a></Note>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Miembros · {t.pro ? `${t.members.length + 1} de ${MAX_MEMBERS + 1}` : '1 de 1'}</span>
            <MemberRow name={t.owner.name} email={t.owner.email} id={t.owner.id} status="Admin" />
            {t.members.map((m) => (
              <MemberRow key={m.user_id} name={m.name} email={m.email} id={m.user_id} status={t.pro ? (m.all_boards ? 'Miembro' : 'Miembro · por buzón') : 'Pausado · requiere Pro'} warn={!t.pro}
                action={
                  <Popconfirm title={`¿Quitar a ${m.name} del equipo?`} okText="Quitar" cancelText="Cancelar" okButtonProps={{ danger: true }}
                    onConfirm={async () => { try { await rpc('remove_team_member', { p_team: t.id, p_user: m.user_id }); toast.ok(`${m.name} ya no es parte del equipo`); load(); refresh(); } catch (e) { toast.err(e); } }}>
                    <a className="bx-link-muted" style={{ fontSize: 13 }}>Quitar</a>
                  </Popconfirm>
                } />
            ))}
            {t.pending.map((p) => (
              <MemberRow key={p.id} name={p.email} email={p.board_id ? 'Solo ' + (t.boards.find((b) => b.id === p.board_id)?.name || 'un buzón') : 'Todos los buzones'} status="Invitación pendiente" warn
                action={<a className="bx-link-muted" style={{ fontSize: 13 }} onClick={async () => { try { await rpc('revoke_invitation', { p_id: p.id }); toast.ok('Invitación cancelada'); load(); refresh(); } catch (e) { toast.err(e); } }}>Cancelar</a>} />
            ))}
          </div>
          {t.pro && free > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Invitar miembros</span>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{free === 1 ? 'Queda 1 lugar' : `Quedan ${free} lugares`}</span>
              </div>
              <EmailChips value={emails} onChange={setEmails} placeholder="email@empresa.com y Enter" onInvalid={(e) => toast.info('Email inválido: ' + e)} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="bx-select" value={scope} onChange={(e) => setScope(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                  <option value="">Acceso a todos los buzones del equipo</option>
                  {t.boards.map((b) => <option key={b.id} value={b.id}>Solo al buzón {b.name}</option>)}
                </select>
                <button type="button" className="bx-btn-primary" disabled={busy} onClick={invite}>Invitar</button>
              </div>
            </div>
          )}
          {t.pro && free <= 0 && <Note>El equipo está completo: vos y {MAX_MEMBERS} miembros. Quitá a alguien para invitar a otra persona.</Note>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Acceso a buzones</span>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>Los miembros ven todos los buzones del equipo. Tocá un nombre para quitarle o devolverle el acceso a ese buzón.</span>
            </div>
            {(!t.pro || t.members.length === 0) && <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>Sumá miembros para gestionar el acceso por buzón.</span>}
            {t.pro && t.members.length > 0 && t.boards.map((b) => {
              const n = t.members.filter((m) => b.access[m.user_id] !== false).length;
              return (
                <div key={b.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={b.name} color={b.color} size={22} square />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{b.name}</span>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{n + 1} de {t.members.length + 1} con acceso</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {t.members.map((m) => {
                      const on = b.access[m.user_id] !== false;
                      const nm = m.name ? m.name.split(' ')[0] : m.email.split('@')[0];
                      return (
                        <button key={m.user_id} type="button" title={on ? 'Quitar acceso a ' + b.name : 'Dar acceso a ' + b.name} onClick={() => toggle(b.id, m.user_id, on, b.name, m.name)}
                          style={{ height: 26, padding: '0 10px', borderRadius: 13, fontSize: 13, cursor: 'pointer', border: '1px solid ' + (on ? '#a9cbc2' : '#d9d9d9'), background: on ? '#d1fae5' : '#fff', color: on ? '#1f4a41' : 'rgba(0,0,0,0.45)', textDecoration: on ? 'none' : 'line-through' }}>
                          {on ? '✓ ' : ''}{nm}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {t.boards.length === 0 && <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>El equipo todavía no tiene buzones.</span>}
          </div>
        </div>
      )}
    </Drawer>
  );
}
