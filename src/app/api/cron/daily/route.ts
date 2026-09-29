import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { dispatchOutbox } from '@/lib/email/outbox';
import { syncAmount } from '@/lib/billing/sync';

// Daily job, triggered by .github/workflows/daily-cron.yml with Authorization: Bearer $CRON_SECRET.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = supabaseAdmin();
  const now = new Date();
  const log: Record<string, unknown> = {};

  // 1. Scheduled list prices that start today: subscriptions on "all" follow the new price.
  const { data: due } = await admin.from('price_schedule').select('*').is('applied_at', null).is('cancelled_at', null).lte('effective_from', now.toISOString());
  for (const p of due || []) {
    if (p.scope === 'all') {
      const { data: subs } = await admin.from('subscriptions').update({ list_amount: p.amount, updated_at: now.toISOString() }).eq('currency', p.currency).eq('plan', 'pro').select('account_id');
      for (const s of subs || []) await syncAmount(s.account_id).catch((e) => console.error('sync', s.account_id, e));
      log['price_' + p.currency] = subs?.length || 0;
    }
    await admin.from('price_schedule').update({ applied_at: now.toISOString() }).eq('id', p.id);
  }

  // 2. Deals that ended: back to the list price.
  const { data: ended } = await admin.from('subscriptions').select('account_id').not('deal_type', 'is', null).lt('deal_until', now.toISOString());
  for (const s of ended || []) {
    await admin.from('subscriptions').update({ deal_type: null, deal_value: null, deal_until: null, deal_note: null }).eq('account_id', s.account_id);
    await syncAmount(s.account_id).catch((e) => console.error('sync', s.account_id, e));
  }
  log.deals_ended = ended?.length || 0;

  // 3. Cancelled subscriptions whose paid period is over: back to Free.
  const { data: over } = await admin.from('subscriptions').update({ plan: 'free', status: 'expired', free_since: now.toISOString(), cancel_at_period_end: false })
    .eq('plan', 'pro').eq('status', 'cancelled').lt('current_period_end', now.toISOString()).select('account_id');
  log.downgraded = over?.length || 0;

  // 4. Daily digest of comments for the Team.
  const { data: digest } = await admin.rpc('digest_candidates', { p_since: new Date(now.getTime() - 864e5).toISOString() });
  const day = now.toISOString().slice(0, 10);
  const rows: { to_email: string; user_id: string; template: string; payload: object; dedupe_key: string }[] = [];
  const { data: people } = await admin.from('profiles').select('id, email');
  const emailOf = new Map((people || []).map((p) => [p.id, p.email]));
  for (const b of (digest as { board_id: string; board_name: string; slug: string; comments: unknown[]; recipients: string[] }[]) || []) {
    for (const uid of b.recipients) {
      const to = emailOf.get(uid);
      if (to) rows.push({ to_email: to, user_id: uid, template: 'digest', payload: { board_name: b.board_name, slug: b.slug, comments: b.comments }, dedupe_key: `digest:${b.board_id}:${uid}:${day}` });
    }
  }
  if (rows.length) await admin.from('email_outbox').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  log.digests = rows.length;

  // 5. Churn alert: Pro accounts 14+ days without activity (once per account every 14 days).
  const { data: idle } = await admin.from('accounts').select('id, last_activity_at, profiles:owner_id (name, email), subscriptions!inner (plan, status)')
    .eq('status', 'active').eq('subscriptions.plan', 'pro').lt('last_activity_at', new Date(now.getTime() - 14 * 864e5).toISOString());
  for (const a of (idle || []) as unknown as { id: string; last_activity_at: string; profiles: { name: string; email: string } }[]) {
    const days = Math.floor((now.getTime() - new Date(a.last_activity_at).getTime()) / 864e5);
    await admin.rpc('notify_super_admins', { p_pref: 'churn', p_template: 'admin_churn', p_payload: { name: a.profiles.name, email: a.profiles.email, days }, p_dedupe: `churn:${a.id}:${Math.floor(days / 14)}` });
  }
  log.churn = idle?.length || 0;

  // 6. Weekly summary for Super Admins, on Mondays.
  if (now.getUTCDay() === 1) {
    const { data: w } = await admin.rpc('weekly_summary');
    await admin.rpc('notify_super_admins', { p_pref: 'weekly', p_template: 'admin_weekly', p_payload: w, p_dedupe: 'weekly:' + day });
  }

  // 7. Send everything queued.
  let sent = 0;
  for (let i = 0; i < 10; i++) { const r = await dispatchOutbox(50); sent += r.sent; if (r.sent + r.failed < 50) break; }
  log.emails = sent;
  return NextResponse.json(log);
}
