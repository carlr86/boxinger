import { redirect } from 'next/navigation';
import { requireContext } from '@/lib/session';
import { AppHeader } from '@/components/AppHeader';
import { Onboarding } from './Onboarding';

export const metadata = { title: 'Creá tu buzón · Boxinger' };

export default async function OnboardingPage() {
  const ctx = await requireContext('/app/onboarding');
  if (ctx.teams.some((t) => t.own)) redirect('/app/buzones');
  return (
    <>
      <AppHeader />
      <main className="bx-main"><Onboarding defaultName={ctx.me.name} /></main>
    </>
  );
}
