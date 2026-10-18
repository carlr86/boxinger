import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { Locale } from '@/lib/i18n';

// Documentación (Mi perfil › Documentación, /app/ayuda): one Markdown file per article and language in
// content/ayuda/<es|en>/<slug>.md, with a small header (title, summary, section, order, plans, roles, covers).
// Every feature change updates its article in both languages; `npm run docs:check` checks both exist.
// The content is ours, so the small renderer below turns a simple Markdown into HTML (escaping everything first).

const DIR = path.join(process.cwd(), 'content', 'ayuda');

export const DOC_SECTIONS = [
  { k: 'inicio', es: 'Primeros pasos', en: 'Getting started' },
  { k: 'ideas', es: 'Ideas', en: 'Ideas' },
  { k: 'priorizar', es: 'Priorizar y planificar', en: 'Prioritize and plan' },
  { k: 'medir', es: 'Medir y comunicar', en: 'Measure and share' },
  { k: 'comunidad', es: 'Comunidad y equipo', en: 'Community and team' },
  { k: 'datos', es: 'Datos e integraciones', en: 'Data and integrations' },
  { k: 'cuenta', es: 'Configuración y cuenta', en: 'Settings and account' },
] as const;

export type DocMeta = { slug: string; title: string; summary: string; section: string; order: number; plans: string; roles: string; covers: string[] };
export type Doc = DocMeta & { html: string; text: string };

function parse(slug: string, src: string): Doc {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const head: Record<string, string> = {};
  for (const line of (m?.[1] || '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) head[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  const body = m ? m[2] : src;
  return {
    slug, title: head.title || slug, summary: head.summary || '', section: head.section || 'inicio', order: Number(head.order) || 99,
    plans: head.plans || '', roles: head.roles || '', covers: (head.covers || '').split(',').map((x) => x.trim()).filter(Boolean),
    html: render(body), text: body.replace(/[#>*`_[\]()|-]/g, ' ').replace(/\s+/g, ' ').trim(),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // links: only to other articles, the app, or https
    .replace(/\[([^\]]+)\]\(((?:\/app\/|https:\/\/|#)[^)\s]*)\)/g, (_, text, href) =>
      `<a href="${href}"${href.startsWith('https://') ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`);
}

/** Headings (## / ###), paragraphs, lists (- / 1.), callouts (> **Tip:** …), tables (| a | b |). */
export function render(md: string): string {
  const out: string[] = [];
  const blocks = md.replace(/\r/g, '').split(/\n{2,}/);
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;
    const lines = b.split('\n');
    if (/^#{2,3} /.test(b)) {
      const lvl = b.startsWith('### ') ? 3 : 2;
      const text = b.replace(/^#{2,3} /, '');
      const id = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.push(`<h${lvl} id="${id}">${inline(text)}</h${lvl}>`);
      if (lines.length > 1) out.push(render(lines.slice(1).join('\n')));
    } else if (lines.every((l) => /^>/.test(l))) {
      const text = lines.map((l) => l.replace(/^>\s?/, '')).join(' ');
      const kind = /^\*\*(Importante|Important)/.test(text) ? 'warn' : /^\*\*(Tip|Consejo)/.test(text) ? 'tip' : 'note';
      out.push(`<div class="doc-callout doc-${kind}">${inline(text)}</div>`);
    } else if (lines.every((l) => /^\s*- /.test(l))) {
      out.push('<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*- /, ''))}</li>`).join('') + '</ul>');
    } else if (lines.every((l) => /^\s*\d+\. /.test(l))) {
      out.push('<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\. /, ''))}</li>`).join('') + '</ol>');
    } else if (lines.length >= 2 && lines.every((l) => /^\|.*\|$/.test(l.trim()))) {
      const rows = lines.filter((l) => !/^\|[\s:|-]+\|$/.test(l.trim())).map((l) => l.trim().slice(1, -1).split('|').map((c) => inline(c.trim())));
      out.push('<div class="doc-table"><table><thead><tr>' + rows[0].map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        rows.slice(1).map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
    } else {
      out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

/** Every article of a language, in index order. */
export function allDocs(locale: Locale): Doc[] {
  const dir = path.join(DIR, locale);
  if (!fs.existsSync(dir)) return [];
  const order = (s: string) => DOC_SECTIONS.findIndex((x) => x.k === s);
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    .map((f) => parse(f.replace(/\.md$/, ''), fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => order(a.section) - order(b.section) || a.order - b.order || a.title.localeCompare(b.title));
}

export const docBySlug = (locale: Locale, slug: string) => (/^[a-z0-9-]+$/.test(slug) ? allDocs(locale).find((d) => d.slug === slug) || null : null);
export const sectionLabel = (locale: Locale, k: string) => DOC_SECTIONS.find((s) => s.k === k)?.[locale] || k;
