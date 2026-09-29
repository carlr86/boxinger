import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { publicOrigin } from '@/lib/origin';

const PROTECTED = ['/app/buzones', '/app/perfil', '/app/admin', '/app/onboarding'];

// Refreshes the Supabase session cookie on every /app request and sends signed-out
// users away from private screens. Authorization itself lives in Postgres.
export async function proxy(request: NextRequest) {
  // Supabase falls back to the Site URL (the landing) when the OAuth redirect isn't in its
  // allow-list. Finish the sign-in anyway: exchange the code and go to the user's home.
  if (request.nextUrl.pathname === '/') {
    const sp = request.nextUrl.searchParams;
    if (sp.has('code') || sp.has('error_description')) {
      const target = sp.has('code') ? '/app/auth/callback?code=' + encodeURIComponent(sp.get('code')!) + '&next=%2Fapp' : '/app/ingresar?aviso=error';
      return NextResponse.redirect(new URL(target, publicOrigin(request)));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + '/'))) {
    return NextResponse.redirect(new URL('/app/ingresar?next=' + encodeURIComponent(path + request.nextUrl.search), publicOrigin(request)));
  }
  return response;
}

export const config = { matcher: ['/', '/app/:path*'] };
