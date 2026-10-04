// Runs every migration on an in-memory Postgres (PGlite) and gives each test file small helpers.
// bootstrap.sql stands in for the Supabase schemas (auth, storage, roles) the migrations expect.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(HERE, '..', 'migrations');

export async function setup() {
  const db = new PGlite({ extensions: { pgcrypto, unaccent } });
  await db.exec(fs.readFileSync(path.join(HERE, 'bootstrap.sql'), 'utf8'));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
    } catch (e) {
      console.error('✗ migration', f, e.message, e.position ? '@' + e.position : '', e.where || '');
      process.exit(1);
    }
  }

  let fails = 0, passes = 0;
  /** Runs SQL as a signed-in user (uid) or anon, like PostgREST does. */
  async function as(uid, sql, params = [], role = uid ? 'authenticated' : 'anon') {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
      await tx.exec(`set local role ${role}`);
      const r = await tx.query(sql, params);
      return r.rows;
    });
  }
  const rpc = async (uid, fn, args = [], role) => {
    const ph = args.map((_, i) => '$' + (i + 1)).join(', ');
    const rows = await as(uid, `select public.${fn}(${ph}) as r`, args, role);
    return rows[0]?.r;
  };
  async function ok(name, f) {
    try { const r = await f(); passes++; console.log('  ok  ', name); return r; }
    catch (e) { fails++; console.log('  FAIL', name, '→', e.message, e.where || ''); }
  }
  async function err(name, f, match) {
    try { await f(); fails++; console.log('  FAIL', name, '→ expected error', match); }
    catch (e) {
      if (match && !e.message.includes(match)) { fails++; console.log('  FAIL', name, '→ wrong error:', e.message); }
      else { passes++; console.log('  ok  ', name, '·', e.message); }
    }
  }
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || 'eq'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
  const done = () => { console.log(`\n${passes} ok, ${fails} failed`); process.exit(fails ? 1 : 0); };
  return { db, as, rpc, ok, err, eq, done };
}
