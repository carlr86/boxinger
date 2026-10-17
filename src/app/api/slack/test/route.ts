import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { makeT, isLocale } from '@/lib/i18n';
import { SlackError, buildMessage, postToSlack, slackErrorText } from '@/lib/slack';

// «Enviar mensaje de prueba» (Settings › Integrations): posts to the board's channel right away and says if it worked.
export async function POST(req: Request) {
  const { board } = (await req.json().catch(() => ({}))) as { board?: string };
  const supabase = await createClient();
  const { data: slug, error: denied } = await supabase.rpc('slack_can_connect', { p_board: board || '' });
  if (denied || !slug) return NextResponse.json({ ok: false, error: denied?.message || 'No autorizado.' }, { status: 403 });

  const admin = supabaseAdmin();
  const [{ data: s }, { data: b }] = await Promise.all([
    admin.from('board_slack').select('webhook_url, locale').eq('board_id', board).maybeSingle(),
    admin.from('boards').select('name, slug').eq('id', board).single(),
  ]);
  if (!s) return NextResponse.json({ ok: false, error: 'Primero conectá Slack.' }, { status: 400 });
  const t = makeT(isLocale(s.locale) ? s.locale : 'es');
  try {
    await postToSlack(s.webhook_url, buildMessage('test', t, b!, null, null));
    await admin.from('board_slack').update({ last_sent_at: new Date().toISOString(), error: null, error_at: null }).eq('board_id', board);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof SlackError ? e : new SlackError(String(e), false);
    if (err.permanent) await admin.from('board_slack').update({ error: err.message.slice(0, 200), error_at: new Date().toISOString() }).eq('board_id', board);
    return NextResponse.json({ ok: false, error: slackErrorText(t, err.message) }, { status: 502 });
  }
}
