'use client';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Popconfirm } from 'antd';
import { rpc } from '@/lib/rpc';
import { Note } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import type { Idea } from '@/lib/types';
import type { BoardApi } from './shared';

type Result = { votes_moved: number; comments_moved: number; author_vote: boolean; notified: number };

const words = (s: string) => new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
/** How alike two titles are: shared words over the longer title's words. */
function likeness(a: Set<string>, b: Set<string>) {
  let n = 0;
  a.forEach((w) => { if (b.has(w)) n++; });
  return n / Math.max(a.size, b.size, 1);
}

/**
 * "Unir con otra idea": the duplicate's votes and comments move to the main idea and the duplicate is deleted.
 * Starts from `sourceId` (the duplicate); `targetId` preselects the main one (AI duplicates). "Invertir" swaps them.
 */
export function MergeModal({ api, open, sourceId, targetId, onClose, isMobile }: {
  api: BoardApi; open: boolean; sourceId: number; targetId?: number; onClose: () => void; isMobile: boolean;
}) {
  const { t, plural } = useI18n();
  const toast = useToast();
  const [src, setSrc] = useState(sourceId);
  const [dst, setDst] = useState<number | null>(targetId ?? null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSrc(sourceId); setDst(targetId ?? null); setQ(''); } }, [open, sourceId, targetId]);

  const byId = useMemo(() => new Map(api.data.ideas.map((i) => [i.id, i])), [api.data.ideas]);
  const s = byId.get(src);
  const d = dst != null ? byId.get(dst) : undefined;

  // Ideas with the most similar title first; the search box filters by title.
  const candidates = useMemo(() => {
    if (!s) return [];
    const mine = words(s.title + ' ' + s.description.slice(0, 200));
    const needle = q.trim().toLowerCase();
    return api.data.ideas
      .filter((i) => i.id !== s.id && (!needle || i.title.toLowerCase().includes(needle)))
      .map((i) => ({ i, k: likeness(mine, words(i.title)) }))
      .sort((a, b) => b.k - a.k || b.i.votes - a.i.votes)
      .slice(0, 8);
  }, [api.data.ideas, s, q]);

  const planned = (i: Idea) => i.status === 'aprobada' || !!i.rm_col || !!i.launched_at;
  const authorVote = !!s?.author_id && s.author_id !== d?.author_id;

  async function merge() {
    if (!s || !d || busy) return;
    setBusy(true);
    const r = await api.run(rpc<Result>('merge_ideas', { p_source: s.id, p_target: d.id }));
    setBusy(false);
    if (!r) return;
    toast.ok(t('Ideas unidas: «{title}» sumó {votes}.', { title: d.title, votes: plural(r.votes_moved, 'voto', 'votos') }));
    onClose();
    await api.reload();
    api.openIdea(d.id);
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('Unir con otra idea')} destroyOnHidden
      width={isMobile ? '100%' : 600} style={isMobile ? { top: 'auto', bottom: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : { top: '8vh' }}>
      {s && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          {!d && (
            <>
              <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Elegí la idea principal, la que queda. «{title}» se une a ella.', { title: s.title })}</span>
              <input className="bx-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar idea por título')} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {candidates.length === 0 && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('No hay otras ideas que coincidan.')}</span>}
                {candidates.map(({ i, k }) => (
                  <button key={i.id} type="button" onClick={() => setDst(i.id)}
                    style={{ textAlign: 'left', border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff', padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', font: 'inherit' }}>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</span>
                      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{plural(i.votes, 'voto', 'votos')} · {plural(i.comments, 'comentario', 'comentarios')}</span>
                    </span>
                    {k >= 0.3 && <span style={{ fontSize: 11, fontWeight: 600, color: '#ad6800', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4, padding: '0 6px', lineHeight: '18px', whiteSpace: 'nowrap' }}>{t('Parecida')}</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {d && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Card label={t('Se une y deja de existir')} i={s} tone="#fff7e6" bd="#ffd591" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18, color: 'rgba(0,0,0,0.35)' }} aria-hidden>↓</span>
                  <a onClick={() => { setSrc(d.id); setDst(s.id); }} style={{ fontSize: 13 }}>{t('Invertir')}</a>
                  <a onClick={() => setDst(null)} style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Elegir otra')}</a>
                </div>
                <Card label={t('Idea principal (queda)')} i={d} tone="#f6ffed" bd="#b7eb8f" />
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>{t('Pasan sus votos ({n}). Si alguien votó las dos, queda su voto de la principal.', { n: s.votes })}</li>
                <li>{t('Pasan sus comentarios ({n}), con una marca que dice de qué idea vienen.', { n: s.comments })}</li>
                {authorVote && <li>{t('{name}, que la propuso, suma un voto Importante.', { name: s.author_id ? s.author_name : t(s.author_name) })}</li>}
                <li>{t('Su título y descripción quedan en la principal, en «También la pidieron como». Su link lleva a la principal.')}</li>
                <li>{t('Le avisamos en la campanita a quien la propuso y a quienes la votaron.')}</li>
              </ul>
              {planned(s) && !planned(d) && (
                <Note tone="warn">{t('La idea que se une ya está aprobada o en el Roadmap y la principal no: se perdería esa planificación. Conviene tocar Invertir.')}</Note>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="bx-btn" onClick={onClose}>{t('Cancelar')}</button>
                <Popconfirm title={t('¿Unir las ideas?')} description={t('No se puede deshacer.')} okText={t('Unir')} cancelText={t('Cancelar')} onConfirm={merge}>
                  <button type="button" className="bx-btn-primary" disabled={busy}>{busy ? t('Uniendo…') : t('Unir ideas')}</button>
                </Popconfirm>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Card({ label, i, tone, bd }: { label: string; i: Idea; tone: string; bd: string }) {
  const { t, plural, ddmmyyyy } = useI18n();
  return (
    <div style={{ background: tone, border: '1px solid ' + bd, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.55)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{i.title}</span>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
        {i.author_id ? i.author_name : t(i.author_name)} · {ddmmyyyy(i.created_at)} · {plural(i.votes, 'voto', 'votos')} · {plural(i.comments, 'comentario', 'comentarios')}
      </span>
    </div>
  );
}
