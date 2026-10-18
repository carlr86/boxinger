import 'server-only';
import { DOC_SECTIONS, allDocs, sectionLabel } from '@/lib/docs';
import type { Locale } from '@/lib/i18n';
import type { DocNav } from '@/components/docs/DocsShell';

export function docNav(locale: Locale): DocNav {
  const docs = allDocs(locale);
  return DOC_SECTIONS.map((s) => ({ k: s.k, label: sectionLabel(locale, s.k), docs: docs.filter((d) => d.section === s.k).map((d) => ({ slug: d.slug, title: d.title })) }))
    .filter((s) => s.docs.length);
}
