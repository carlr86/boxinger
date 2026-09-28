import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { BoardsPage } from '@/components/boards/BoardsPage';
import { requireContext } from '@/lib/session';

export const metadata = { title: 'Mis Buzones · Boxinger' };

export default async function Buzones() {
  const ctx = await requireContext('/app/buzones');
  if (ctx.teams.length === 0 && ctx.guest_boards.length === 0) redirect('/app/onboarding');
  return <Suspense><BoardsPage /></Suspense>;
}
