import { NextResponse } from 'next/server';
import { dispatchOutbox } from '@/lib/email/outbox';
import { dispatchSlack } from '@/lib/slack';
import { reportError } from '@/lib/alerts';

// The app pings this after actions that queue emails or Slack notices. Sending only what is already queued,
// so it is safe to call without auth; the daily cron retries leftovers.
export async function POST() {
  try {
    const [r, slack] = await Promise.all([dispatchOutbox(25), dispatchSlack(25).catch(async (e) => { await reportError('slack', e); return null; })]);
    return NextResponse.json({ ...r, slack });
  } catch (e) {
    await reportError('emails', e);
    return NextResponse.json({ error: 'outbox failed' }, { status: 500 });
  }
}
