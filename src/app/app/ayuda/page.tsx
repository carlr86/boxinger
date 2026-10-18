import { requireContext } from '@/lib/session';
import { AppHeader } from '@/components/AppHeader';
import { getT } from '@/lib/i18n/server';
import { allDocs } from '@/lib/docs';
import { DocsHome, DocsShell } from '@/components/docs/DocsShell';
import { docNav } from './nav';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Documentación') + ' · Boxinger' };
}

export default async function Ayuda({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireContext('/app/ayuda');
  const { locale } = await getT();
  const q = String((await searchParams).q || '').slice(0, 80);
  const docs = allDocs(locale).map(({ slug, title, summary, text, section }) => ({ slug, title, summary, text, section }));
  const nav = docNav(locale);
  return (
    <>
      <AppHeader />
      <main className="bx-main"><DocsShell nav={nav} initialQ={q}><DocsHome nav={nav} docs={docs} q={q} /></DocsShell></main>
    </>
  );
}
