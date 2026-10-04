'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from 'antd';
import { rpc } from '@/lib/rpc';
import { Avatar, Bar, Rows, Tag } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { useGridCols } from '@/components/board/IdeaGrid';
import { boardUrl, displayUrl } from '@/lib/env';
import { useI18n } from '@/lib/i18n/client';
import { IDEA_STATUS, VISIBILITY } from '@/lib/constants';
import type { BoardCard, BoardData, TeamCtx } from '@/lib/types';
import { MemberRow } from './BoardsPage';

export function BoardDetail({ board: b, team, onClose }: { board: BoardCard; team: TeamCtx | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { t, ddmmyyyy, rel } = useI18n();
  const { isMobile } = useGridCols();
  const [d, setD] = useState<BoardData | null>(null);
  const [access, setAccess] = useState<Record<string, boolean>>({});
  useEffect(() => {
    rpc<BoardData>('get_board', { p_slug: b.slug }).then(setD).catch((e) => toast.err(e));
    if (team?.is_admin && team.pro && team.members.length)
      rpc<{ boards: { id: string; access: Record<string, boolean> }[] }>('get_team', { p_team: team.id }).then((r) => setAccess(r.boards.find((x) => x.id === b.id)?.access || {})).catch(() => {});
  }, [b.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const ideas = d?.ideas || [];
  const tot = Math.max(1, ideas.length);
  const cnt = (s: string) => ideas.filter((i) => i.status === s).length;
  const priv = b.visibility === 'private';

  return (
    <Drawer open placement="right" onClose={onClose} closable={false} width={isMobile ? '100%' : 480}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
        <a onClick={onClose} style={{ color: 'rgba(0,0,0,0.45)', fontSize: 20, lineHeight: 1 }}>×</a>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{t('Detalle del buzón')}</span>
        <button type="button" className="bx-btn-primary" disabled={b.locked} onClick={() => router.push('/app/b/' + b.slug)}>{t('Ver Buzón')}</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={b.name} color={b.color} url={b.logo_url} size={44} square />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{b.name}</h2>
            <span><Tag>{t(VISIBILITY[b.visibility].l)}</Tag></span>
          </div>
        </div>
        {b.description && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'rgba(0,0,0,0.65)' }}>{b.description}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 4px 4px 11px', background: '#fafafa' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl(b.slug)}</span>
          <a style={{ padding: '4px 10px' }} onClick={() => { navigator.clipboard?.writeText(boardUrl(b.slug)).catch(() => {}); toast.ok('URL del buzón copiada'); }}>{t('Copiar')}</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
          {[[t('Ideas'), ideas.length], [t('Miembros'), priv ? 0 : b.guests], [t('Votos'), ideas.reduce((a, i) => a + i.votes, 0)], [t('Comentarios'), ideas.reduce((a, i) => a + i.comments, 0)]].map(([l, v]) => (
            <div key={l as string} style={{ background: '#fafafa', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{l}</span><span style={{ fontSize: 20, fontWeight: 600 }}>{d ? v : '…'}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Ideas por estado')}</span>
          {([['pendiente', '#bfbfbf'], ['en_revision', '#1677ff'], ['aprobada', '#52c41a'], ['rechazada', '#ff4d4f']] as const).map(([k, c]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 28px', gap: 10, alignItems: 'center', fontSize: 13 }}>
              <span>{t(IDEA_STATUS[k].l)}</span><Bar pct={Math.round((cnt(k) / tot) * 100) + '%'} color={c} h={6} />
              <span style={{ textAlign: 'right' }}>{cnt(k)}</span>
            </div>
          ))}
        </div>
        <Rows rows={[
          { l: t('Creado'), v: ddmmyyyy(b.created_at) },
          { l: t('Última actividad'), v: rel(b.last_activity_at) },
          { l: t('Visibilidad'), v: t(VISIBILITY[b.visibility].l) + ' · ' + t(VISIBILITY[b.visibility].short) },
        ]} />
        {team && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Equipo')} · {team.name}</span>
            <MemberRow name={team.owner.name} email={team.owner.email} id={team.owner.id} status={t('Admin')} />
            {team.pro && team.members.map((m) => {
              const on = access[m.user_id!] !== false;
              return <MemberRow key={m.user_id} name={m.name} email={m.email} id={m.user_id} status={on ? t('Con acceso') : t('Sin acceso a este buzón')} warn={!on} />;
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
}
