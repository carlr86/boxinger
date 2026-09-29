import 'server-only';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { render } from './templates';
import { sendSmtp, smtpConfigured } from './smtp';

export const CONTACT_TO = () => process.env.CONTACT_TO || process.env.SMTP_USER || 'hola@boxinger.com';

export type ContactRow = {
  id: number; topic: string; name: string; email: string; company: string | null; team_size: string | null;
  message: string; attempts: number; account?: string | null;
};

/**
 * Emails one stored contact message to the Boxinger mailbox, Reply-To the sender.
 * Uses the Hostinger mailbox (SMTP) when configured, else Resend; in dev without either it only logs.
 */
export async function deliverContact(r: ContactRow): Promise<boolean> {
  const admin = supabaseAdmin();
  const { subject, html } = render('contact', r);
  const text = `${r.name} <${r.email}>${r.company ? ' · ' + r.company : ''}${r.team_size ? ' · ' + r.team_size : ''}\n\n${r.message}`;
  const replyTo = { name: r.name, address: r.email };
  try {
    if (smtpConfigured()) {
      await sendSmtp({ to: CONTACT_TO(), subject, html, text, replyTo });
    } else if (process.env.RESEND_API_KEY) {
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send(
        { from: process.env.EMAIL_FROM || 'Boxinger <hola@boxinger.com>', to: CONTACT_TO(), replyTo: `${r.name.replace(/[<>"]/g, '')} <${r.email}>`, subject, html, text },
        { idempotencyKey: 'contact-' + r.id });
      if (error) throw new Error(error.message);
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('Falta configurar SMTP_USER / SMTP_PASS (o RESEND_API_KEY)'); // kept for the cron retry
    } else {
      console.info(`[email:dev] contacto #${r.id} → ${CONTACT_TO()} · ${subject}`);
    }
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
