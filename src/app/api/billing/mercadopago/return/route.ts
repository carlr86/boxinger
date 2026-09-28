import { NextResponse, type NextRequest } from 'next/server';
import { handlePreapproval } from '@/lib/billing/mp-events';

// Mercado Pago back_url. The webhook is the source of truth; this shows the upgrade right away.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('preapproval_id');
  if (id) await handlePreapproval(id).catch((e) => console.error('mp return', e));
  return NextResponse.redirect(new URL('/app/perfil?tab=sub&checkout=ok', req.nextUrl.origin));
}
