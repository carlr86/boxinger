// Lists interface texts with no English yet (src/lib/i18n/en.ts). Usage: npm run i18n [-- --all]
// 1. Every t('…') / plural(…, '…', '…') literal must be in EN (errors: the build is fine, but English shows Spanish).
// 2. Spanish-looking texts that are not wrapped yet (heuristic, for review).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = [/src\/components\/admin\//, /src\/app\/app\/admin\//, /src\/lib\/i18n\//, /src\/app\/api\//, /src\/lib\/billing\//, /\.d\.ts$/];

const enSrc = fs.readFileSync(path.join(ROOT, 'src/lib/i18n/en.ts'), 'utf8').split('export const EN_PATTERNS')[0];
const keys = new Set();
for (const m of enSrc.matchAll(/^\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'):/gm)) {
  keys.add(m[1] !== undefined ? JSON.parse('"' + m[1] + '"') : m[2].replace(/\\'/g, "'"));
}

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(f.name) && !SKIP.some((r) => r.test(p))) files.push(p);
  }
})(path.join(ROOT, 'src'));

const unq = (q, s) => (q === '"' ? JSON.parse('"' + s + '"') : s.replace(/\\'/g, "'"));
const spanish = (s) => /[áéíóúñ¿¡]/i.test(s) || /\b(de|la|el|los|las|tu|tus|con|para|una|un|que|se|no|por|del|al|en|y|o)\b/i.test(s);
const codey = (s) => /^[\w.-]+$/.test(s) || /rgba?\(|#[0-9a-f]{3,6}\b|\dpx|^\/|https?:|^[a-z_]+:[a-z_]|=>|\(\)|^\s*$/.test(s);

let missing = 0, loose = 0;
const all = process.argv.includes('--all');
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const rel = path.relative(ROOT, f);
  const wrapped = new Set();
  for (const m of src.matchAll(/\b(?:t|plural)\(\s*(?:[^,()'"]+,\s*)?(['"])((?:(?!\1)[^\\]|\\.)*)\1(?:\s*,\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3)?/g)) {
    for (const [q, s] of [[m[1], m[2]], [m[3], m[4]]]) {
      if (s === undefined) continue;
      const k = unq(q, s);
      wrapped.add(k);
      if (!keys.has(k)) { missing++; console.log(`MISSING ${rel}: ${k}`); }
    }
  }
  if (!all && !process.argv.includes('--loose')) continue;
  const seen = new Set();
  for (const m of src.matchAll(/(['"])((?:(?!\1)[^\\\n]|\\.){3,})\1|>\s*([^<>{}\n]*[A-Za-zÁÉÍÓÚáéíóúñ]{2,}[^<>{}\n]*?)\s*</g)) {
    const s = m[3] !== undefined ? m[3].trim() : unq(m[1], m[2]);
    if (!s || seen.has(s) || wrapped.has(s) || keys.has(s) || codey(s) || !spanish(s)) continue;
    seen.add(s); loose++;
    console.log(`LOOSE   ${rel}: ${s}`);
  }
}
console.log(`\n${missing} missing translation(s)` + (all || process.argv.includes('--loose') ? `, ${loose} unwrapped Spanish text(s)` : ''));
process.exit(missing ? 1 : 0);
