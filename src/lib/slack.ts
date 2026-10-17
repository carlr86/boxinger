import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SITE_URL, cleanEnv } from '@/lib/env';
import { makeT, type Locale, type T } from '@/lib/i18n';
import { reportError } from '@/lib/alerts';

// Slack notices (Pro, Team and Enterprise): each board can post to one Slack channel through an incoming webhook that the
// team picks with «Conectar con Slack» (see src/app/api/slack). Postgres queues the notices in slack_outbox
// (supabase/migrations/…056_slack_notices.sql); this sends them, in the language of whoever connected the channel.

export const SLACK_CLIENT_ID = cleanEnv(process.env.NEXT_PUBLIC_SLACK_CLIENT_ID);
export const slackRedirect = () => `${SITE_URL}/api/slack/callback`;

type Row = { id: number; board_id: string; kind: string; idea_id: number | null; payload: Record<string, unknown>; attempts: number };
type Conn = { board_id: string; webhook_url: string; locale: Locale; error: string | null };
type IdeaData = { title: string; description: string; origin: string; source: string | null; hidden: boolean; category: string | null; author: string | null; votes: number; importante: number };
type Msg = { text: string; blocks: unknown[] };

// Slack's mrkdwn only needs these three escaped.
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (v: string, n: number) => (v.length > n ? v.slice(0, n - 1).trimEnd() + '…' : v);
const link = (url: string, label: string) => `<${url}|${esc(label)}>`;
const section = (text: string) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text: string) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

function votes(t: T, n: number) {
  return n === 1 ? t('1 voto') : t('{n} votos', { n });
}

/** The message for one notice. */
export function buildMessage(kind: string, t: T, board: { name: string; slug: string }, idea: IdeaData | null, ideaId: number | null, payload: Record<string, unknown> = {}): Msg {
  const boardUrl = `${SITE_URL}/app/b/${board.slug}`;
  const url = ideaId ? `${boardUrl}/idea/${ideaId}` : boardUrl;
  const title = idea ? cut(idea.title, 150) : '';
  const meta = idea ? [t(idea.origin === 'equipo' ? 'Equipo' : 'Comunidad'), idea.category, idea.author ? t('por {name}', { name: idea.author }) : null].filter(Boolean).map(esc).join(' · ') : '';
  const desc = idea?.description ? '\n>' + esc(cut(idea.description.replace(/\s+/g, ' ').trim(), 280)) : '';
  const boardName = esc(board.name);

  if (kind === 'new_idea' && idea) {
    return {
      text: t('Nueva idea en {board}: {title}', { board: board.name, title }),
      blocks: [section(`💡 ${t('*Nueva idea* en {board}', { board: boardName })}\n*${link(url, title)}*${desc}`), context(`${meta}  ·  ${link(url, t('Ver la idea'))}`)],
    };
  }
  if (kind === 'review' && idea) {
    return {
      text: t('Llegó una idea por integración en {board}: {title}', { board: board.name, title }),
      blocks: [section(`📥 ${t('*Llegó una idea por integración* en {board}. Está oculta hasta que el Equipo la revise.', { board: boardName })}\n*${link(url, title)}*${desc}`),
        context(`${meta}  ·  ${link(url, t('Revisarla'))}`)],
    };
  }
  if (kind === 'planned' && idea) {
    return {
      text: t('Pasó al Roadmap: {title}', { title }),
      blocks: [section(`🗺️ ${t('*Pasó al Roadmap* en {board}', { board: boardName })}\n*${link(url, title)}*`), context(`${esc(votes(t, idea.votes))}  ·  ${link(url, t('Ver la idea'))}`)],
    };
  }
  if (kind === 'launched' && idea) {
    return {
      text: t('Se lanzó: {title}', { title }),
      blocks: [section(`🚀 ${t('*Se lanzó* en {board}', { board: boardName })}\n*${link(url, title)}*`),
        context(`${esc(votes(t, idea.votes))}  ·  ${esc(t('Le avisamos a quienes la propusieron o votaron.'))}  ·  ${link(url, t('Ver la idea'))}`)],
    };
  }
  if (kind === 'weekly') {
    const n = (k: string) => Number(payload[k] || 0);
    const line = [
      n('ideas') && t(n('ideas') === 1 ? '1 idea nueva' : '{n} ideas nuevas', { n: n('ideas') }),
      n('votes') && votes(t, n('votes')),
      n('comments') && t(n('comments') === 1 ? '1 comentario' : '{n} comentarios', { n: n('comments') }),
      n('launched') && t(n('launched') === 1 ? '1 lanzada' : '{n} lanzadas', { n: n('launched') }),
    ].filter(Boolean).join(' · ');
    const top = ((payload.top || []) as { id: number; title: string; votes: number }[])
      .map((x, i) => `${i + 1}. ${link(`${boardUrl}/idea/${x.id}`, cut(x.title, 120))} — ${esc(votes(t, x.votes))}`).join('\n');
    const blocks: unknown[] = [section(`📊 ${t('*Tu semana en {board}*', { board: boardName })}${line ? '\n' + esc(line) : ''}`)];
    if (top) blocks.push(section(`*${esc(t('Las más votadas de la semana'))}*\n${top}`));
    if (n('pending')) blocks.push(section(`📥 ${esc(t(n('pending') === 1 ? 'Hay 1 idea para revisar.' : 'Hay {n} ideas para revisar.', { n: n('pending') }))}`));
    blocks.push(context(link(boardUrl, t('Abrir el buzón'))));
    return { text: t('Tu semana en {board}', { board: board.name }), blocks };
  }
  // test, and the welcome message after connecting
  return {
    text: t('Boxinger quedó conectado con este canal'),
    blocks: [section(`✅ ${t('*Boxinger quedó conectado.* Los avisos del buzón {board} van a llegar a este canal.', { board: link(boardUrl, board.name) })}`)],
  };
}

export class SlackError extends Error {
  constructor(message: string, public permanent: boolean) { super(message); }
}

/** Posts to the channel. Throws SlackError: permanent when the channel or the app is gone. */
export async function postToSlack(webhookUrl: string, msg: Msg): Promise<void> {
  if (!webhookUrl.startsWith('https://hooks.slack.com/')) throw new SlackError('invalid_url', true);
  let res: Response;
  try {
    res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...msg, unfurl_links: false, unfurl_media: false }), signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new SlackError(String((e as Error).message || e), false);
  }
  if (res.ok) return;
  const body = (await res.text().catch(() => '')).slice(0, 200) || String(res.status);
  // 403 invalid_token / action_prohibited, 404 no_service / channel_not_found, 410 channel_is_archived
  throw new SlackError(body, [403, 404, 410].includes(res.status));
}

/** Readable reason for the settings page. */
export function slackErrorText(t: T, code: string): string {
  if (/channel_is_archived/.test(code)) return t('El canal de Slack se archivó.');
  if (/channel_not_found|no_service|invalid_token|action_prohibited|no_team/.test(code)) return t('Slack ya no acepta los avisos: puede que hayan quitado la app o borrado el canal.');
  return t('Slack no respondió. Probá de nuevo en unos minutos.');
}

/** Sends pending notices. Safe to call concurrently (rows are claimed with SKIP LOCKED). */
export async function dispatchSlack(limit = 50): Promise<{ sent: number; failed: number }> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('claim_slack', { p_limit: limit });
  if (error) throw error;
  const rows = (data || []) as Row[];
  if (!rows.length) return { sent: 0, failed: 0 };

  const boardIds = [...new Set(rows.map((r) => r.board_id))];
  const ideaIds = [...new Set(rows.map((r) => r.idea_id).filter((x): x is number => x != null))];
  const [{ data: conns }, { data: boards }, { data: ideas }] = await Promise.all([
    admin.from('board_slack').select('board_id, webhook_url, locale, error').in('board_id', boardIds),
    admin.from('boards').select('id, name, slug').in('id', boardIds),
    ideaIds.length ? admin.rpc('slack_notice_data', { p_ids: ideaIds }) : Promise.resolve({ data: {} }),
  ]);
  const connOf = new Map(((conns || []) as Conn[]).map((c) => [c.board_id, c]));
  const boardOf = new Map(((boards || []) as { id: string; name: string; slug: string }[]).map((b) => [b.id, b]));
  const ideaOf = (ideas || {}) as Record<string, IdeaData>;
  const broken = new Set<string>();
  let sent = 0, failed = 0;

  const finish = (id: number, patch: Record<string, unknown>) => admin.from('slack_outbox').update(patch).eq('id', id);
  for (const r of rows) {
    const conn = connOf.get(r.board_id);
    const board = boardOf.get(r.board_id);
    const idea = r.idea_id != null ? ideaOf[String(r.idea_id)] || null : null;
    // Nothing to send: disconnected or broken channel, idea deleted, or already handled (published before its review notice went out).
    const skip = !conn || !board || conn.error || broken.has(r.board_id) ? 'sin canal'
      : r.idea_id != null && !idea ? 'idea borrada'
      : (r.kind === 'new_idea' && idea?.hidden) || (r.kind === 'review' && idea && !idea.hidden) ? 'cambió' : null;
    if (skip) { await finish(r.id, { status: 'skipped', last_error: skip }); continue; }

    try {
      await postToSlack(conn!.webhook_url, buildMessage(r.kind, makeT(conn!.locale), board!, idea, r.idea_id, r.payload));
      await finish(r.id, { status: 'sent', sent_at: new Date().toISOString(), last_error: null });
      await admin.from('board_slack').update({ last_sent_at: new Date().toISOString() }).eq('board_id', r.board_id);
      sent++;
    } catch (e) {
      failed++;
      const err = e instanceof SlackError ? e : new SlackError(String(e), false);
      if (err.permanent) {
        // The channel or the app is gone: stop until the team connects again (the settings page says so).
        broken.add(r.board_id);
        await admin.from('board_slack').update({ error: err.message.slice(0, 200), error_at: new Date().toISOString() }).eq('board_id', r.board_id);
        await finish(r.id, { status: 'failed', last_error: err.message.slice(0, 500) });
        continue;
      }
      const retry = r.attempts < 5;
      if (!retry) await reportError('slack', err, { board: r.board_id, kind: r.kind, outbox_id: r.id });
      await finish(r.id, { status: retry ? 'pending' : 'failed', last_error: err.message.slice(0, 500), send_after: new Date(Date.now() + 2 ** r.attempts * 60_000).toISOString() });
    }
  }
  return { sent, failed };
}
