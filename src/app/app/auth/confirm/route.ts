import { publicOrigin } from '@/lib/origin';
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/session';

// Email templates link here with ?token_hash=&type= (works from any device).
// See docs/SETUP.md › Plantillas de email de Supabase.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = publicOrigin(request);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  let next = url.searchParams.get('next') || '/app';
  try {
    let n = new URL(next, origin);
    // emailRedirectTo points at /app/auth/callback?next=…; unwrap it (no PKCE code in this flow).
    if (n.pathname === '/app/auth/callback' && n.searchParams.get('next')) n = new URL(n.searchParams.get('next')!, origin);
    next = n.origin === origin || n.origin === url.origin ? n.pathname + n.search : '/app';
  } catch {
    next = '/app';
  }
  if (type === 'recovery') next = '/app/nueva-contrasena';
  next = safeNext(next);
  if (token_hash && type) {
    const sb = await createClient();
    const { error } = await sb.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL('/app/ingresar?aviso=error&next=' + encodeURIComponent(next), origin));
}
