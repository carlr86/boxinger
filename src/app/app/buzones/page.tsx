import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { BoardsPage } from '@/components/boards/BoardsPage';
import { requireContext } from '@/lib/session';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Mis Buzones') + ' · Boxinger' };
}

export default async function Buzones() {
  const ctx = await requireContext('/app/buzones');
  // Brand-new people go through the onboarding, unless they chose "Omitir".
  if (ctx.teams.length === 0 && ctx.guest_boards.length === 0 && !ctx.me.onboarding_skipped) redirect('/app/onboarding');
  return <Suspense><BoardsPage /></Suspense>;
}
