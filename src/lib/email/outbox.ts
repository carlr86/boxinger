import 'server-only';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { render } from './templates';
import { sendSmtp, smtpConfigured } from './smtp';

let resend: Resend | null = null;
const FROM = process.env.EMAIL_FROM || 'Boxinger <hola@boxinger.com>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'hola@boxinger.com';

type Row = { id: number; to_email: string; template: string; payload: Record<string, unknown>; attempts: number };

/**
 * Sends pending emails from public.email_outbox. Safe to call concurrently (rows are claimed with SKIP LOCKED).
 * Transport: Resend when RESEND_API_KEY is set, else the Hostinger mailbox (SMTP_*). In production with
 * neither, nothing is claimed, so the queue waits until one is configured.
 */
export async function dispatchOutbox(limit = 50): Promise<{ sent: number; failed: number }> {
  if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY && !smtpConfigured()) {
    console.warn('outbox: sin RESEND_API_KEY ni SMTP_USER/SMTP_PASS, los emails quedan en cola');
    return { sent: 0, failed: 0 };
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('claim_outbox', { p_limit: limit });
  if (error) throw error;
  const rows = (data || []) as Row[];
  let sent = 0, failed = 0;
  const key = process.env.RESEND_API_KEY;
  if (key && !resend) resend = new Resend(key);

  for (const r of rows) {
    const { subject, html } = render(r.template, r.payload || {});
    try {
      if (resend) {
        const { error: e } = await resend.emails.send({ from: FROM, to: r.to_email, replyTo: REPLY_TO, subject, html }, { idempotencyKey: 'outbox-' + r.id });
        if (e) throw new Error(e.message);
      } else if (smtpConfigured()) {
        await sendSmtp({ to: r.to_email, subject, html, replyTo: { name: 'Boxinger', address: REPLY_TO } });
      } else {
        console.info(`[email:dev] → ${r.to_email} · ${subject}`);
      }
      await admin.from('email_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', r.id);
      sent++;
    } catch (e) {
      failed++;
      const retry = r.attempts < 5;
      await admin.from('email_outbox').update({
        status: retry ? 'pending' : 'failed',
        last_error: String((e as Error).message).slice(0, 500),
        send_after: new Date(Date.now() + 2 ** r.attempts * 60_000).toISOString(),
      }).eq('id', r.id);
    }
  }
  return { sent, failed };
}

/** Queues and immediately tries to send one email (used by server actions and webhooks). */
export async function sendNow(to: string, template: string, payload: Record<string, unknown>, userId?: string | null, dedupe?: string) {
  const admin = supabaseAdmin();
  await admin.from('email_outbox').upsert({ to_email: to.toLowerCase(), user_id: userId || null, template, payload, dedupe_key: dedupe || null }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  await dispatchOutbox(10).catch((e) => console.error('outbox', e));
}
