import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { MyContext } from '@/lib/types';

/** get_my_context for the current request (null when signed out). Cached per request. */
export const getContext = cache(async (): Promise<MyContext | null> => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.rpc('get_my_context');
  return (data as MyContext) ?? null;
});

export async function requireContext(next: string): Promise<MyContext> {
  const ctx = await getContext();
  if (!ctx) redirect('/app/ingresar?next=' + encodeURIComponent(next));
  return ctx;
}

/** Where a signed-in user lands: admin panel, their boards, the only guest board, or onboarding. */
export function homePath(ctx: MyContext): string {
  if (ctx.me.is_super_admin && !ctx.account && ctx.teams.length === 0) return '/app/admin';
  if (ctx.teams.length > 0) return '/app/buzones';
  if (ctx.guest_boards.length === 1) return '/app/b/' + ctx.guest_boards[0].slug;
  if (ctx.guest_boards.length > 1) return '/app/buzones';
  return '/app/onboarding';
}

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}
