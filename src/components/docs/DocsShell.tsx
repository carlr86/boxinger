'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n/client';

// Documentación: index on the left (a drop-down on phones) and a search box that leads to the results.
export type DocNav = { k: string; label: string; docs: { slug: string; title: string }[] }[];

export function DocsShell({ nav, current, children, initialQ = '' }: { nav: DocNav; current?: string; children: React.ReactNode; initialQ?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const go = (v: string) => router.push('/app/ayuda' + (v.trim() ? '?q=' + encodeURIComponent(v.trim()) : ''));
  return (
    <div className="doc-shell">
      <aside className="doc-nav">
        <Link href="/app/ayuda" className="doc-nav-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 20.5A2.5 2.5 0 016.5 23H20v-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
          {t('Documentación')}
        </Link>
        <form onSubmit={(e) => { e.preventDefault(); go(q); }}>
          <input className="bx-input" value={q} onChange={(e) => { setQ(e.target.value); if (!current) go(e.target.value); }} placeholder={t('Buscar en la ayuda')} style={{ width: '100%', height: 36 }} />
        </form>
        <select className="bx-select doc-nav-select" value={current || ''} onChange={(e) => router.push('/app/ayuda/' + e.target.value)}>
          <option value="" disabled>{t('Elegí un tema')}</option>
          {nav.map((s) => <optgroup key={s.k} label={s.label}>{s.docs.map((d) => <option key={d.slug} value={d.slug}>{d.title}</option>)}</optgroup>)}
        </select>
        <nav className="doc-nav-list">
          {nav.map((s) => (
            <div key={s.k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="doc-nav-section">{s.label}</span>
              {s.docs.map((d) => <Link key={d.slug} href={'/app/ayuda/' + d.slug} className={'doc-nav-link' + (d.slug === current ? ' on' : '')}>{d.title}</Link>)}
            </div>
          ))}
        </nav>
      </aside>
      <div className="doc-main">{children}</div>
    </div>
  );
}

/** Home: the sections as cards, or the search results. */
export function DocsHome({ nav, docs, q }: { nav: DocNav; docs: { slug: string; title: string; summary: string; text: string; section: string }[]; q: string }) {
  const { t } = useI18n();
  const words = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const found = words.length ? docs.filter((d) => { const h = norm(d.title + ' ' + d.summary + ' ' + d.text); return words.every((w) => h.includes(w)); }) : [];
  if (words.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 className="doc-h1">{t('Resultados para «{q}»', { q })}</h1>
      {found.length === 0 && <p style={{ color: 'rgba(0,0,0,0.55)' }}>{t('No encontramos nada con esas palabras. Probá con otras o escribinos.')}</p>}
      {found.map((d) => (
        <Link key={d.slug} href={'/app/ayuda/' + d.slug} className="doc-card">
          <b>{d.title}</b><span>{d.summary}</span>
        </Link>
      ))}
      <ContactFoot />
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 className="doc-h1">{t('Documentación')}</h1>
        <p style={{ margin: '6px 0 0', color: 'rgba(0,0,0,0.6)' }}>{t('Todo lo que podés hacer en Boxinger, paso a paso.')}</p>
      </div>
      {nav.map((s) => (
        <section key={s.k} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{s.label}</h2>
          <div className="doc-grid">
            {s.docs.map((d) => {
              const full = docs.find((x) => x.slug === d.slug)!;
              return <Link key={d.slug} href={'/app/ayuda/' + d.slug} className="doc-card"><b>{d.title}</b><span>{full.summary}</span></Link>;
            })}
          </div>
        </section>
      ))}
      <ContactFoot />
    </div>
  );
}

export function ContactFoot() {
  const { t } = useI18n();
  return (
    <div className="doc-foot">
      {t('¿No encontraste lo que buscabas?')} <a href="mailto:hola@boxinger.com">{t('Escribinos a hola@boxinger.com')}</a>
    </div>
  );
}
