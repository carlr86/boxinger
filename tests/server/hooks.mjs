// Module resolution for the server tests (see register.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'src');

// The real clients talk to Supabase; the tests use the fake instead.
const FAKES = {
  '@/lib/supabase/admin': path.join(HERE, 'fakes', 'supabase-admin.ts'),
  '@/lib/supabase/server': path.join(HERE, 'fakes', 'supabase-server.ts'),
};

function withExtension(file) {
  for (const f of [file, file + '.ts', file + '.tsx', path.join(file, 'index.ts')]) {
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (FAKES[specifier]) return { url: pathToFileURL(FAKES[specifier]).href, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const f = withExtension(path.join(SRC, specifier.slice(2)));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:') && !context.parentURL.includes('/node_modules/')) {
    const f = withExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  try {
    return await next(specifier, context);
  } catch (e) {
    // Packages without an exports map ("next/server") need the file name in plain Node.
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && !specifier.startsWith('.') && !path.extname(specifier)) return next(specifier + '.js', context);
    throw e;
  }
}
