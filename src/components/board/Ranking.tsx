'use client';
import { useMemo, useState } from 'react';
import { PageHead, Seg, Tag } from '@/components/ui';
import { IDEA_STATUS } from '@/lib/constants';
import { plural } from '@/lib/format';
import { OriginTag } from './IdeaGrid';
import type { BoardApi } from './shared';

export function Ranking({ api }: { api: BoardApi }) {
  const [cat, setCat] = useState('all');
  // `rank` is the board-wide order (score, then Importante, total votes, age), so filtering
  // by category keeps the same relative order the ranking would compute inside it.
  const rows = useMemo(
    () => api.data.ideas.filter((i) => i.rank != null && (cat === 'all' || i.category_id === cat)).sort((a, b) => (a.rank || 0) - (b.rank || 0)).slice(0, 10),
    [api.data.ideas, cat],
  );
  return (
    <>
      <PageHead title="Ranking" sub="Las 10 ideas con mayor puntaje entre Pendiente de revisión y En revisión." />
      <Seg options={[['all', 'Todas'] as [string, string]].concat(api.cats.map((c) => [c.id, c.name]))} value={cat} onChange={setCat} />
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
        {rows.map((i, k) => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
            <div style={{ width: 32, fontSize: 20, fontWeight: 600, color: k < 3 ? '#059669' : 'rgba(0,0,0,0.45)', fontVariantNumeric: 'tabular-nums' }}>{k + 1}</div>
            <div onClick={() => api.openIdea(i.id)} style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{i.title}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <OriginTag origin={i.origin} />
                <Tag>{api.catL(i.category_id)}</Tag>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
              {api.isTeam && <span style={{ whiteSpace: 'nowrap' }}>{i.score} pts</span>}
              <span style={{ whiteSpace: 'nowrap' }}>{plural(i.votes, 'voto', 'votos')}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{plural(i.comments, 'comentario', 'comentarios')}</span>
            </div>
            {api.isTeam && api.canWrite ? (
              <select className="bx-select" style={{ width: 180 }} value={i.status} onChange={(e) => api.setStatus(i.id, e.target.value)}>
                {Object.entries(IDEA_STATUS).map(([k2, v]) => <option key={k2} value={k2}>{v.l}</option>)}
              </select>
            ) : <Tag tone={IDEA_STATUS[i.status]}>{IDEA_STATUS[i.status].l}</Tag>}
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>Todavía no hay ideas en juego en esta categoría.</div>}
      </div>
      {api.isTeam && (
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
          Puntaje: Importante 2 · Interesante 1 · No importante 0. Desempate por más votos Importante, más votos totales y antigüedad.
        </p>
      )}
    </>
  );
}
