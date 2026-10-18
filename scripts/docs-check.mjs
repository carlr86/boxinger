// Documentación (content/ayuda): every article exists in Spanish and English, with its header complete.
// Run with `npm run docs:check`. When a feature changes, its article (see `covers`) is updated in both languages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'content', 'ayuda');
const LANGS = ['es', 'en'];
const SECTIONS = ['inicio', 'ideas', 'priorizar', 'medir', 'comunidad', 'datos', 'cuenta'];
const REQUIRED = ['title', 'summary', 'section', 'order', 'plans', 'roles', 'covers'];

const read = (lang) => Object.fromEntries(fs.readdirSync(path.join(DIR, lang)).filter((f) => f.endsWith('.md')).map((f) => {
  const src = fs.readFileSync(path.join(DIR, lang, f), 'utf8');
  const head = {};
  for (const line of (src.match(/^---\n([\s\S]*?)\n---/)?.[1] || '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) head[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return [f.replace(/\.md$/, ''), { head, src }];
}));

const docs = Object.fromEntries(LANGS.map((l) => [l, read(l)]));
const problems = [];
const slugs = new Set(LANGS.flatMap((l) => Object.keys(docs[l])));
for (const slug of slugs) {
  for (const l of LANGS) {
    const d = docs[l][slug];
    if (!d) { problems.push(`${l}/${slug}.md: falta (existe en ${LANGS.filter((x) => docs[x][slug]).join(', ')})`); continue; }
    for (const k of REQUIRED) if (!d.head[k]) problems.push(`${l}/${slug}.md: falta «${k}» en el encabezado`);
    if (d.head.section && !SECTIONS.includes(d.head.section)) problems.push(`${l}/${slug}.md: sección desconocida «${d.head.section}»`);
    for (const m of d.src.matchAll(/\]\(\/app\/ayuda\/([a-z0-9-]+)\)/g)) if (!slugs.has(m[1])) problems.push(`${l}/${slug}.md: link a un artículo que no existe (${m[1]})`);
  }
  const [a, b] = LANGS.map((l) => docs[l][slug]?.head);
  if (a && b && (a.section !== b.section || a.covers !== b.covers)) problems.push(`${slug}: la sección o «covers» no coinciden entre idiomas`);
}
if (problems.length) { console.log(problems.join('\n')); console.log(`\n${problems.length} problema(s) en la documentación`); process.exit(1); }
console.log(`Documentación OK: ${slugs.size} artículos en ${LANGS.join(' y ')}`);
