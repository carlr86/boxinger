import { NextResponse, type NextRequest } from 'next/server';
import { reportError } from '@/lib/alerts';
import { ipHash } from '@/lib/email/contact';

// Browser crashes sent by ErrorReporter / error.tsx. Public, so: small payloads and a per-connection limit.
const seen = new Map<string, { n: number; at: number }>();
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function POST(req: NextRequest) {
  const ip = ipHash(req.headers);
  const now = Date.now(), cur = seen.get(ip);
  const n = cur && now - cur.at < 600_000 ? cur.n + 1 : 1;
  seen.set(ip, { n, at: n === 1 ? now : cur!.at });
  if (seen.size > 5000) seen.clear();
  if (n > 10) return NextResponse.json({ ok: true }); // at most 10 reports per connection every 10 minutes

  const b = await req.json().catch(() => null);
  const message = str(b?.message, 500);
  if (!message) return NextResponse.json({ ok: true });
  await reportError('navegador', new Error(message), {
    path: str(b?.path, 300), stack: str(b?.stack, 2000) || undefined, digest: str(b?.digest, 100) || undefined,
    kind: str(b?.kind, 30), browser: str(req.headers.get('user-agent'), 200),
  });
  return NextResponse.json({ ok: true });
}
