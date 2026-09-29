import { publicOrigin } from '@/lib/origin';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/session';

// OAuth (Google) and PKCE email links land here with ?code=.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = publicOrigin(request);
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    // Code already used (reload, double redirect) but the session is there: carry on.
    const { data: { user } } = await sb.auth.getUser();
    if (user) return NextResponse.redirect(new URL(next, origin));
    // The email was verified by Supabase, but this browser has no PKCE verifier (another device).
    return NextResponse.redirect(new URL('/app/ingresar?aviso=verificado&next=' + encodeURIComponent(next), origin));
  }
  const err = url.searchParams.get('error_description');
  return NextResponse.redirect(new URL('/app/ingresar?aviso=error&next=' + encodeURIComponent(next) + (err ? '' : ''), origin));
}
