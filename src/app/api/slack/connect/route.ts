import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/env';
import { SLACK_CLIENT_ID, slackRedirect } from '@/lib/slack';

// «Conectar con Slack» (Settings › Integrations): checks the person manages the board on a paid plan and sends them
// to Slack's screen, where they pick the channel. Slack comes back to /api/slack/callback.
const STATE_COOKIE = 'bx_slack';

export async function GET(req: NextRequest) {
  const board = req.nextUrl.searchParams.get('board') || '';
  if (!/^[0-9a-f-]{36}$/i.test(board)) return NextResponse.redirect(`${SITE_URL}/app`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE_URL}/app/ingresar`);
  const { data: slug, error } = await supabase.rpc('slack_can_connect', { p_board: board });
  if (error || !slug) return NextResponse.redirect(`${SITE_URL}/app`);
  if (!SLACK_CLIENT_ID) return NextResponse.redirect(`${SITE_URL}/app/b/${slug}/config?seccion=integraciones&slack=sin-configurar`);

  const state = randomBytes(24).toString('hex');
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', SLACK_CLIENT_ID);
  url.searchParams.set('scope', 'incoming-webhook');
  url.searchParams.set('redirect_uri', slackRedirect());
  url.searchParams.set('state', state);
  const res = NextResponse.redirect(url.toString());
  res.cookies.set(STATE_COOKIE, `${state}.${board}`, { httpOnly: true, secure: SITE_URL.startsWith('https'), sameSite: 'lax', path: '/api/slack', maxAge: 600 });
  return res;
}
