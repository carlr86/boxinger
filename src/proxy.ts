import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED = ['/app/buzones', '/app/perfil', '/app/admin', '/app/onboarding'];

// Refreshes the Supabase session cookie on every /app request and sends signed-out
// users away from private screens. Authorization itself lives in Postgres.
export async function proxy(request: NextRequest) {
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
    const url = request.nextUrl.clone();
    url.pathname = '/app/ingresar';
    url.search = '?next=' + encodeURIComponent(path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = { matcher: ['/app/:path*'] };
