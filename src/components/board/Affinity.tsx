'use client';
import { useState } from 'react';
import { Popconfirm } from 'antd';
import { rpc, flushEmails } from '@/lib/rpc';
import { PageHead, ProLock, Tag } from '@/components/ui';
import { useI18n } from '@/lib/i18n/client';
import type { Idea } from '@/lib/types';
import type { BoardApi } from './shared';
import { ListDownload } from './ListDownload';
import { affinityExport } from '@/lib/brainstorm-export';

// Brainstorming › «Agrupar»: the voted ideas on the left; the team creates named groups (columns) and drags each idea
// into the one it belongs to. Then impact/effort in the Matrix, and «Aceptar» sends an idea to the Backlog.
// Backend: idea_groups, move_idea_to_group, accept_idea (supabase/migrations/…062_brainstorm.sql).

const COLORS = ['#7aa7f5', '#b18ae0', '#f5917e', '#73c48f', '#f2c14e', '#5ec2c6', '#e58fb8', '#9aa5b1'];
export const groupColor = (pos: number) => COLORS[((pos % COLORS.length) + COLORS.length) % COLORS.length];

export function Affinity({ api }: { api: BoardApi }) {
  const { t, locale } = useI18n();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null); // group id, or 'list'
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const groups = api.data.board.groups || [];
  const pts = (i: Idea) => Number(i.points ?? i.votes ?? 0);
  // Accepted ideas are in the Backlog now and rejected ones are out: «Agrupar» shows the rest.
  const live = api.data.ideas.filter((i) => !i.hidden && i.status !== 'rechazada' && i.status !== 'aprobada');
  const loose = live.filter((i) => !i.group_id && i.votes > 0).sort((a, b) => pts(b) - pts(a));
  const inGroup = (g: string) => live.filter((i) => i.group_id === g).sort((a, b) => pts(b) - pts(a));

  const head = <PageHead title={t('Agrupar por afinidad')} sub={t('Arrastrá las ideas votadas a grupos con nombre. Después calificá impacto y esfuerzo en la Matriz y aceptá las que se van a hacer.')}
    right={api.pro ? <ListDownload build={() => affinityExport({ t, locale, board: api.data.board, ideas: api.data.ideas, origin: window.location.origin })} /> : undefined} />;
  if (!api.pro) return <>{head}<ProLock title={t('Agrupá las ideas de tu brainstorming')} text={t('Juntá las ideas votadas por afinidad, priorizalas en la Matriz y pasá las aceptadas al Backlog.')} onGo={api.goPro} /></>;

  async function move(id: number, group: string | null) {
    setDrag(null); setOver(null);
    const cur = api.data.ideas.find((x) => x.id === id);
    if (!cur || (cur.group_id || null) === group) return;
    api.patchIdea(id, { group_id: group });
    await api.run(rpc('move_idea_to_group', { p_idea: id, p_group: group }));
    api.reload();
  }
  async function create() {
    const n = newName.trim();
    if (!n) return;
    const r = await api.run(rpc('create_group', { p_board: api.data.board.id, p_name: n }), 'Grupo creado');
    if (r !== undefined) { setNewName(''); api.reload(); }
  }
  async function rename(id: string) {
    const n = editVal.trim();
    setEditing(null);
    if (!n) return;
    await api.run(rpc('rename_group', { p_group: id, p_name: n }));
    api.reload();
  }
  async function accept(i: Idea) {
    api.patchIdea(i.id, { status: 'aprobada' }); // leaves the column right away
    const r = await api.run(rpc('accept_idea', { p_idea: i.id }), 'Idea aceptada: pasó al Backlog');
    if (r !== undefined) flushEmails();
    api.reload();
  }

  const drop = (target: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(target); },
    onDragLeave: () => setOver((o) => (o === target ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (drag != null) move(drag, target === 'list' ? null : target); },
  });

  const card = (i: Idea, color?: string) => (
    <div key={i.id} draggable={api.canWrite} onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', String(i.id)); } catch {} setDrag(i.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}
      onClick={() => api.openIdea(i.id)} className="bx-rm-card"
      style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', borderLeft: color ? `3px solid ${color}` : '1px solid #f0f0f0', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, cursor: api.canWrite ? 'grab' : 'pointer', opacity: drag === i.id ? 0.4 : 1 }}>
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{i.title}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
        <span>{i.votes === 1 ? t('1 voto') : t('{n} votos', { n: i.votes })}</span>
        {api.data.board.vote_scale === 'cinco' && i.avg != null && <span>· ★ {String(i.avg).replace('.', ',')}</span>}
        {api.data.board.vote_scale !== 'like' && api.data.board.vote_scale !== 'cinco' && <span>· {t('{n} puntos', { n: pts(i) })}</span>}
        <span style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
          {i.status === 'aprobada'
            ? <Tag tone={{ l: '', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' }}>{t('Aceptada')}</Tag>
            : color && api.canWrite && <button type="button" className="bx-btn" style={{ height: 24, padding: '0 10px', fontSize: 12 }}
                draggable={false} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); accept(i); }}>{t('Aceptar')}</button>}
        </span>
      </div>
    </div>
  );

  const col: React.CSSProperties = { flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 10, padding: 10, minHeight: 200 };
  return (
    <>
      {head}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
        <div {...drop('list')} style={{ ...col, background: over === 'list' ? '#eef5ff' : '#f5f5f5' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.65)' }}>{t('Ideas votadas')} · {loose.length}</span>
          {loose.length === 0 && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>{t('Acá aparecen las ideas que recibieron votos y todavía no están en un grupo.')}</span>}
          {loose.map((i) => card(i))}
        </div>
        {groups.map((g) => {
          const items = inGroup(g.id), color = groupColor(g.position);
          return (
            <div key={g.id} {...drop(g.id)} style={{ ...col, background: over === g.id ? '#eef5ff' : '#fafafa', border: '1px solid #f0f0f0', borderTop: `3px solid ${color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {editing === g.id
                  ? <input className="bx-input" autoFocus maxLength={60} value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => rename(g.id)} onKeyDown={(e) => { if (e.key === 'Enter') rename(g.id); if (e.key === 'Escape') setEditing(null); }} style={{ height: 28, flex: 1 }} />
                  : <span title={t('Tocá para cambiar el nombre')} onClick={() => { if (api.canWrite) { setEditing(g.id); setEditVal(g.name); } }} style={{ flex: 1, fontSize: 14, fontWeight: 600, cursor: api.canWrite ? 'text' : 'default' }}>{g.name}</span>}
                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>{items.length} · {t('{n} votos', { n: items.reduce((a, i) => a + i.votes, 0) })}</span>
                {api.canWrite && (
                  <Popconfirm title={t('¿Borrar el grupo «{name}»?', { name: g.name })} description={t('Sus ideas vuelven a la lista de ideas votadas.')} okText={t('Borrar')} cancelText={t('Cancelar')} okButtonProps={{ danger: true }}
                    onConfirm={async () => { await api.run(rpc('delete_group', { p_group: g.id }), 'Grupo borrado'); api.reload(); }}>
                    <button type="button" className="bx-icon-btn" title={t('Borrar grupo')} style={{ width: 24, height: 24, fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>×</button>
                  </Popconfirm>
                )}
              </div>
              {items.length === 0 && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)', border: '1px dashed #d9d9d9', borderRadius: 8, padding: 14, textAlign: 'center' }}>{t('Arrastrá ideas acá')}</span>}
              {items.map((i) => card(i, color))}
            </div>
          );
        })}
        {api.canWrite && (
          <div style={{ ...col, background: 'transparent', border: '1px dashed #d9d9d9', minHeight: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.65)' }}>{t('Nuevo grupo')}</span>
            <input className="bx-input" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} placeholder={t('Ej: Onboarding, Pagos…')} />
            <button type="button" className="bx-btn-primary" disabled={!newName.trim()} onClick={create}>+ {t('Crear grupo')}</button>
          </div>
        )}
      </div>
    </>
  );
}
