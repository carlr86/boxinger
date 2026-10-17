import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SITE_URL, cleanEnv } from '@/lib/env';
import { makeT, isLocale } from '@/lib/i18n';
import { reportError } from '@/lib/alerts';
import { SLACK_CLIENT_ID, buildMessage, postToSlack, slackRedirect } from '@/lib/slack';

// Slack sends the person back here after they pick a channel (or cancel). The code is exchanged for the channel's
// incoming webhook, which is saved with the service key: the browser never sees it.
const STATE_COOKIE = 'bx_slack';

type OAuth = { ok: boolean; error?: string; team?: { name?: string }; incoming_webhook?: { url: string; channel?: string; configuration_url?: string } };

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const [state, board] = (req.cookies.get(STATE_COOKIE)?.value || '').split('.');
  const done = (slug: string | null, result: string) => {
    const res = NextResponse.redirect(slug ? `${SITE_URL}/app/b/${slug}/config?seccion=integraciones&slack=${result}` : `${SITE_URL}/app`);
    res.cookies.set(STATE_COOKIE, '', { path: '/api/slack', maxAge: 0 });
    return res;
  };
  if (!state || !board || !same(state, sp.get('state') || '')) return done(null, 'error');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return done(null, 'error');
  const { data: slug, error: denied } = await supabase.rpc('slack_can_connect', { p_board: board });
  if (denied || !slug) return done(null, 'error');
  if (sp.get('error') || !sp.get('code')) return done(slug, 'cancelado');

  const secret = cleanEnv(process.env.SLACK_CLIENT_SECRET);
  if (!SLACK_CLIENT_ID || !secret) return done(slug, 'sin-configurar');
  try {
    const r = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: SLACK_CLIENT_ID, client_secret: secret, code: sp.get('code')!, redirect_uri: slackRedirect() }),
      signal: AbortSignal.timeout(10_000),
    });
    const o = (await r.json()) as OAuth;
    if (!o.ok || !o.incoming_webhook?.url) throw new Error('oauth.v2.access: ' + (o.error || r.status));
    const hook = o.incoming_webhook;
    const admin = supabaseAdmin();
    const { error } = await admin.rpc('save_slack', { p_board: board, p_user: user.id, p_url: hook.url, p_channel: hook.channel || null, p_workspace: o.team?.name || null, p_config_url: hook.configuration_url || null });
    if (error) throw error;
    // A first message, so the channel shows it is connected.
    const [{ data: b }, { data: p }] = await Promise.all([
      admin.from('boards').select('name, slug').eq('id', board).single(),
      admin.from('profiles').select('locale').eq('id', user.id).single(),
    ]);
    await postToSlack(hook.url, buildMessage('test', makeT(isLocale(p?.locale) ? p.locale : 'es'), b!, null, null))
      .then(() => admin.from('board_slack').update({ last_sent_at: new Date().toISOString() }).eq('board_id', board))
      .catch(() => {});
    return done(slug, 'ok');
  } catch (e) {
    await reportError('slack', e, { board });
    return done(slug, 'error');
  }
}
