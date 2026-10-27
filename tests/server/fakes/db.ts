// In-memory stand-in for the Supabase client: the slice of supabase-js the server code uses (from/select/filters/
// update/insert/upsert/delete, rpc, auth.admin), with unique keys like the real tables and failures on demand.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type DbError = { message: string; code?: string };
type Result = { data: any; error: DbError | null; count?: number | null };

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const same = (a: unknown, b: unknown) => a === b || (a != null && b != null && String(a) === String(b));
const cmp = (a: any, b: any) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? '')));

/** SQL LIKE pattern (with \ escapes) as a case-insensitive regex. */
function likeRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '%') re += '.*';
    else if (c === '_') re += '.';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

/** Splits "a, b, profiles:owner_id (name, email)" at the commas outside parentheses. */
function splitCols(cols: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const c of cols) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Unique keys, as in the migrations (null values never collide, like Postgres). */
  unique: Record<string, string[][]> = {
    billing_events: [['provider', 'event_id']],
    payments: [['provider', 'provider_payment_id']],
    email_outbox: [['dedupe_key']],
    subscriptions: [['account_id']],
  };
  rpcs: Record<string, (args: Row) => unknown> = {
    claim_outbox: () => [],
    notify_super_admins: () => null,
    record_app_error: () => false,
  };
  /** Every rpc call, in order (record_app_error = an error was reported). */
  calls: { fn: string; args: Row }[] = [];
  /** Passwords and other changes made through auth.admin, by user id. */
  authUsers: Record<string, Row> = {};
  private failures: { table: string; op: string; error: DbError }[] = [];
  private seq = 1;

  rows(table: string): Row[] {
    return (this.tables[table] ||= []);
  }

  seed(table: string, ...rows: Row[]) {
    for (const r of rows) this.rows(table).push({ id: r.id ?? this.seq++, ...clone(r) });
  }

  /** The next `op` ('select' | 'update' | 'insert' | 'upsert' | 'delete' | 'rpc' | 'auth') on `table` fails. */
  failNext(table: string, op: string, message = 'simulated database failure') {
    this.failures.push({ table, op, error: { message, code: 'XX000' } });
  }

  takeFailure(table: string, op: string): DbError | null {
    const i = this.failures.findIndex((f) => f.table === table && f.op === op);
    return i < 0 ? null : this.failures.splice(i, 1)[0].error;
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(fn: string, args: Row = {}) {
    return new Deferred(() => {
      this.calls.push({ fn, args: clone(args) });
      const error = this.takeFailure(fn, 'rpc');
      if (error) return { data: null, error };
      const h = this.rpcs[fn];
      if (!h) return { data: null, error: { message: `fake: no handler for rpc ${fn}` } };
      return { data: clone(h(args)), error: null };
    });
  }

  auth = {
    admin: {
      updateUserById: async (id: string, attrs: Row) => {
        const error = this.takeFailure('auth', 'auth');
        if (error) return { data: { user: null }, error };
        this.authUsers[id] = { ...this.authUsers[id], ...attrs };
        return { data: { user: { id } }, error: null };
      },
      deleteUser: async (id: string) => {
        delete this.authUsers[id];
        return { data: {}, error: null };
      },
    },
  };

  /** Inserts one row, or returns the unique-key violation it would cause. */
  insertRow(table: string, value: Row): DbError | Row {
    for (const key of this.unique[table] || []) {
      if (key.some((k) => value[k] == null)) continue;
      if (this.rows(table).some((r) => key.every((k) => same(r[k], value[k])))) {
        return { message: `duplicate key value violates unique constraint "${table}_${key.join('_')}_key"`, code: '23505' };
      }
    }
    const row = { id: value.id ?? this.seq++, ...clone(value) };
    this.rows(table).push(row);
    return row;
  }

  project(table: string, row: Row, cols: string): Row {
    const out: Row = {};
    for (const c of splitCols(cols)) {
      const embed = c.match(/^(\w+)(?::(\w+))?(?:!\w+)?\s*\((.*)\)$/s);
      if (embed) {
        const [, target, fk, inner] = embed;
        const hit = fk ? this.rows(target).find((r) => same(r.id, row[fk])) : null;
        out[target] = hit ? this.project(target, hit, inner) : null;
      } else if (c === '*') Object.assign(out, clone(row));
      else out[c] = clone(row[c]) ?? null;
    }
    return out;
  }
}

/** A lazily-run call that can be awaited, like supabase-js builders. */
class Deferred implements PromiseLike<Result> {
  protected throwing = false;
  private run: () => Result;
  constructor(run: () => Result) {
    this.run = run;
  }
  throwOnError() {
    this.throwing = true;
    return this;
  }
  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return Promise.resolve()
      .then(() => {
        const r = this.run();
        if (this.throwing && r.error) throw Object.assign(new Error(r.error.message), r.error);
        return r;
      })
      .then(ok, fail);
  }
}

class Query extends Deferred {
  private op: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
  private cols = '*';
  private returning = false;
  private values: Row[] = [];
  private filters: ((r: Row) => boolean)[] = [];
  private sorts: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private conflict: string[] = [];
  private ignoreDuplicates = false;
  private counting = false;
  private db: FakeDb;
  private table: string;

  constructor(db: FakeDb, table: string) {
    super(() => this.exec());
    this.db = db;
    this.table = table;
  }

  select(cols = '*', o?: { count?: string }) {
    this.cols = cols;
    if (this.op !== 'select') this.returning = true;
    if (o?.count) this.counting = true;
    return this;
  }
  update(v: Row) { this.op = 'update'; this.values = [v]; return this; }
  insert(v: Row | Row[]) { this.op = 'insert'; this.values = Array.isArray(v) ? v : [v]; return this; }
  upsert(v: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.values = Array.isArray(v) ? v : [v];
    this.conflict = (o.onConflict || 'id').split(',').map((s) => s.trim());
    this.ignoreDuplicates = !!o.ignoreDuplicates;
    return this;
  }
  delete(o?: { count?: string }) { this.op = 'delete'; if (o?.count) this.counting = true; return this; }

  private where(f: (r: Row) => boolean) { this.filters.push(f); return this; }
  eq(c: string, v: unknown) { return this.where((r) => same(r[c], v)); }
  neq(c: string, v: unknown) { return this.where((r) => !same(r[c], v)); }
  in(c: string, vs: unknown[]) { return this.where((r) => vs.some((v) => same(r[c], v))); }
  is(c: string, v: null | boolean) { return this.where((r) => (v === null ? r[c] == null : r[c] === v)); }
  lt(c: string, v: unknown) { return this.where((r) => r[c] != null && cmp(r[c], v) < 0); }
  lte(c: string, v: unknown) { return this.where((r) => r[c] != null && cmp(r[c], v) <= 0); }
  gt(c: string, v: unknown) { return this.where((r) => r[c] != null && cmp(r[c], v) > 0); }
  gte(c: string, v: unknown) { return this.where((r) => r[c] != null && cmp(r[c], v) >= 0); }
  ilike(c: string, p: string) { const re = likeRegex(p); return this.where((r) => r[c] != null && re.test(String(r[c]))); }
  not(c: string, op: string, v: unknown) {
    if (op !== 'is') throw new Error('fake: not() only supports "is"');
    return this.where((r) => (v === null ? r[c] != null : r[c] !== v));
  }
  order(col: string, o: { ascending?: boolean } = {}) { this.sorts.push({ col, asc: o.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[], count: number | null = null): Result {
    let data: any = rows.map((r) => this.db.project(this.table, r, this.cols));
    if (this.mode !== 'many') {
      if (data.length > 1 || (this.mode === 'single' && data.length === 0)) {
        return { data: null, error: { message: `JSON object requested, ${data.length} rows returned`, code: 'PGRST116' }, count };
      }
      data = data[0] ?? null;
    }
    return { data, error: null, count };
  }

  private exec(): Result {
    const error = this.db.takeFailure(this.table, this.op);
    if (error) return { data: null, error, count: null };

    if (this.op === 'select') {
      let rows = this.matching();
      for (const s of [...this.sorts].reverse()) rows = [...rows].sort((a, b) => (s.asc ? 1 : -1) * cmp(a[s.col], b[s.col]));
      if (this.max != null) rows = rows.slice(0, this.max);
      return this.shape(rows, this.counting ? rows.length : null);
    }
    if (this.op === 'update') {
      const rows = this.matching();
      for (const r of rows) Object.assign(r, clone(this.values[0]));
      return this.returning ? this.shape(rows) : { data: null, error: null, count: null };
    }
    if (this.op === 'delete') {
      const rows = this.matching();
      this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !rows.includes(r));
      return { data: this.returning ? rows : null, error: null, count: this.counting ? rows.length : null };
    }
    const written: Row[] = [];
    for (const v of this.values) {
      if (this.op === 'upsert' && this.conflict.every((k) => v[k] != null)) {
        const hit = this.db.rows(this.table).find((r) => this.conflict.every((k) => same(r[k], v[k])));
        if (hit) {
          if (!this.ignoreDuplicates) { Object.assign(hit, clone(v)); written.push(hit); }
          continue;
        }
      }
      const r = this.db.insertRow(this.table, v);
      if ('message' in r && 'code' in r && r.code === '23505') return { data: null, error: r as DbError, count: null };
      written.push(r as Row);
    }
    return this.returning ? this.shape(written) : { data: null, error: null, count: null };
  }
}

/** The fake every swapped-in Supabase client uses; reset() gives each test an empty database. */
export function current(): FakeDb {
  const g = globalThis as { __fakeDb?: FakeDb };
  return (g.__fakeDb ||= new FakeDb());
}

export function reset(): FakeDb {
  (globalThis as { __fakeDb?: FakeDb }).__fakeDb = new FakeDb();
  return current();
}

/** Who is signed in for the request (null: nobody). */
export function signIn(user: { id: string; email?: string } | null) {
  (globalThis as { __fakeUser?: unknown }).__fakeUser = user;
}
