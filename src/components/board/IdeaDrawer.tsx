'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Drawer, Dropdown, Image, Popconfirm, Tooltip } from 'antd';
import { DeleteOutlined, EyeInvisibleOutlined, EyeOutlined, MergeCellsOutlined, PictureOutlined } from '@ant-design/icons';
import { signedImageUrl, thumbPath } from '@/lib/images';
import { rpc, flushEmails } from '@/lib/rpc';
import { Avatar, Bar, Choice, Dots, Help, ProPill, Tag, TeamIcon, CommunityIcon } from '@/components/ui';
import { DEV, GROWTH, GROWTH_KEYS, IDEA_STATUS, ORIGIN, PRIO, RATE_L, RM_COLS, VOTE_KEYS, statusTone } from '@/lib/constants';
import { useI18n } from '@/lib/i18n/client';
import { boardUrl } from '@/lib/env';
import type { Comment, IdeaDetail, MergedIdea } from '@/lib/types';
import { AnonAvatar, MaskIcon, OriginTag, toReviewIdea, useGridCols } from './IdeaGrid';
import { MergeModal } from './MergeModal';
import { quadrant, rateOf, voteMode, type BoardApi } from './shared';
import { useToast } from '@/components/Providers';

const More = () => (<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="3.5" cy="8" r="1.3" fill="currentColor" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="12.5" cy="8" r="1.3" fill="currentColor" /></svg>);

const Like = ({ down }: { down?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden style={down ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M5 7v6.5H2.5V7zM5 7l2.5-4.5c1 0 1.7.8 1.5 1.8L8.6 6.5h3.9c.8 0 1.4.8 1.2 1.6l-1 4.2c-.2.7-.8 1.2-1.5 1.2H5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

export function IdeaDrawer({ api, id, onClose }: { api: BoardApi; id: number; onClose: () => void }) {
  const toast = useToast();
  const { modal } = App.useApp();
  const { t, dshort, exact, rel, plural, ddmmyyyy } = useI18n();
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
  const [mergeOpen, setMergeOpen] = useState(false);
  const [imgUrls, setImgUrls] = useState<{ thumb: string; full: string } | null>(null);
  const imagePath = idea?.image_path || null;
  useEffect(() => {
    if (!imagePath) { setImgUrls(null); return; }
    let live = true;
    Promise.all([signedImageUrl(thumbPath(imagePath)), signedImageUrl(imagePath)])
      .then(([thumb, full]) => { if (live && thumb && full) setImgUrls({ thumb, full }); });
    return () => { live = false; };
  }, [imagePath]);
  const [showMerges, setShowMerges] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await rpc<IdeaDetail | MergedIdea | null>('get_idea', { p_id: id });
      // A duplicate that was merged: its old link opens the main idea.
      if (d && 'merged_into' in d) return api.openIdea(d.merged_into);
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
  // Imported ideas with no account behind them: the team sees who asked for it (name and email from the file).
  const byLine = (x: IdeaDetail) => {
    if (x.anonymous && !x.author_id) return t('Por {name}', { name: t('Anónimo') });
    if (x.author_id || (!x.imported && !x.source)) return t('Por {name}', { name: x.author_id ? x.author_name : t(x.author_name) });
    const who = x.requester_name && x.requester_email ? `${x.requester_name} (${x.requester_email})` : x.requester_name || x.requester_email;
    return who ? t('Pedida por {name}', { name: who }) : t(x.imported ? 'Importada' : 'Recibida por el Equipo');
  };
  // Entering the Roadmap tells whoever proposed or voted for the idea.
  const moveRm = async (col: string | null, ok: string) => {
    const told = await api.run(rpc<number>('move_roadmap', { p_id: id, p_col: col, p_before: null }));
    if (told) toast.ok(t('{ok} · Le avisamos a {who} que la propusieron o votaron', { ok, who: plural(told, 'persona', 'personas') }));
    else if (told !== undefined) toast.ok(ok);
    if (told !== undefined) flushEmails();
    await Promise.all([load(), api.reload()]);
  };

  const width = isMobile ? '100%' : isTablet ? '70%' : 480;
  const i = idea;
  const vm = i ? voteMode(api, i) : 'closed';
  const team = api.isTeam;
  const total = i ? Math.max(1, i.votes) : 1;
  const msgs: Record<string, string> = {
    closed: t('La votación está cerrada. Los votos quedaron congelados.'),
    own: t('No podés votar tus propias ideas.'),
    login: t('Registrate para votar esta idea.'),
  };

  async function sendComment() {
    const body = comment.trim();
    if (!body || busy) return;
    setBusy(true);
    const r = await act(rpc('add_comment', { p_idea: id, p_body: body }), 'Comentario publicado', true);
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
        <a onClick={onClose} style={{ color: 'rgba(0,0,0,0.45)', fontSize: 20, lineHeight: 1 }} aria-label={t('Cerrar')}>×</a>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{t('Idea')}</span>
        <a style={{ fontSize: 14 }} onClick={() => {
          navigator.clipboard?.writeText(boardUrl(api.data.board.slug) + '/idea/' + id).catch(() => {});
          toast.ok('Link de la idea copiado');
        }}>{t('Copiar link')}</a>
      </div>
      {missing && <div style={{ padding: 24, color: 'rgba(0,0,0,0.45)' }}>{t('Esta idea no existe o ya no está visible.')}</div>}
      {i && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <OriginTag origin={i.origin} ai={i.ai} imported={i.imported} source={i.source} />
            <Tag>{api.catL(i.category_id)}</Tag>
            <Tag tone={statusTone(i)}>{t(statusTone(i).l)}</Tag>
            {i.hidden && <Tag>{i.archived ? t('Archivada') : t('Oculta para la Comunidad')}</Tag>}
          </div>
          {team && toReviewIdea(i) && (
            // Came in through an integration: the team publishes, rejects or archives it.
            <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
              <span>{t('Llegó por una integración y la Comunidad todavía no la ve. Revisala, editala si hace falta y publicala.')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="bx-btn-primary" disabled={!api.canWrite}
                  onClick={() => act(rpc('set_idea_hidden', { p_id: i.id, p_hidden: false }), 'Idea publicada: ya la ve la Comunidad', true)}>{t('Publicar')}</button>
                <button type="button" className="bx-btn" disabled={!api.canWrite} onClick={() => api.openEdit(i)}>{t('Editar')}</button>
                <button type="button" className="bx-btn" disabled={!api.canWrite} onClick={() => api.askReject(i.id)}>{t('Rechazar')}</button>
                <Tooltip title={t('La saca de «Por revisar» sin publicarla. Sigue oculta y la encontrás en Archivadas.')}>
                  <button type="button" className="bx-btn" disabled={!api.canWrite}
                    onClick={() => act(rpc('set_idea_archived', { p_id: i.id, p_archived: true }), 'Idea archivada')}>{t('Archivar')}</button>
                </Tooltip>
              </div>
            </div>
          )}
          {team && i.archived && (
            <div style={{ background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
              <span>{t('Archivada: la Comunidad no la ve y no está en «Por revisar».')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="bx-btn" disabled={!api.canWrite}
                  onClick={() => act(rpc('set_idea_archived', { p_id: i.id, p_archived: false }), i.source ? 'La idea volvió a «Por revisar»' : 'La idea ya no está archivada')}>{i.source ? t('Volver a «Por revisar»') : t('Desarchivar')}</button>
                <button type="button" className="bx-btn" disabled={!api.canWrite}
                  onClick={() => act(rpc('set_idea_hidden', { p_id: i.id, p_hidden: false }), 'Idea publicada: ya la ve la Comunidad', true)}>{t('Publicar')}</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.4, textWrap: 'pretty', overflowWrap: 'anywhere' }}>{i.title}</h2>
            <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {i.anonymous && <span title={t('Publicada como anónimo: solo el Admin del equipo ve quién la propuso.')} style={{ display: 'inline-flex' }}><MaskIcon size={14} /></span>}
              <span>{byLine(i)} · <span title={exact(i.created_at)}>{rel(i.created_at)}</span></span>
            </span>
            {/* The author can hide or show their name at any time. */}
            {api.me && i.author_id === api.me.id && api.canWrite && (i.anonymous || api.data.board.allow_anonymous !== false) && (
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>
                {i.anonymous ? t('Publicaste esta idea como anónimo: solo el Admin del equipo sabe que es tuya.') + ' ' : ''}
                <a onClick={() => act(rpc('set_idea_anonymous', { p_id: i.id, p_on: !i.anonymous }), i.anonymous ? 'Ahora la idea muestra tu nombre' : 'Ahora la idea se muestra como anónima')}>
                  {i.anonymous ? t('Mostrar mi nombre') : t('Publicar como anónimo')}
                </a>
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'rgba(0,0,0,0.78)', overflowWrap: 'anywhere' }}>{i.description}</p>
          {imgUrls && (
            <Image src={imgUrls.thumb} preview={{ src: imgUrls.full }} alt={t('Imagen de la idea')}
              style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 8, border: '1px solid #f0f0f0', cursor: 'zoom-in', background: '#fafafa' }} />
          )}
          {!!i.merges?.length && (
            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{t('También la pidieron como')}</strong>
                <a onClick={() => setShowMerges(!showMerges)}>{showMerges ? t('Ocultar detalle') : t('Ver detalle')}</a>
              </div>
              {i.merges.map((m, k) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span><b style={{ fontWeight: 500 }}>«{m.title}»</b> <span style={{ color: 'rgba(0,0,0,0.45)' }}>· {t(m.author_name)} · {ddmmyyyy(m.created_at)}</span></span>
                  {showMerges && m.description && <span style={{ color: 'rgba(0,0,0,0.65)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.description}</span>}
                </div>
              ))}
            </div>
          )}
          {i.status === 'rechazada' && (
            <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: '10px 14px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ fontWeight: 600 }}>{t('Motivo del rechazo')}</strong><span>{i.reject_reason}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 32 }}>
            <Big l={t('Votos')} v={i.votes} />
            <Big l={t('Comentarios')} v={commentsCount} />
            {team && <Big l={t('Puntaje')} v={i.score ?? 0} color="#059669" help={t('Suma de los votos: {a} 2 puntos, {b} 1 y {c} 0. Ordena el Ranking; si hay empate, gana la de más votos {a}. Solo lo ve el Equipo.', { a: api.voteL('importante'), b: api.voteL('interesante'), c: api.voteL('no_importante') })} />}
          </div>
          {team && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa', borderRadius: 8, padding: '14px 16px' }}>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Desglose (solo visible para el Equipo)')}</span>
              {([['importante', '#059669'], ['interesante', '#7fb3a6'], ['no_importante', '#bfbfbf']] as const).map(([k, col]) => {
                const n = i[k] || 0;
                return (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 28px', gap: 10, alignItems: 'center', fontSize: 13 }}>
                    <span>{api.voteL(k)}</span><Bar pct={Math.round((n / total) * 100) + '%'} color={col} h={6} track="#ebebeb" />
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Tu voto')}</span>
            {vm === 'can' ? (
              <>
                <div style={{ display: 'flex', gap: 2, background: '#ebebeb', padding: 2, borderRadius: 6, flexWrap: 'wrap' }}>
                  {VOTE_KEYS.map((k) => {
                    const on = i.my_vote === k;
                    return (
                      <button key={k} type="button" onClick={() => api.vote(i.id, k).then(load)}
                        style={{ flex: 1, border: 0, cursor: 'pointer', fontSize: 14, padding: '6px 10px', borderRadius: 4, background: on ? '#059669' : 'transparent', color: on ? '#fff' : 'rgba(0,0,0,0.65)', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', fontWeight: on ? 600 : 400 }}>
                        {api.voteL(k)}
                      </button>
                    );
                  })}
                </div>
                {i.my_vote && <a onClick={() => api.vote(i.id, null).then(load)} style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', alignSelf: 'flex-start' }}>{t('Quitar mi voto')}</a>}
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{msgs[vm]}</span>
                {vm === 'login' && <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => api.goLogin(true)}>{t('Registrarme')}</button>}
              </>
            )}
          </div>

          {team && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Gestión de la idea')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="bx-select" value={i.status} disabled={!api.canWrite} onChange={(e) => api.setStatus(i.id, e.target.value)}>
                  {Object.entries(IDEA_STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.l)}</option>)}
                </select>
                <button type="button" className="bx-btn" disabled={!api.canWrite} onClick={() => api.openEdit(i)}>{t('Editar')}</button>
                {/* Less frequent actions in the "…" menu, with icons like the other menus; Eliminar last, in red, with confirmation. */}
                <Dropdown trigger={['click']} placement="bottomRight" disabled={!api.canWrite} menu={{ items: [
                  { key: 'hide', icon: i.hidden ? <EyeOutlined /> : <EyeInvisibleOutlined />, label: i.hidden ? t('Mostrar idea') : t('Ocultar para la Comunidad'),
                    onClick: () => act(rpc('set_idea_hidden', { p_id: i.id, p_hidden: !i.hidden }), i.hidden ? 'La idea vuelve a ser visible' : 'Idea oculta para la Comunidad', i.hidden) },
                  ...(i.image_path ? [{ key: 'img', icon: <PictureOutlined />, label: t('Quitar imagen'),
                    onClick: () => modal.confirm({ title: t('¿Quitar la imagen de esta idea?'), content: t('La idea queda igual, sin la imagen.'), okText: t('Quitar'), cancelText: t('Cancelar'),
                      onOk: () => act(rpc('set_idea_image', { p_id: i.id, p_path: null }), 'Imagen quitada') }) }] : []),
                  ...(api.isAdmin ? [
                    { key: 'merge', icon: <MergeCellsOutlined />, label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{t('Unir con otra idea')}{!api.pro && <ProPill />}</span>,
                      onClick: () => (api.pro ? setMergeOpen(true) : api.goPro()) },
                    { type: 'divider' as const },
                    { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('Eliminar idea'), onClick: () => modal.confirm({
                      title: t('¿Eliminar esta idea?'), content: t('Se borran también sus votos y comentarios, y no se puede deshacer. Si es una idea repetida, mejor usá Unir con otra idea: no se pierde nada.'),
                      okText: t('Eliminar'), cancelText: t('Cancelar'), okButtonProps: { danger: true },
                      onOk: async () => { const r = await api.run(rpc('delete_idea', { p_id: i.id }), 'Idea eliminada'); if (r !== undefined) { onClose(); api.reload(); } },
                    }) },
                  ] : []),
                ] }}>
                  <button type="button" className="bx-btn" disabled={!api.canWrite} aria-label={t('Más acciones')} title={t('Más acciones')}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, padding: 0 }}><More /></button>
                </Dropdown>
              </div>
              {api.pro && i.status === 'aprobada' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>Roadmap <ProPill /></span>
                  <select className="bx-select" style={{ alignSelf: 'flex-start', minWidth: 200 }} value={i.rm_col || ''} disabled={!api.canWrite}
                    onChange={(e) => { const k = e.target.value; moveRm(k || null, k ? t('Movida a {col}', { col: rmNames[k] || t(RM_COLS.find((c) => c.k === k)!.l) }) : t('Volvió al Backlog')); }}>
                    <option value="">{t('Backlog')}</option>
                    {RM_COLS.map((c) => <option key={c.k} value={c.k}>{rmNames[c.k] || t(c.l)}</option>)}
                  </select>
                </div>
              )}
              {api.pro && i.status === 'aprobada' && i.rm_col && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Prioridad')}</span>
                    <Choice options={[['baja', t('Baja')], ['media', t('Media')], ['alta', t('Alta')]]} value={i.priority} tones={PRIO}
                      onChange={(k) => act(rpc('update_idea_plan', { p_id: i.id, p_patch: { priority: i.priority === k ? '' : k } }), i.priority === k ? 'Prioridad quitada' : t('Prioridad: {p}', { p: t(PRIO[k].l) }))} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Desarrollo')}</span>
                    <Choice options={[['por_empezar', t(DEV.por_empezar.l)], ['en_curso', t(DEV.en_curso.l)], ['lanzada', t(DEV.lanzada.l)]]} value={i.dev_status || 'por_empezar'} tones={DEV}
                      onChange={(k) => k !== (i.dev_status || 'por_empezar') && act(rpc('update_idea_plan', { p_id: i.id, p_patch: { dev_status: k } }), k === 'lanzada' ? 'Idea lanzada · se notificó a quienes la votaron' : t('Desarrollo: {d}', { d: t(DEV[k].l) }), k === 'lanzada')} />
                    <span style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{t('Preparación')}</span>
                    {([['chk_design', t('Diseño finalizado')], ['chk_prd', 'PRD / SPEC']] as const).map(([k, l]) => (
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
                    <span key={n}>{dshort(h.at)} · {t(IDEA_STATUS[h.from].l)} → {t(IDEA_STATUS[h.to].l)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {team && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>{t('Impacto y esfuerzo')} <ProPill /></span>
                {api.pro && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{i.status === 'aprobada' || i.status === 'rechazada' ? t('Visible en la card para el Equipo.') : t('Se muestra en la card cuando la idea se aprueba o se rechaza.')}</span>}
              </div>
              {!api.pro ? (
                <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>{t('Calificá cada idea por impacto y esfuerzo para priorizar mejor. Disponible en el plan Pro.')}</span>
                  <button type="button" className="bx-btn-primary" onClick={api.goPro}>{t('Ver plan Pro')}</button>
                </div>
              ) : (
                <>
                  {(['impact', 'effort'] as const).map((k) => {
                    const v = rateOf(i, k), h = hov && hov.k === k ? hov.n : 0;
                    return (
                      <div key={k} style={{ display: 'grid', gridTemplateColumns: '96px auto 1fr auto', alignItems: 'center', gap: 12, fontSize: 14 }}>
                        <span style={{ color: 'rgba(0,0,0,0.65)' }}>{k === 'impact' ? t('Impacto') : t('Esfuerzo')}</span>
                        <Dots v={v} k={k} big hover={h} onHover={(n) => setHov(n ? { k, n } : null)}
                          onPick={(n) => { setHov(null); act(rpc('update_idea_plan', { p_id: i.id, p_patch: { [k]: v === n ? 0 : n } })); }} />
                        <span style={{ fontSize: 13, color: v || h ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.45)' }}>{t(RATE_L[h || v])}</span>
                        {v > 0 ? <a style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }} onClick={() => act(rpc('update_idea_plan', { p_id: i.id, p_patch: { [k]: 0 } }))}>{t('Quitar')}</a> : <span />}
                      </div>
                    );
                  })}
                  {quad && (
                    <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
                      <strong style={{ fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>{t(quad[0])}</strong> · {t(quad[1])}
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
                {api.pro && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Solo visible para el Equipo. Se muestra en la card cuando la idea se aprueba.')}</span>}
              </div>
              {!api.pro ? (
                <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>{t('Marcá en qué etapa del crecimiento impacta cada idea. Disponible en el plan Pro.')}</span>
                  <button type="button" className="bx-btn-primary" onClick={api.goPro}>{t('Ver plan Pro')}</button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>{t('¿En qué impacta esta idea? Podés marcar varias.')}</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {GROWTH_KEYS.map((k) => {
                      const cur = i.growth || [];
                      const on = cur.includes(k);
                      const g = GROWTH[k];
                      return (
                        <button key={k} type="button" disabled={!api.canWrite} aria-pressed={on}
                          onClick={() => act(rpc('update_idea_plan', { p_id: i.id, p_patch: { growth: on ? cur.filter((x) => x !== k) : cur.concat(k) } }))}
                          style={{ height: 30, padding: '0 12px', borderRadius: 15, fontSize: 13, cursor: api.canWrite ? 'pointer' : 'not-allowed', border: '1px solid ' + (on ? g.bd : '#d9d9d9'), background: on ? g.bg : '#fff', color: on ? g.fg : 'rgba(0,0,0,0.65)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {on && <span aria-hidden>✓</span>}{t(g.l)}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Comentarios')}</span>
            {visibleComments.length === 0 && <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{t('Todavía no hay comentarios.')}</span>}
            {visibleComments.map((c) => {
              const own = !!api.me && c.author_id === api.me.id;
              const o = c.author_team ? 'equipo' : 'comunidad';
              const r = c.reply;
              return (
                <div key={c.id} style={{ display: 'flex', gap: 12, opacity: c.hidden ? 0.5 : 1 }}>
                  {c.author_anonymous && !c.author_id && !c.deleted ? <AnonAvatar size={32} /> : <Avatar name={c.author_name} id={c.author_id || ''} url={c.deleted ? null : c.author_avatar} color={c.deleted ? '#d9d9d9' : undefined} />}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                      <strong style={{ fontWeight: 600, fontSize: 14 }}>{c.author_id && !c.deleted ? c.author_name : t(c.author_name)}</strong>
                      {c.author_anonymous && c.author_id && !c.deleted && <span title={t('Comentó como autor anónimo de la idea: solo el Admin del equipo ve su nombre.')} style={{ display: 'inline-flex', color: '#6b7280' }}><MaskIcon size={14} /></span>}
                      {!c.deleted && !(c.author_anonymous && !c.author_id) && (
                        <span style={{ fontSize: 12, lineHeight: '18px', padding: '0 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid ' + ORIGIN[o].bd, background: ORIGIN[o].bg, color: ORIGIN[o].fg }}>
                          {o === 'comunidad' ? <CommunityIcon /> : <TeamIcon />}{t(ORIGIN[o].l)}
                        </span>
                      )}
                      <span title={exact(c.created_at)} style={{ color: 'rgba(0,0,0,0.45)' }}>{rel(c.created_at)}{c.edited ? ' ' + t('(editado)') : ''}</span>
                      {c.hidden && <span style={{ color: 'rgba(0,0,0,0.45)' }}>· {t('Oculto')}</span>}
                      {c.merged_from_title && <span style={{ color: 'rgba(0,0,0,0.45)' }}>· {t('En «{title}»', { title: c.merged_from_title })}</span>}
                    </div>
                    {editing === c.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea className="bx-input" rows={2} maxLength={1000} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="bx-btn-primary" style={{ height: 28, fontSize: 13 }}
                            onClick={async () => { if (!editText.trim()) return; await act(rpc('edit_comment', { p_id: c.id, p_body: editText }), 'Comentario editado'); setEditing(null); }}>{t('Guardar')}</button>
                          <button type="button" className="bx-btn" style={{ height: 28, fontSize: 13 }} onClick={() => setEditing(null)}>{t('Cancelar')}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: c.deleted ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.88)', fontStyle: c.deleted ? 'italic' : 'normal' }}>
                        {c.deleted ? t('Comentario eliminado') : c.body}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
                      {!c.deleted && (
                        <>
                          <Tooltip title={t('Like')}><a onClick={() => react(c, 'like')} style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.my_reaction === 'like' ? '#059669' : 'rgba(0,0,0,0.45)' }}><Like />{c.likes}</a></Tooltip>
                          <Tooltip title={t('No like')}><a onClick={() => react(c, 'no_like')} style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.my_reaction === 'no_like' ? '#cf1322' : 'rgba(0,0,0,0.45)' }}><Like down />{c.dislikes}</a></Tooltip>
                        </>
                      )}
                      {team && api.canWrite && !r && !c.deleted && !own && <a onClick={() => { setReplyFor(c.id); setReplyText(''); }}>{t('Responder')}</a>}
                      {own && !c.deleted && editing !== c.id && <a style={{ color: 'rgba(0,0,0,0.45)' }} onClick={() => { setEditing(c.id); setEditText(c.body || ''); }}>{t('Editar')}</a>}
                      {own && !c.deleted && (
                        <Popconfirm title={t('¿Eliminar tu comentario?')} okText={t('Eliminar')} cancelText={t('Cancelar')} okButtonProps={{ danger: true }}
                          onConfirm={() => act(rpc('delete_comment', { p_id: c.id }), 'Comentario eliminado')}>
                          <a style={{ color: 'rgba(0,0,0,0.45)' }}>{t('Eliminar')}</a>
                        </Popconfirm>
                      )}
                      {team && api.canWrite && !own && !c.deleted && (
                        <a style={{ color: 'rgba(0,0,0,0.45)' }} onClick={() => act(rpc('set_comment_hidden', { p_id: c.id, p_hidden: !c.hidden }), c.hidden ? 'Comentario visible' : 'Comentario oculto para la Comunidad')}>{c.hidden ? t('Mostrar') : t('Ocultar')}</a>
                      )}
                    </div>
                    {replyFor === c.id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea className="bx-input" rows={2} maxLength={1000} placeholder={t('Respuesta del Equipo')} value={replyText} onChange={(e) => setReplyText(e.target.value)} autoFocus />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="bx-btn-primary" style={{ height: 28, fontSize: 13 }}
                            onClick={async () => {
                              if (!replyText.trim()) return;
                              const ok = await act(rpc('reply_comment', { p_comment: c.id, p_body: replyText }), 'Respuesta publicada. Se notificó al autor.', true);
                              if (ok !== undefined) setReplyFor(null);
                            }}>{t('Responder')}</button>
                          <button type="button" className="bx-btn" style={{ height: 28, fontSize: 13 }} onClick={() => setReplyFor(null)}>{t('Cancelar')}</button>
                        </div>
                      </div>
                    )}
                    {r && (
                      <div style={{ marginTop: 4, background: '#f3f7f6', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                          <strong style={{ fontWeight: 600, fontSize: 14 }}>{r.author_name}</strong>
                          <span style={{ fontSize: 12, lineHeight: '18px', padding: '0 6px', borderRadius: 4, border: '1px solid #a9cbc2', background: '#d1fae5', color: '#059669' }}>{t('Respuesta del Equipo')}</span>
                          <span title={exact(r.created_at)} style={{ color: 'rgba(0,0,0,0.45)' }}>{rel(r.created_at)}{r.edited ? ' ' + t('(editado)') : ''}</span>
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.body}</div>
                        <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                          <a onClick={() => react(c, 'like', true)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: r.my_reaction === 'like' ? '#059669' : 'rgba(0,0,0,0.45)' }}><Like />{r.likes}</a>
                          <a onClick={() => react(c, 'no_like', true)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: r.my_reaction === 'no_like' ? '#cf1322' : 'rgba(0,0,0,0.45)' }}><Like down />{r.dislikes}</a>
                          {api.me && r.author_id === api.me.id && (
                            <Popconfirm title={t('¿Eliminar tu respuesta?')} okText={t('Eliminar')} cancelText={t('Cancelar')} okButtonProps={{ danger: true }}
                              onConfirm={() => act(rpc('delete_reply', { p_id: r.id }), 'Respuesta eliminada')}>
                              <a style={{ color: 'rgba(0,0,0,0.45)' }}>{t('Eliminar')}</a>
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
                  <textarea className="bx-input" rows={3} maxLength={1000} placeholder={t('Escribí un comentario')} value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{comment.length} / 1000</span>
                    <button type="button" className="bx-btn-primary" disabled={busy || !comment.trim()} onClick={sendComment}>{t('Comentar')}</button>
                  </div>
                </div>
              )
            ) : (
              <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}><a onClick={() => api.goLogin(true)}>{t('Registrate')}</a> {t('para comentar.')}</div>
            )}
          </div>
        </div>
      )}
      {i && api.isAdmin && api.pro && <MergeModal api={api} open={mergeOpen} sourceId={i.id} onClose={() => setMergeOpen(false)} isMobile={isMobile} />}
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
