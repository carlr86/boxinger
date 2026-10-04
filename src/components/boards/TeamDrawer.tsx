'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer, Modal, Popconfirm } from 'antd';
import { rpc, flushEmails } from '@/lib/rpc';
import { Avatar, EmailChips, Note, ToggleRow } from '@/components/ui';
import { useSession, useToast } from '@/components/Providers';
import { useGridCols } from '@/components/board/IdeaGrid';
import { useI18n } from '@/lib/i18n/client';
import { MAX_MEMBERS } from '@/lib/constants';

const UNLIMITED = Number.POSITIVE_INFINITY;
import type { TeamCtx } from '@/lib/types';
import { MemberRow } from './BoardsPage';

type Team = {
  id: string; name: string; color: string; pro: boolean; max_members: number | null; plan?: string; members_can_create_boards?: boolean;
  owner: { id: string; name: string; email: string; avatar_url: string | null };
  members: { user_id: string; name: string; email: string; avatar_url: string | null; role: string; all_boards: boolean }[];
  pending: { id: string; email: string; created_at: string; board_id: string | null }[];
  boards: { id: string; name: string; slug: string; color: string; visibility: string; access: Record<string, boolean> }[];
};

export function TeamDrawer({ teamId, onClose, onRename }: { teamId: string; onClose: () => void; onRename: (team: TeamCtx) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { t, plural } = useI18n();
  const { ctx, refresh } = useSession();
  const { isMobile } = useGridCols();
  const [team, setTeam] = useState<Team | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [scope, setScope] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [delTried, setDelTried] = useState(false);

  const load = useCallback(async () => {
    try { setTeam(await rpc<Team>('get_team', { p_team: teamId })); } catch (e) { toast.err(e); onClose(); }
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const teamCtx = ctx?.teams.find((x) => x.id === teamId);
  const used = team ? team.members.length + team.pending.length : 0;
  const limit = team ? (team.max_members == null ? UNLIMITED : team.max_members) : MAX_MEMBERS;
  const free = limit - used;
  const unlimited = limit === UNLIMITED;

  async function invite() {
    if (!team) return;
    if (!emails.length) return toast.info('Agregá al menos un email');
    if (emails.length > free) return toast.info(t('Tu equipo puede tener hasta {n} miembros además de vos', { n: limit }));
    setBusy(true);
    try {
      await rpc('invite_team_members', { p_team: team.id, p_emails: emails, p_board: scope || null });
      flushEmails();
      toast.ok(emails.length === 1 ? 'Invitación enviada' : t('{n} invitaciones enviadas', { n: emails.length }));
      setEmails([]);
      await Promise.all([load(), refresh()]);
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }

  const toggle = async (boardId: string, userId: string, on: boolean, boardName: string, name: string) => {
    if (!team) return;
    setTeam({ ...team, boards: team.boards.map((b) => (b.id === boardId ? { ...b, access: { ...b.access, [userId]: !on } } : b)) });
    try { await rpc('set_board_access', { p_board: boardId, p_user: userId, p_has: !on }); toast.ok(on ? t('{name} ya no ve {board}', { name, board: boardName }) : t('{name} vuelve a ver {board}', { name, board: boardName })); refresh(); }
    catch (e) { toast.err(e); load(); }
  };

  return (
    <Drawer open placement="right" onClose={onClose} closable={false} width={isMobile ? '100%' : 520}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
        <a onClick={onClose} style={{ color: 'rgba(0,0,0,0.45)', fontSize: 20, lineHeight: 1 }}>×</a>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{t('Gestionar equipo')}</span>
        {teamCtx && <a style={{ fontSize: 14 }} onClick={() => onRename(teamCtx)}>{t('Cambiar nombre')}</a>}
      </div>
      {team && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={team.name} color={team.color} size={44} square />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{team.name}</h2>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{plural(team.boards.length, 'buzón', 'buzones')} · {team.pro ? (unlimited ? t('{n} personas · miembros ilimitados', { n: team.members.length + 1 }) : t('{n} de {max} personas', { n: team.members.length + 1, max: limit + 1 })) : t('solo vos')}</span>
            </div>
          </div>
          {!team.pro && (
            <Note>{t('En Free el equipo es solo vos. Con Pro podés sumar hasta {n} miembros.', { n: MAX_MEMBERS })} <a onClick={() => { onClose(); router.push('/app/perfil?tab=sub'); }}>{t('Ver planes')}</a></Note>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Miembros')} · {team.pro ? (unlimited ? `${team.members.length + 1}` : t('{n} de {max}', { n: team.members.length + 1, max: limit + 1 })) : t('{n} de {max}', { n: 1, max: 1 })}</span>
            <MemberRow name={team.owner.name} email={team.owner.email} id={team.owner.id} status={t('Admin')} />
            {team.members.map((m) => (
              <MemberRow key={m.user_id} name={m.name} email={m.email} id={m.user_id} status={team.pro ? (m.all_boards ? t('Miembro') : t('Miembro · por buzón')) : t('Pausado · requiere Pro')} warn={!team.pro}
                action={
                  <Popconfirm title={t('¿Quitar a {name} del equipo?', { name: m.name })} okText={t('Quitar')} cancelText={t('Cancelar')} okButtonProps={{ danger: true }}
                    onConfirm={async () => { try { await rpc('remove_team_member', { p_team: team.id, p_user: m.user_id }); toast.ok(t('{name} ya no es parte del equipo', { name: m.name })); load(); refresh(); } catch (e) { toast.err(e); } }}>
                    <a className="bx-link-muted" style={{ fontSize: 13 }}>{t('Quitar')}</a>
                  </Popconfirm>
                } />
            ))}
            {team.pending.map((p) => (
              <MemberRow key={p.id} name={p.email} email={p.board_id ? t('Solo {board}', { board: team.boards.find((b) => b.id === p.board_id)?.name || t('un buzón') }) : t('Todos los buzones')} status={t('Invitación pendiente')} warn
                action={<a className="bx-link-muted" style={{ fontSize: 13 }} onClick={async () => { try { await rpc('revoke_invitation', { p_id: p.id }); toast.ok('Invitación cancelada'); load(); refresh(); } catch (e) { toast.err(e); } }}>{t('Cancelar')}</a>} />
            ))}
          </div>
          {teamCtx?.own && (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px' }}>
              <ToggleRow label={t('Los miembros pueden crear buzones')} desc={team.pro ? t('Los miembros de este equipo pueden crear buzones y cargar ideas en ellos.') : t('Disponible cuando el equipo tenga miembros (Pro).')}
                on={!!team.members_can_create_boards} disabled={!team.pro}
                onChange={async (v) => { try { await rpc('set_team_settings', { p_team: team.id, p_members_create_boards: v }); setTeam({ ...team, members_can_create_boards: v }); toast.ok(v ? 'Los miembros pueden crear buzones' : 'Solo vos podés crear buzones en este equipo'); refresh(); } catch (e) { toast.err(e); } }} />
            </div>
          )}
          {team.pro && free > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Invitar miembros')}</span>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{unlimited ? t('Sin límite de miembros (Enterprise)') : free === 1 ? t('Queda 1 lugar') : t('Quedan {n} lugares', { n: free })}</span>
              </div>
              <EmailChips value={emails} onChange={setEmails} placeholder={t('email@empresa.com y Enter')} onInvalid={(e) => toast.info(t('Email inválido: {email}', { email: e }))} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="bx-select" value={scope} onChange={(e) => setScope(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                  <option value="">{t('Acceso a todos los buzones del equipo')}</option>
                  {team.boards.map((b) => <option key={b.id} value={b.id}>{t('Solo al buzón {board}', { board: b.name })}</option>)}
                </select>
                <button type="button" className="bx-btn-primary" disabled={busy} onClick={invite}>{t('Invitar')}</button>
              </div>
            </div>
          )}
          {team.pro && free <= 0 && <Note>{t('El equipo está completo: vos y {n} miembros. Quitá a alguien para invitar a otra persona.', { n: limit })}</Note>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Acceso a buzones')}</span>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>{t('Los miembros ven todos los buzones del equipo. Tocá un nombre para quitarle o devolverle el acceso a ese buzón.')}</span>
            </div>
            {(!team.pro || team.members.length === 0) && <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{t('Sumá miembros para gestionar el acceso por buzón.')}</span>}
            {team.pro && team.members.length > 0 && team.boards.map((b) => {
              const n = team.members.filter((m) => b.access[m.user_id] !== false).length;
              return (
                <div key={b.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={b.name} color={b.color} size={22} square />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{b.name}</span>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('{n} de {max} con acceso', { n: n + 1, max: team.members.length + 1 })}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {team.members.map((m) => {
                      const on = b.access[m.user_id] !== false;
                      const nm = m.name ? m.name.split(' ')[0] : m.email.split('@')[0];
                      return (
                        <button key={m.user_id} type="button" title={on ? t('Quitar acceso a {board}', { board: b.name }) : t('Dar acceso a {board}', { board: b.name })} onClick={() => toggle(b.id, m.user_id, on, b.name, m.name)}
                          style={{ height: 26, padding: '0 10px', borderRadius: 13, fontSize: 13, cursor: 'pointer', border: '1px solid ' + (on ? '#a9cbc2' : '#d9d9d9'), background: on ? '#d1fae5' : '#fff', color: on ? '#1f4a41' : 'rgba(0,0,0,0.45)', textDecoration: on ? 'none' : 'line-through' }}>
                          {on ? '✓ ' : ''}{nm}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {team.boards.length === 0 && <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{t('El equipo todavía no tiene buzones.')}</span>}
          </div>
          {teamCtx?.own && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Eliminar equipo')}</span>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>
                {t('Se eliminan el equipo y sus {boards} con todas sus ideas, votos y comentarios. Los miembros y los invitados pierden el acceso. Tu cuenta y tu plan no cambian.', { boards: plural(team.boards.length, 'buzón', 'buzones') })}
              </span>
              <button type="button" className="bx-btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => { setDel(true); setConfirm(''); setDelTried(false); }}>{t('Eliminar equipo')}</button>
            </div>
          )}
        </div>
      )}
      {team && (
        <Modal open={del} onCancel={() => setDel(false)} title={t('Eliminar equipo')} width={440} destroyOnHidden footer={null}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>
              {(() => {
                const n = (teamCtx?.boards || []).reduce((a, b) => a + b.ideas, 0);
                const what = n ? t('{boards} y {ideas}', { boards: plural(team.boards.length, 'buzón', 'buzones'), ideas: plural(n, 'idea', 'ideas') }) : plural(team.boards.length, 'buzón', 'buzones');
                return t('Se eliminan {ideas} con sus votos y comentarios. Esta acción no se puede deshacer. Escribí "{name}" para confirmar.', { ideas: what, name: team.name });
              })()}
            </span>
            <input className={'bx-input' + (delTried && confirm.trim() !== team.name ? ' err' : '')} autoFocus maxLength={60} placeholder={team.name} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {delTried && confirm.trim() !== team.name && <span style={{ fontSize: 13, color: '#ff4d4f' }}>{t('El nombre no coincide')}</span>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="bx-btn" onClick={() => setDel(false)}>{t('Cancelar')}</button>
              <button type="button" className="bx-btn-primary" style={{ background: '#ff4d4f' }} disabled={busy}
                onClick={async () => {
                  setDelTried(true);
                  if (confirm.trim() !== team.name) return;
                  setBusy(true);
                  try {
                    await rpc('delete_team', { p_team: team.id, p_confirm: confirm.trim() });
                    toast.ok('Equipo eliminado');
                    const next = await refresh();
                    setDel(false);
                    onClose();
                    if (next && next.teams.length === 0 && next.guest_boards.length === 0) router.push('/app/onboarding');
                  } catch (e) { toast.err(e); } finally { setBusy(false); }
                }}>{t('Eliminar')}</button>
            </div>
          </div>
        </Modal>
      )}
    </Drawer>
  );
}
