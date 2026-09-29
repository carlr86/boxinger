import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { deliverContact, type ContactRow } from '@/lib/email/contact';

const Body = z.object({
  topic: z.enum(['general', 'enterprise', 'soporte']),
  name: z.string().trim().min(1, 'Ingresá tu nombre.').max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Ingresá un email válido.')),
  company: z.string().trim().max(120).optional().default(''),
  team_size: z.string().trim().max(40).optional().default(''),
  message: z.string().trim().min(10, 'Contanos un poco más (al menos 10 caracteres).').max(5000, 'El mensaje es muy largo (máximo 5000 caracteres).'),
  website: z.string().optional(), // honeypot: people never see it, bots fill it
});

const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  let json: unknown;
  try { json = await req.json(); } catch { return err('Pedido inválido.'); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return err(parsed.error.issues[0]?.message || 'Revisá los datos del formulario.');
  const b = parsed.data;
  if (b.website) return NextResponse.json({ ok: true }); // bot: pretend it worked

  const admin = supabaseAdmin();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ipHash = createHash('sha256').update(ip + ':' + (process.env.CRON_SECRET || 'boxinger')).digest('hex').slice(0, 32);

  // At most 5 messages per hour from the same connection, and 3 per hour from the same email.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [byIp, byEmail] = await Promise.all([
    admin.from('contact_messages').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', hourAgo),
    admin.from('contact_messages').select('id', { count: 'exact', head: true }).eq('email', b.email).gte('created_at', hourAgo),
  ]);
  if ((byIp.count || 0) >= 5 || (byEmail.count || 0) >= 3) return err('Recibimos varios mensajes seguidos. Probá de nuevo en un rato.', 429);

  // Signed-in senders: attach their user and account for context.
  let userId: string | null = null, account: string | null = null;
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      userId = user.id;
      const { data: acc } = await admin.from('accounts').select('name').eq('owner_id', user.id).maybeSingle();
      account = acc?.name || null;
    }
  } catch { /* anonymous */ }

  const { data: row, error } = await admin.from('contact_messages').insert({
    topic: b.topic, name: b.name, email: b.email, company: b.company || null, team_size: b.team_size || null,
    message: b.message, user_id: userId, ip_hash: ipHash,
  }).select('*').single();
  if (error || !row) {
    console.error('contact insert', error);
    return err('No pudimos enviar tu mensaje. Escribinos a hola@boxinger.com.', 500);
  }
  // Stored = received: if the mailbox is down the daily cron retries it.
  await deliverContact({ ...(row as ContactRow), account });
  return NextResponse.json({ ok: true });
}
