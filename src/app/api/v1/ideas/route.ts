import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { reportError } from '@/lib/alerts';
import { dispatchSlack } from '@/lib/slack';

// Integrations door (Pro and Enterprise): Zapier, Make, Google Forms or any tool sends an idea to a board.
// POST with "Authorization: Bearer <board key>" and JSON {title, description?, name?, email?, category?, external_id?}.
// The idea arrives hidden, for the team to review and publish. Postgres (ingest_idea) checks the key, plan and limits.

const str = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : null);
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

// Postgres error codes from ingest_idea → HTTP status.
const STATUS: Record<string, number> = { '28000': 401, '42501': 403, '22023': 400, '54000': 429 };

export async function POST(req: Request) {
  const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!key) return fail(401, 'Falta la clave del buzón: mandala en el encabezado Authorization: Bearer <clave>.');
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail(400, 'El cuerpo tiene que ser JSON, por ejemplo {"title": "…", "description": "…"}.');
  const b = body as Record<string, unknown>;

  const { data, error } = await supabaseAdmin().rpc('ingest_idea', {
    p_hash: createHash('sha256').update(key).digest('hex'),
    p_source: 'api',
    p_title: str(b.title, 500),
    p_description: str(b.description, 4000),
    p_name: str(b.name, 200),
    p_email: str(b.email, 200),
    p_category: str(b.category, 100),
    p_external_ref: str(b.external_id, 200),
  });
  if (error) {
    // The same external_id sent twice at the same time: the other request already created it.
    if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
    const status = STATUS[error.code || ''];
    if (status) return fail(status, error.message);
    await reportError('integraciones', error, { code: error.code });
    return fail(500, 'No pudimos guardar la idea. Probá de nuevo en unos minutos.');
  }
  const r = data as { id: number; duplicate: boolean };
  // «Llegó una idea por integración» in the board's Slack channel, if it has one.
  if (!r.duplicate) await dispatchSlack(10).catch((e) => reportError('slack', e));
  return NextResponse.json({ ok: true, id: r.id, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
}

// Some tools check the address with a GET before saving the connection.
export function GET() {
  return NextResponse.json({ ok: true, info: 'Boxinger: mandá un POST con la clave del buzón para crear una idea.' });
}
