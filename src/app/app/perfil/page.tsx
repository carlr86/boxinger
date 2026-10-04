import { Suspense } from 'react';
import { requireContext } from '@/lib/session';
import { AppHeader } from '@/components/AppHeader';
import { Profile } from './Profile';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Mi perfil') + ' · Boxinger' };
}

export default async function Perfil() {
  await requireContext('/app/perfil');
  return (
    <>
      <AppHeader />
      <main className="bx-main"><Suspense><Profile /></Suspense></main>
    </>
  );
}
