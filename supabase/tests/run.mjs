// npm run test:db — runs each *.test.mjs on its own fresh database and fails if any check fails.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = fs.readdirSync(HERE).filter((f) => f.endsWith('.test.mjs') && (!only || f.includes(only))).sort();
let failed = [];
for (const f of files) {
  console.log(`\n━━ ${f}`);
  const r = spawnSync(process.execPath, [path.join(HERE, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
}
console.log(failed.length ? `\n✗ Fallaron: ${failed.join(', ')}` : `\n✓ ${files.length} archivos de pruebas OK`);
process.exit(failed.length ? 1 : 0);
