'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Note } from '@/components/ui';
import { useSession, useToast } from '@/components/Providers';
import { rpc, flushEmails } from '@/lib/rpc';
import { IDEA_STATUS, VOTE } from '@/lib/constants';
import type { BoardData, Idea } from '@/lib/types';
import { IdeaGrid, useGridCols } from './IdeaGrid';
import { Ranking } from './Ranking';
import { IdeaDrawer } from './IdeaDrawer';
import { IdeaForm, RejectModal } from './Modals';
import { Roadmap } from './Roadmap';
import { Novedades } from './Novedades';
import { prepareImage, uploadIdeaImage } from '@/lib/images';
import { Matrix, Status } from './Insights';
import { BoardConfig } from './BoardConfig';
import { usesModule, type BoardApi, type IdeaDraft, type View } from './shared';
import { Affinity } from './Affinity';
import { useI18n } from '@/lib/i18n/client';

const VIEWS: View[] = ['buzon', 'ranking', 'backlog', 'afinidad', 'matriz', 'roadmap', 'status', 'novedades', 'config'];
const TEAM_VIEWS: View[] = ['afinidad', 'matriz', 'roadmap', 'status', 'config'];

function parse(path: string): { view: View; idea: number | null } {
  const parts = path.split('/').filter(Boolean).slice(3); // app / b / slug / …
  if (parts[0] === 'idea' && /^\d+$/.test(parts[1] || '')) return { view: 'buzon', idea: +parts[1] };
  const v = parts[0] as View;
  return { view: VIEWS.includes(v) ? v : 'buzon', idea: null };
}

export function BoardApp({ initial, path, join }: { initial: BoardData; path: string; join: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useI18n();
  const { refresh: refreshCtx } = useSession();
  const { isMobile } = useGridCols();
  const [data, setData] = useState<BoardData>(initial);
  const first = parse(path);
  const [view, setViewState] = useState<View>(first.view);
  const [selId, setSelId] = useState<number | null>(first.idea);
  // A link to another view of this same board (e.g. from a notification) re-renders the page with a new path.
  useEffect(() => { const p = parse(path); setViewState(p.view); setSelId(p.idea); }, [path]);
  const [form, setForm] = useState<{ open: boolean; idea: Idea | null; draft?: IdeaDraft; onDone?: () => void }>({ open: false, idea: null });
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const version = useRef(initial.board.version);
  const b = data.board;
  const base = '/app/b/' + b.slug;

  const role = data.role;
  const isTeam = role === 'admin' || role === 'member';
  const canWrite = b.status === 'active' && b.account_status === 'active' && !b.locked;

  const reload = useCallback(async () => {
    try {
      const d = await rpc<BoardData | null>('get_board', { p_slug: b.slug });
      if (d && !d.forbidden) { setData(d); version.current = d.board.version; }
    } catch { /* keep the last good copy */ }
  }, [b.slug]);

  // Ranking and counts refresh within 5 seconds of any vote or change.
  useEffect(() => {
    const iv = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const v = await rpc<string>('board_version', { p_board: b.id });
        if (v && v !== version.current) reload();
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [b.id, reload]);

  // Arriving from the board link or an invitation while signed in: join as Invitado.
  // On invite-only boards, invited people (by email or allowed domain) are Invitados already; store it so
  // the board shows up in Mis Buzones.
  useEffect(() => {
    const invited = role === 'guest' && data.joined === false;
    if (!data.me || !((join && !role) || invited)) return;
    rpc<string>('join_board', { p_slug: b.slug })
      .then(async () => { await Promise.all([reload(), refreshCtx()]); toast.ok(t('Ya sos parte de la Comunidad de {board}', { board: b.name })); })
      .catch((e) => toast.err(e))
      .finally(() => { if (join) window.history.replaceState(null, '', window.location.pathname); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPop = () => { const p = parse(window.location.pathname); setViewState(p.view); setSelId(p.idea); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = (url: string) => window.history.pushState(null, '', url);
  // The Community only gets the Roadmap (read only) when the board shares it; other team views stay closed.
  // Novedades: everyone who can see the board, on paid plans (the team also sees it on Free, with the Pro lock).
  // Each view belongs to a module; a board's type and its Admin decide which modules it shows (src/lib/board-kinds.ts).
  const VIEW_MODULE: Partial<Record<View, string>> = { ranking: 'ranking', backlog: 'backlog', afinidad: 'affinity', matriz: 'rating', roadmap: 'roadmap', status: 'status', novedades: 'changelog' };
  const hasModule = (v: View) => !VIEW_MODULE[v] || usesModule({ data }, VIEW_MODULE[v]!);
  const canSee = (v: View) => hasModule(v) && (v === 'novedades' ? isTeam || b.pro : isTeam || !TEAM_VIEWS.includes(v) || (v === 'roadmap' && b.guests_can_view_roadmap));
  const setView = (v: View) => {
    if (!canSee(v)) return;
    setViewState(v); setSelId(null);
    push(v === 'buzon' ? base : base + '/' + v);
    window.scrollTo({ top: 0 });
  };
  const openIdea = (id: number) => { setSelId(id); push(base + '/idea/' + id); };
  const closeIdea = () => { setSelId(null); push(view === 'buzon' ? base : base + '/' + view); };
  const here = () => (typeof window !== 'undefined' ? window.location.pathname : base);
  const goLogin = (alert?: boolean) => router.push('/app/registro?next=' + encodeURIComponent(here() + '?unirme=1') + (alert ? '&alerta=1' : ''));

  const run = async <T,>(p: Promise<T>, ok?: string): Promise<T | undefined> => {
    try { const r = await p; if (ok) toast.ok(ok); return r; } catch (e) { toast.err(e); return undefined; }
  };
  const patchIdea = (id: number, patch: Partial<Idea>) => setData((d) => ({ ...d, ideas: d.ideas.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  const cats = data.categories;
  const voteL = useCallback((k: string) => (k === 'like' ? '👍 ' + t('Me gusta') : /^[1-5]$/.test(k) ? '★'.repeat(Number(k)) : b.vote_labels?.[k] || (VOTE[k] ? t(VOTE[k]) : k)), [b.vote_labels, t]);
  const catL = useMemo(() => { const m = new Map(cats.map((c) => [c.id, c.name])); return (id: string) => m.get(id) || t('Sin categoría'); }, [cats, t]);

  const api: BoardApi = {
    data, isTeam, isAdmin: data.perms ? data.perms.can_manage : role === 'admin', canCreate: canWrite && (data.perms ? data.perms.can_create_ideas : true),
    pro: b.pro, canWrite, me: data.me, cats, catL, voteL,
    reload, patchIdea, openIdea, goLogin, run,
    goPro: () => router.push('/app/perfil?tab=sub'),
    setView,
    openNew: () => (!data.me ? goLogin(true) : !(canWrite && (data.perms ? data.perms.can_create_ideas : true)) ? toast.info(isTeam ? 'En este buzón el Admin no habilitó la carga de ideas para los miembros.' : 'En este buzón solo el Equipo carga ideas. Podés votar y comentar.') : setForm({ open: true, idea: null })),
    openNewWith: (draft, onDone) => setForm({ open: true, idea: null, draft, onDone }),
    openEdit: (i) => setForm({ open: true, idea: i }),
    askReject: (id) => setRejectFor(id),
    setStatus: async (id, st) => {
      const cur = data.ideas.find((i) => i.id === id);
      if (!cur || cur.status === st) return;
      if (st === 'rechazada') return setRejectFor(id);
      patchIdea(id, { status: st as Idea['status'] });
      const r = await run(rpc('set_idea_status', { p_id: id, p_status: st, p_reason: null }), t('Estado: {status}. Se notificó al autor por email.', { status: t(IDEA_STATUS[st].l) }));
      if (r !== undefined) flushEmails();
      reload();
    },
    vote: async (id, value) => {
      if (!data.me) return goLogin(true);
      const cur = data.ideas.find((i) => i.id === id);
      if (cur) patchIdea(id, { my_vote: value as Idea['my_vote'], votes: cur.votes + (value && !cur.my_vote ? 1 : !value && cur.my_vote ? -1 : 0) });
      const r = await run(rpc('vote', { p_idea: id, p_value: value }), value ? t('Votaste: {option}', { option: voteL(value) }) : t('Quitaste tu voto'));
      if (r === undefined || !role) refreshCtx();
      reload();
    },
  };

  // Attach (File), remove (null) or leave (undefined) an idea's image. The idea is already saved: a failed upload only warns.
  async function saveImage(id: number, image: File | null | undefined) {
    if (image === undefined) return;
    try {
      if (image === null) { await rpc('set_idea_image', { p_id: id, p_path: null }); return; }
      const path = await uploadIdeaImage(b.id, await prepareImage(image));
      await rpc('set_idea_image', { p_id: id, p_path: path });
    } catch (e) {
      toast.err(new Error(t('La idea se guardó, pero no pudimos subir la imagen: {error}', { error: e instanceof Error ? e.message : String(e) })));
    }
  }

  const tabs = ([{ key: 'buzon', label: t('Buzón') }, { key: 'ranking', label: t('Ranking') }, { key: 'backlog', label: t('Backlog') }] as { key: string; label: string }[])
    .concat(isTeam ? [{ key: 'afinidad', label: t('Agrupar') }, { key: 'matriz', label: t('Matriz') }, { key: 'roadmap', label: t('Roadmap') }, { key: 'status', label: t('Status') }]
      : b.guests_can_view_roadmap ? [{ key: 'roadmap', label: t('Roadmap') }] : [])
    .concat(isTeam || b.pro ? [{ key: 'novedades', label: t('Novedades') }] : [])
    .filter((x) => hasModule(x.key as View));
  const shownView = canSee(view) ? view : 'buzon';

  return (
    <>
      <AppHeader
        board={{ id: b.id, name: b.name, color: b.color, isTeam, logo_url: b.logo_url }}
        tabs={tabs} view={shownView} onTab={(k) => setView(k as View)}
        onConfig={isTeam ? () => setView('config') : undefined}
        loginNext={base + '?unirme=1'}
      />
      <main className="bx-main">
        {(b.status !== 'active' || b.account_status !== 'active') && <Note tone="warn">{t('Este buzón está suspendido y queda en solo lectura.')}</Note>}
        {b.locked && <Note tone="warn">{t('Este buzón requiere el plan Pro y queda en solo lectura.')} {isTeam && <a onClick={api.goPro}>{t('Ver planes')}</a>}</Note>}
        {role === 'blocked' && <Note tone="error">{t('El Equipo bloqueó tu participación en este buzón. Podés ver las ideas, pero no votar ni comentar.')}</Note>}
        {role === 'super' && <Note>{t('Estás viendo este buzón como Admin de plataforma.')}</Note>}
        {(shownView === 'buzon' || shownView === 'backlog') && <IdeaGrid api={api} backlog={shownView === 'backlog'} />}
        {shownView === 'ranking' && <Ranking api={api} />}
        {shownView === 'roadmap' && <Roadmap api={api} />}
        {shownView === 'afinidad' && <Affinity api={api} />}
        {shownView === 'matriz' && <Matrix api={api} />}
        {shownView === 'status' && <Status api={api} />}
        {shownView === 'novedades' && <Novedades api={api} />}
        {shownView === 'config' && <BoardConfig api={api} />}
      </main>

      {isMobile && data.me && api.canCreate && (shownView === 'buzon' || shownView === 'backlog') && !selId && (
        <button type="button" onClick={api.openNew} title={t('Nueva idea')}
          style={{ position: 'fixed', right: 20, bottom: 24, width: 56, height: 56, borderRadius: '50%', border: 0, background: '#059669', color: '#fff', fontSize: 28, lineHeight: 1, cursor: 'pointer', boxShadow: '0 6px 16px rgba(5,150,105,0.35)', zIndex: 30 }}>+</button>
      )}

      {selId != null && <IdeaDrawer key={selId} api={api} id={selId} onClose={closeIdea} />}

      <IdeaForm open={form.open} idea={form.idea} draft={form.draft} cats={cats} isTeam={isTeam} isMobile={isMobile}
        onClose={() => setForm({ open: false, idea: null })}
        imageMode={b.pro ? 'on' : isTeam ? 'pro' : 'off'} onPro={api.goPro} allowAnonymous={b.allow_anonymous !== false && !form.draft?.ai}
        onSubmit={async (v) => {
          if (!canWrite) { toast.info('Este buzón está en solo lectura.'); return false; }
          if (form.idea) {
            const r = await run(rpc('update_idea', { p_id: form.idea.id, p_title: v.title, p_description: v.description, p_category: v.category_id }), 'Idea actualizada');
            if (r !== undefined) await saveImage(form.idea.id, v.image);
            await reload();
            return r !== undefined;
          }
          const id = await run(form.draft?.ai
            ? rpc<number>('create_ai_idea', { p_board: b.id, p_title: v.title, p_description: v.description, p_category: v.category_id, p_suggestion: form.draft.suggestion ?? null })
            : rpc<number>('create_idea', { p_board: b.id, p_title: v.title, p_description: v.description, p_category: v.category_id, p_anonymous: !!v.anonymous }), v.anonymous ? 'Idea publicada como anónimo · Pendiente de revisión' : 'Idea publicada · Pendiente de revisión');
          if (id === undefined) return false;
          flushEmails(); // the board's Slack channel, if it has one
          await saveImage(id, v.image);
          form.onDone?.();
          await reload();
          if (!role) refreshCtx();
          if (view !== 'buzon' && !form.draft) setView('buzon');
          return true;
        }} />

      <RejectModal open={rejectFor != null} onClose={() => setRejectFor(null)}
        onConfirm={async (reason) => {
          const id = rejectFor!;
          const r = await run(rpc('set_idea_status', { p_id: id, p_status: 'rechazada', p_reason: reason }), t('Estado: {status}. Se notificó al autor por email.', { status: t('Rechazada') }));
          if (r !== undefined) { flushEmails(); setRejectFor(null); }
          reload();
        }} />
    </>
  );
}
