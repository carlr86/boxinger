import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { deliverContact, ipHash, sendDirect, tooManyMessages, type ContactRow } from '@/lib/email/contact';
import { render, withdrawalCode } from '@/lib/email/templates';

// "Botón de arrepentimiento" (Res. 424/2020): no sign-in needed. Stores the request, emails
// hola@boxinger.com and gives the requester an identification code (on screen and by email).
const Body = z.object({
  name: z.string().trim().min(1, 'Ingresá tu nombre.').max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Ingresá un email válido.')),
  account_email: z.string().trim().toLowerCase().max(120).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),
  website: z.string().optional(), // honeypot
});

const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  let json: unknown;
  try { json = await req.json(); } catch { return err('Pedido inválido.'); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return err(parsed.error.issues[0]?.message || 'Revisá los datos del formulario.');
  const b = parsed.data;
  if (b.website) return NextResponse.json({ ok: true, code: withdrawalCode(0) });

  const ip = ipHash(req.headers);
  if (await tooManyMessages(ip, b.email)) return err('Recibimos varias solicitudes seguidas. Probá de nuevo en un rato o escribinos a hola@boxinger.com.', 429);

  const { data: row, error } = await supabaseAdmin().from('contact_messages').insert({
    topic: 'arrepentimiento', name: b.name, email: b.email, company: b.account_email || null,
    message: b.message || 'Quiero revocar la contratación del plan Pro.', ip_hash: ip,
  }).select('*').single();
  if (error || !row) {
    console.error('arrepentimiento insert', error);
    return err('No pudimos registrar tu solicitud. Escribinos a hola@boxinger.com.', 500);
  }
  await deliverContact(row as ContactRow);
  const ack = render('arrepentimiento_ack', row);
  await sendDirect({ to: b.email, subject: ack.subject, html: ack.html, key: 'arrepentimiento-ack-' + row.id }).catch((e) => console.error('arrepentimiento ack', e));
  return NextResponse.json({ ok: true, code: withdrawalCode(row.id) });
}
