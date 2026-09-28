import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/session';

// OAuth (Google) and PKCE email links land here with ?code=.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    // The email was verified by Supabase, but this browser has no PKCE verifier (another device).
    return NextResponse.redirect(new URL('/app/ingresar?aviso=verificado&next=' + encodeURIComponent(next), url.origin));
  }
  const err = url.searchParams.get('error_description');
  return NextResponse.redirect(new URL('/app/ingresar?aviso=error&next=' + encodeURIComponent(next) + (err ? '' : ''), url.origin));
}
