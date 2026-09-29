import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

// Mail through the Hostinger mailbox (hola@boxinger.com). Used for messages addressed
// to Boxinger itself, like the contact form; transactional mail still goes through Resend.

let transport: Transporter | null = null;

export const smtpConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

function smtp(): Transporter {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // One reused connection, and fail fast instead of hanging: the outbox retries later.
      pool: true,
      maxConnections: 1,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }
  return transport;
}

/** Sends from the mailbox itself (Hostinger rejects other senders). */
export async function sendSmtp(msg: { to: string; subject: string; html: string; text?: string; replyTo?: { name: string; address: string } }) {
  await smtp().sendMail({ from: { name: 'Boxinger', address: process.env.SMTP_USER! }, ...msg });
}
