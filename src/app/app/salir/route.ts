import { publicOrigin } from '@/lib/origin';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const sb = await createClient();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL('/', publicOrigin(request)), { status: 303 });
}
