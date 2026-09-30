import 'server-only';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { render } from './templates';
import { sendSmtp, smtpConfigured } from './smtp';

export const CONTACT_TO = () => process.env.CONTACT_TO || process.env.SMTP_USER || 'hola@boxinger.com';

/** Hashed client IP (never stored in clear) for rate limiting public forms. */
export function ipHash(headers: Headers): string {
  const ip = (headers.get('x-forwarded-for') || '').split(',')[0].trim() || headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(ip + ':' + (process.env.CRON_SECRET || 'boxinger')).digest('hex').slice(0, 32);
}

/** At most 5 messages per hour from the same connection, and 3 per hour from the same email. */
export async function tooManyMessages(ip: string, email: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [byIp, byEmail] = await Promise.all([
    admin.from('contact_messages').select('id', { count: 'exact', head: true }).eq('ip_hash', ip).gte('created_at', hourAgo),
    admin.from('contact_messages').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', hourAgo),
  ]);
  return (byIp.count || 0) >= 5 || (byEmail.count || 0) >= 3;
}

export type ContactRow = {
  id: number; topic: string; name: string; email: string; company: string | null; team_size: string | null;
  message: string; attempts: number; account?: string | null;
};

type Mail = { to: string; subject: string; html: string; text?: string; replyTo?: { name: string; address: string }; key?: string };

/**
 * Sends one email right away: the Hostinger mailbox (SMTP) when configured, else Resend.
 * In production without either it throws (callers keep the message for the daily retry); in dev it only logs.
 */
export async function sendDirect(m: Mail): Promise<void> {
  if (smtpConfigured()) {
    await sendSmtp({ to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo });
  } else if (process.env.RESEND_API_KEY) {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send(
      { from: process.env.EMAIL_FROM || 'Boxinger <hola@boxinger.com>', to: m.to, subject: m.subject, html: m.html, text: m.text,
        replyTo: m.replyTo ? `${m.replyTo.name.replace(/[<>"]/g, '')} <${m.replyTo.address}>` : process.env.EMAIL_REPLY_TO || 'hola@boxinger.com' },
      m.key ? { idempotencyKey: m.key } : undefined);
    if (error) throw new Error(error.message);
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta configurar SMTP_USER / SMTP_PASS (o RESEND_API_KEY)');
  } else {
    console.info(`[email:dev] → ${m.to} · ${m.subject}`);
  }
}

/** Emails one stored contact message (or withdrawal request) to the Boxinger mailbox, Reply-To the sender. */
export async function deliverContact(r: ContactRow): Promise<boolean> {
  const admin = supabaseAdmin();
  const { subject, html } = render('contact', r);
  const text = `${r.name} <${r.email}>${r.company ? ' · ' + r.company : ''}${r.team_size ? ' · ' + r.team_size : ''}\n\n${r.message}`;
  try {
    await sendDirect({ to: CONTACT_TO(), subject, html, text, replyTo: { name: r.name, address: r.email }, key: 'contact-' + r.id });
    await admin.from('contact_messages').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: r.attempts + 1, last_error: null }).eq('id', r.id);
    return true;
  } catch (e) {
    console.error('contact', r.id, e);
    await admin.from('contact_messages').update({ status: 'failed', attempts: r.attempts + 1, last_error: String((e as Error).message).slice(0, 500) }).eq('id', r.id);
    return false;
  }
}

/** Daily retry for messages that could not be emailed (up to 5 attempts each). */
export async function retryContacts(): Promise<number> {
  const { data } = await supabaseAdmin().from('contact_messages').select('*').neq('status', 'sent').lt('attempts', 5)
    .lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString()).order('id').limit(50);
  let sent = 0;
  for (const r of (data || []) as ContactRow[]) if (await deliverContact(r)) sent++;
  return sent;
}
