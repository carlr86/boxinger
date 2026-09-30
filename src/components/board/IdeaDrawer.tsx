'use client';
import { useCallback, useEffect, useState } from 'react';
import { Drawer, Popconfirm, Tooltip } from 'antd';
import { rpc, flushEmails } from '@/lib/rpc';
import { Avatar, Bar, Choice, Dots, Help, ProPill, Tag, TeamIcon, CommunityIcon } from '@/components/ui';
import { DEV, GROWTH, GROWTH_KEYS, IDEA_STATUS, ORIGIN, PRIO, RATE_L, RM_COLS, VOTE, VOTE_KEYS } from '@/lib/constants';
import { dshort, exact, rel } from '@/lib/format';
import { boardUrl } from '@/lib/env';
import type { Comment, IdeaDetail } from '@/lib/types';
import { OriginTag, useGridCols } from './IdeaGrid';
import { quadrant, rateOf, voteMode, type BoardApi } from './shared';
import { useToast } from '@/components/Providers';

const Like = ({ down }: { down?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden style={down ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M5 7v6.5H2.5V7zM5 7l2.5-4.5c1 0 1.7.8 1.5 1.8L8.6 6.5h3.9c.8 0 1.4.8 1.2 1.6l-1 4.2c-.2.7-.8 1.2-1.5 1.2H5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

export function IdeaDrawer({ api, id, onClose }: { api: BoardApi; id: number; onClose: () => void }) {
  const toast = useToast();
  const { isMobile, isTablet } = useGridCols();
  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [comment, setComment] = useState('');
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [hov, setHov] = useState<{ k: 'impact' | 'effort'; n: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await rpc<IdeaDetail | null>('get_idea', { p_id: id });
      if (!d) setMissing(true);
      setIdea(d);
    } catch (e) {
      toast.err(e);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when the board data changes (votes, status…) so both views agree.
  const listVersion = api.data.ideas.find((x) => x.id === id);
  useEffect(() => { load(); }, [load, listVersion?.votes, listVersion?.status, listVersion?.comments, listVersion?.hidden]);

  const act = async (p: Promise<unknown>, ok?: string, mail?: boolean) => {
    const r = await api.run(p, ok);
    if (mail) flushEmails();
    await Promise.all([load(), api.reload()]);
    return r;
  };

  const width = isMobile ? '100%' : isTablet ? '70%' : 480;
  const i = idea;
  const vm = i ? voteMode(api, i) : 'closed';
  const team = api.isTeam;
  const total = i ? Math.max(1, i.votes) : 1;
  const msgs: Record<string, string> = {
    closed: 'La votación está cerrada. Los votos quedaron congelados.',
    own: 'No podés votar tus propias ideas.',
    login: 'Registrate para votar esta idea.',
  };

  async function sendComment() {
    const t = comment.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await act(rpc('add_comment', { p_idea: id, p_body: t }), 'Comentario publicado', true);
    setBusy(false);
    if (r !== undefined) setComment('');
  }

  function react(c: Comment, kind: 'like' | 'no_like', reply?: boolean) {
    if (!api.me) return api.goLogin(true);
    const author = reply ? c.reply?.author_id : c.author_id;
    if (author === api.me.id) return toast.info('No podés reaccionar a tu propio comentario');
    act(rpc('react', { p_comment: reply ? null : c.id, p_reply: reply ? c.reply!.id : null, p_value: kind }));
  }

  const imp = i ? rateOf(i, 'impact') : 0, eff = i ? rateOf(i, 'effort') : 0;
  const quad = quadrant(imp, eff);
  const rmNames = api.data.board.roadmap_names || {};
  const visibleComments = i?.comment_list || [];
  const commentsCount = visibleComments.length;

  return (
    <Drawer open placement="right" onClose={onClose} closable={false} width={width}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
        <a onClick={onClose} style={{ color: 'rgba(0,0,0,0.45)', fontSize: 20, lineHeight: 1 }} aria-label="Cerrar">×</a>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Idea</span>
        <a style={{ fontSize: 14 }} onClick={() => {
          navigator.clipboard?.writeText(boardUrl(api.data.board.slug) + '/idea/' + id).catch(() => {});
          toast.ok('Link de la idea copiado');
        }}>Copiar link</a>
      </div>
      {missing && <div style={{ padding: 24, color: 'rgba(0,0,0,0.45)' }}>Esta idea no existe o ya no está visible.</div>}
      {i && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <OriginTag origin={i.origin} />
            <Tag>{api.catL(i.category_id)}</Tag>
            <Tag tone={IDEA_STATUS[i.status]}>{IDEA_STATUS[i.status].l}</Tag>
            {i.hidden && <Tag>Oculta para la Comunidad</Tag>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.4, textWrap: 'pretty', overflowWrap: 'anywhere' }}>{i.title}</h2>
            <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Por {i.author_name} · <span title={exact(i.created_at)}>{rel(i.created_at)}</span></span>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'rgba(0,0,0,0.78)', overflowWrap: 'anywhere' }}>{i.description}</p>
          {i.status === 'rechazada' && (
            <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: '10px 14px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ fontWeight: 600 }}>Motivo del rechazo</strong><span>{i.reject_reason}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 32 }}>
            <Big l="Votos" v={i.votes} />
            <Big l="Comentarios" v={commentsCount} />
            {team && <Big l="Puntaje" v={i.score ?? 0} color="#059669" help={<>Suma de los votos: <b>Importante</b> 2 puntos, <b>Interesante</b> 1 y <b>No importante</b> 0. Ordena el Ranking; si hay empate, gana la de más votos Importante. Solo lo ve el Equipo.</>} />}
          </div>
          {team && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa', borderRadius: 8, padding: '14px 16px' }}>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Desglose (solo visible para el Equipo)</span>
              {([['importante', '#059669'], ['interesante', '#7fb3a6'], ['no_importante', '#bfbfbf']] as const).map(([k, col]) => {
                const n = i[k] || 0;
                return (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 28px', gap: 10, alignItems: 'center', fontSize: 13 }}>
                    <span>{VOTE[k]}</span><Bar pct={Math.round((n / total) * 100) + '%'} color={col} h={6} track="#ebebeb" />
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Tu voto</span>
            {vm === 'can' ? (
              <>
                <div style={{ display: 'flex', gap: 2, background: '#ebebeb', padding: 2, borderRadius: 6, flexWrap: 'wrap' }}>
                  {VOTE_KEYS.map((k) => {
                    const on = i.my_vote === k;
                    return (
                      <button key={k} type="button" onClick={() => api.vote(i.id, k).then(load)}
                        style={{ flex: 1, border: 0, cursor: 'pointer', fontSize: 14, padding: '6px 10px', borderRadius: 4, background: on ? '#059669' : 'transparent', color: on ? '#fff' : 'rgba(0,0,0,0.65)', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', fontWeight: on ? 600 : 400 }}>
                        {VOTE[k]}
                      </button>
                    );
                  })}
                </div>
                {i.my_vote && <a onClick={() => api.vote(i.id, null).then(load)} style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', alignSelf: 'flex-start' }}>Quitar mi voto</a>}
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{msgs[vm]}</span>
                {vm === 'login' && <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => api.goLogin(true)}>Registrarme</button>}
              </>
            )}
          </div>

          {team && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Gestión de la idea</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="bx-select" value={i.status} disabled={!api.canWrite} onChange={(e) => api.setStatus(i.id, e.target.value)}>
                  {Object.entries(IDEA_STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
                </select>
                <button type="button" className="bx-btn" disabled={!api.canWrite} onClick={() => api.openEdit(i)}>Editar</button>
                <button type="button" className="bx-btn" disabled={!api.canWrite}
                  onClick={() => act(rpc('set_idea_hidden', { p_id: i.id, p_hidden: !i.hidden }), i.hidden ? 'La idea vuelve a ser visible' : 'Idea oculta para la Comunidad')}>
                  {i.hidden ? 'Mostrar idea' : 'Ocultar idea'}
                </button>
              </div>
              {api.pro && i.status === 'aprobada' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>Roadmap <ProPill /></span>
                  <select className="bx-select" style={{ alignSelf: 'flex-start', minWidth: 200 }} value={i.rm_col || ''} disabled={!api.canWrite}
                    onChange={(e) => { const k = e.target.value; act(rpc('move_roadmap', { p_id: i.id, p_col: k || null, p_before: null }), k ? 'Movida a ' + (rmNames[k] || RM_COLS.find((c) => c.k === k)!.l) : 'Volvió al Backlog'); }}>
                    <option value="">Backlog</option>
                    {RM_COLS.map((c) => <option key={c.k} value={c.k}>{rmNames[c.k] || c.l}</option>)}
                  </select>
                </div>
              )}
              {api.pro && i.status === 'aprobada' && i.rm_col && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Prioridad</span>
                    <Choice options={[['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']]} value={i.priority} tones={PRIO}
                      onChange={(k) => act(rpc('update_idea_plan', { p_id: i.id, p_patch: { priority: i.priority === k ? '' : k } }), i.priority === k ? 'Prioridad quitada' : 'Prioridad ' + PRIO[k].l.toLowerCase())} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Desarrollo</span>
                    <Choice options={[['por_empezar', DEV.por_empezar.l], ['en_curso', DEV.en_curso.l], ['lanzada', DEV.lanzada.l]]} value={i.dev_status || 'por_empezar'} tones={DEV}
                      onChange={(k) => k !== (i.dev_status || 'por_empezar') && act(rpc('update_idea_plan', { p_id: i.id, p_patch: { dev_status: k } }), k === 'lanzada' ? 'Idea lanzada · se notificó a quienes la votaron' : 'Desarrollo: ' + DEV[k].l, k === 'lanzada')} />
                    <span style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Preparación</span>
                    {([['chk_design', 'Diseño finalizado'], ['chk_prd', 'PRD / SPEC']] as const).map(([k, l]) => (
                      <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!i[k]} onChange={() => act(rpc('update_idea_plan', { p_id: i.id, p_patch: { [k]: !i[k] } }))} style={{ width: 16, height: 16, accentColor: '#059669', cursor: 'pointer' }} />
                        {l}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {i.history && i.history.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
                  {i.history.slice().reverse().map((h, n) => (
                    <span key={n}>{dshort(h.at)} · {IDEA_STATUS[h.from].l} → {IDEA_STATUS[h.to].l}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {team && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>Impacto y esfuerzo <ProPill /></span>
                {api.pro && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{i.status === 'aprobada' || i.status === 'rechazada' ? 'Visible en la card para el Equipo.' : 'Se muestra en la card cuando la idea se aprueba o se rechaza.'}</span>}
              </div>
              {!api.pro ? (
                <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>Calificá cada idea por impacto y esfuerzo para priorizar mejor. Disponible en el plan Pro.</span>
                  <button type="button" className="bx-btn-primary" onClick={api.goPro}>Ver plan Pro</button>
                </div>
              ) : (
                <>
                  {(['impact', 'effort'] as const).map((k) => {
                    const v = rateOf(i, k), h = hov && hov.k === k ? hov.n : 0;
                    return (
                      <div key={k} style={{ display: 'grid', gridTemplateColumns: '96px auto 1fr auto', alignItems: 'center', gap: 12, fontSize: 14 }}>
                        <span style={{ color: 'rgba(0,0,0,0.65)' }}>{k === 'impact' ? 'Impacto' : 'Esfuerzo'}</span>
                        <Dots v={v} k={k} big hover={h} onHover={(n) => setHov(n ? { k, n } : null)}
                          onPick={(n) => { setHov(null); act(rpc('update_idea_plan', { p_id: i.id, p_patch: { [k]: v === n ? 0 : n } })); }} />
                        <span style={{ fontSize: 13, color: v || h ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.45)' }}>{RATE_L[h || v]}</span>
                        {v > 0 ? <a style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }} onClick={() => act(rpc('update_idea_plan', { p_id: i.id, p_patch: { [k]: 0 } }))}>Quitar</a> : <span />}
                      </div>
                    );
                  })}
                  {quad && (
                    <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
                      <strong style={{ fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>{quad[0]}</strong> · {quad[1]}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {team && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>Growth <ProPill /></span>
                {api.pro && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Solo visible para el Equipo. Se muestra en la card cuando la idea se aprueba.</span>}
              </div>
              {!api.pro ? (
                <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>Marcá en qué etapa del crecimiento impacta cada idea. Disponible en el plan Pro.</span>
                  <button type="button" className="bx-btn-primary" onClick={api.goPro}>Ver plan Pro</button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>¿En qué impacta esta idea? Podés marcar varias.</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {GROWTH_KEYS.map((k) => {
                      const cur = i.growth || [];
                      const on = cur.includes(k);
                      const g = GROWTH[k];
                      return (
                        <button key={k} type="button" disabled={!api.canWrite} aria-pressed={on}
                          onClick={() => act(rpc('update_idea_plan', { p_id: i.id, p_patch: { growth: on ? cur.filter((x) => x !== k) : cur.concat(k) } }))}
                          style={{ height: 30, padding: '0 12px', borderRadius: 15, fontSize: 13, cursor: api.canWrite ? 'pointer' : 'not-allowed', border: '1px solid ' + (on ? g.bd : '#d9d9d9'), background: on ? g.bg : '#fff', color: on ? g.fg : 'rgba(0,0,0,0.65)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {on && <span aria-hidden>✓</span>}{g.l}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Comentarios</span>
            {visibleComments.length === 0 && <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>Todavía no hay comentarios.</span>}
            {visibleComments.map((c) => {
              const own = !!api.me && c.author_id === api.me.id;
              const o = c.author_team ? 'equipo' : 'comunidad';
              const r = c.reply;
              return (
                <div key={c.id} style={{ display: 'flex', gap: 12, opacity: c.hidden ? 0.5 : 1 }}>
                  <Avatar name={c.author_name} id={c.author_id || ''} url={c.deleted ? null : c.author_avatar} color={c.deleted ? '#d9d9d9' : undefined} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                      <strong style={{ fontWeight: 600, fontSize: 14 }}>{c.author_name}</strong>
                      {!c.deleted && (
                        <span style={{ fontSize: 12, lineHeight: '18px', padding: '0 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid ' + ORIGIN[o].bd, background: ORIGIN[o].bg, color: ORIGIN[o].fg }}>
                          {o === 'comunidad' ? <CommunityIcon /> : <TeamIcon />}{ORIGIN[o].l}
                        </span>
                      )}
                      <span title={exact(c.created_at)} style={{ color: 'rgba(0,0,0,0.45)' }}>{rel(c.created_at)}{c.edited ? ' (editado)' : ''}</span>
                      {c.hidden && <span style={{ color: 'rgba(0,0,0,0.45)' }}>· Oculto</span>}
                    </div>
                    {editing === c.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea className="bx-input" rows={2} maxLength={1000} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="bx-btn-primary" style={{ height: 28, fontSize: 13 }}
                            onClick={async () => { if (!editText.trim()) return; await act(rpc('edit_comment', { p_id: c.id, p_body: editText }), 'Comentario editado'); setEditing(null); }}>Guardar</button>
                          <button type="button" className="bx-btn" style={{ height: 28, fontSize: 13 }} onClick={() => setEditing(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: c.deleted ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.88)', fontStyle: c.deleted ? 'italic' : 'normal' }}>
                        {c.deleted ? 'Comentario eliminado' : c.body}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
                      {!c.deleted && (
                        <>
                          <Tooltip title="Like"><a onClick={() => react(c, 'like')} style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.my_reaction === 'like' ? '#059669' : 'rgba(0,0,0,0.45)' }}><Like />{c.likes}</a></Tooltip>
                          <Tooltip title="No like"><a onClick={() => react(c, 'no_like')} style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.my_reaction === 'no_like' ? '#cf1322' : 'rgba(0,0,0,0.45)' }}><Like down />{c.dislikes}</a></Tooltip>
                        </>
                      )}
                      {team && api.canWrite && !r && !c.deleted && !own && <a onClick={() => { setReplyFor(c.id); setReplyText(''); }}>Responder</a>}
                      {own && !c.deleted && editing !== c.id && <a style={{ color: 'rgba(0,0,0,0.45)' }} onClick={() => { setEditing(c.id); setEditText(c.body || ''); }}>Editar</a>}
                      {own && !c.deleted && (
                        <Popconfirm title="¿Eliminar tu comentario?" okText="Eliminar" cancelText="Cancelar" okButtonProps={{ danger: true }}
                          onConfirm={() => act(rpc('delete_comment', { p_id: c.id }), 'Comentario eliminado')}>
                          <a style={{ color: 'rgba(0,0,0,0.45)' }}>Eliminar</a>
                        </Popconfirm>
                      )}
                      {team && api.canWrite && !own && !c.deleted && (
                        <a style={{ color: 'rgba(0,0,0,0.45)' }} onClick={() => act(rpc('set_comment_hidden', { p_id: c.id, p_hidden: !c.hidden }), c.hidden ? 'Comentario visible' : 'Comentario oculto para la Comunidad')}>{c.hidden ? 'Mostrar' : 'Ocultar'}</a>
                      )}
                    </div>
                    {replyFor === c.id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea className="bx-input" rows={2} maxLength={1000} placeholder="Respuesta del Equipo" value={replyText} onChange={(e) => setReplyText(e.target.value)} autoFocus />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="bx-btn-primary" style={{ height: 28, fontSize: 13 }}
                            onClick={async () => {
                              if (!replyText.trim()) return;
                              const ok = await act(rpc('reply_comment', { p_comment: c.id, p_body: replyText }), 'Respuesta publicada. Se notificó al autor.', true);
                              if (ok !== undefined) setReplyFor(null);
                            }}>Responder</button>
                          <button type="button" className="bx-btn" style={{ height: 28, fontSize: 13 }} onClick={() => setReplyFor(null)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                    {r && (
                      <div style={{ marginTop: 4, background: '#f3f7f6', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                          <strong style={{ fontWeight: 600, fontSize: 14 }}>{r.author_name}</strong>
                          <span style={{ fontSize: 12, lineHeight: '18px', padding: '0 6px', borderRadius: 4, border: '1px solid #a9cbc2', background: '#d1fae5', color: '#059669' }}>Respuesta del Equipo</span>
                          <span title={exact(r.created_at)} style={{ color: 'rgba(0,0,0,0.45)' }}>{rel(r.created_at)}{r.edited ? ' (editado)' : ''}</span>
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.body}</div>
                        <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                          <a onClick={() => react(c, 'like', true)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: r.my_reaction === 'like' ? '#059669' : 'rgba(0,0,0,0.45)' }}><Like />{r.likes}</a>
                          <a onClick={() => react(c, 'no_like', true)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: r.my_reaction === 'no_like' ? '#cf1322' : 'rgba(0,0,0,0.45)' }}><Like down />{r.dislikes}</a>
                          {api.me && r.author_id === api.me.id && (
                            <Popconfirm title="¿Eliminar tu respuesta?" okText="Eliminar" cancelText="Cancelar" okButtonProps={{ danger: true }}
                              onConfirm={() => act(rpc('delete_reply', { p_id: r.id }), 'Respuesta eliminada')}>
                              <a style={{ color: 'rgba(0,0,0,0.45)' }}>Eliminar</a>
                            </Popconfirm>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {api.me ? (
              api.canWrite && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea className="bx-input" rows={3} maxLength={1000} placeholder="Escribí un comentario" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{comment.length} / 1000</span>
                    <button type="button" className="bx-btn-primary" disabled={busy || !comment.trim()} onClick={sendComment}>Comentar</button>
                  </div>
                </div>
              )
            ) : (
              <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}><a onClick={() => api.goLogin(true)}>Registrate</a> para comentar.</div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Big({ l, v, color, help }: { l: string; v: number; color?: string; help?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{l}{help && <Help>{help}</Help>}</span>
      <span style={{ fontSize: 24, fontWeight: 600, color }}>{v}</span>
    </div>
  );
}
