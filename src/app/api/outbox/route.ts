import { NextResponse } from 'next/server';
import { dispatchOutbox } from '@/lib/email/outbox';

// The app pings this after actions that queue emails. Sending only what is already queued,
// so it is safe to call without auth; the daily cron retries leftovers.
export async function POST() {
  try {
    const r = await dispatchOutbox(25);
    return NextResponse.json(r);
  } catch (e) {
    console.error('outbox', e);
    return NextResponse.json({ error: 'outbox failed' }, { status: 500 });
  }
}
