import { Suspense } from 'react';
import { requireContext } from '@/lib/session';
import { AppHeader } from '@/components/AppHeader';
import { Profile } from './Profile';

export const metadata = { title: 'Mi perfil · Boxinger' };

export default async function Perfil() {
  await requireContext('/app/perfil');
  return (
    <>
      <AppHeader />
      <main className="bx-main"><Suspense><Profile /></Suspense></main>
    </>
  );
}
