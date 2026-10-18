import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/session';
import { AppHeader } from '@/components/AppHeader';
import { getT } from '@/lib/i18n/server';
import { allDocs, docBySlug, sectionLabel } from '@/lib/docs';
import { ContactFoot, DocsShell } from '@/components/docs/DocsShell';
import { docNav } from '../nav';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { t, locale } = await getT();
  const d = docBySlug(locale, (await params).slug);
  return { title: (d ? d.title + ' · ' : '') + t('Documentación') + ' · Boxinger' };
}

export default async function Articulo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireContext('/app/ayuda/' + slug);
  const { t, locale } = await getT();
  const d = docBySlug(locale, slug);
  if (!d) notFound();
  const list = allDocs(locale);
  const k = list.findIndex((x) => x.slug === slug);
  const prev = list[k - 1], next = list[k + 1];
  return (
    <>
      <AppHeader />
      <main className="bx-main">
        <DocsShell nav={docNav(locale)} current={slug}>
          <article style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="doc-crumb"><Link href="/app/ayuda">{t('Documentación')}</Link> › {sectionLabel(locale, d.section)}</span>
              <h1 className="doc-h1">{d.title}</h1>
              {d.summary && <p style={{ margin: 0, fontSize: 16, color: 'rgba(0,0,0,0.6)', textWrap: 'pretty' }}>{d.summary}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {d.plans && <span className="doc-chip doc-chip-plan">{d.plans}</span>}
                {d.roles && <span className="doc-chip">{d.roles}</span>}
              </div>
            </div>
            <div className="doc-body" dangerouslySetInnerHTML={{ __html: d.html }} />
            <div className="doc-pager">
              {prev ? <Link href={'/app/ayuda/' + prev.slug}>← {prev.title}</Link> : <span />}
              {next ? <Link href={'/app/ayuda/' + next.slug}>{next.title} →</Link> : <span />}
            </div>
            <ContactFoot />
          </article>
        </DocsShell>
      </main>
    </>
  );
}
