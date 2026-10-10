// Reading an ideas file (CSV or .xlsx) in the browser, before sending it to import_ideas.
// The rules here mirror the server's (supabase/migrations/…048_import_ideas.sql), so the preview matches the result.

export type Field = 'title' | 'description' | 'category' | 'date' | 'name' | 'email' | 'status';
export const FIELDS: Field[] = ['title', 'description', 'category', 'date', 'name', 'email', 'status'];
export type Cell = string | number | boolean | Date | null;
export type Sheet = { headers: string[]; rows: Cell[][] };
export type Mapping = Partial<Record<Field, number>>;
export type ImportRow = { row: number; title: string; description: string; category: string; date: string | null; name: string; email: string; status: string };
export type SkipReason = 'sin_titulo' | 'titulo_corto' | 'repetida' | 'existe';
export type Skipped = { row: number; reason: SkipReason };

export const MAX_ROWS = 1000;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@]+/g, ' ').trim();

/** Reads a .csv or .xlsx file into a header row and data rows (fully empty rows are dropped). */
export async function readFile(file: File): Promise<Sheet> {
  const ext = file.name.toLowerCase().split('.').pop();
  let grid: Cell[][];
  if (ext === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    grid = (await readSheet(file)) as Cell[][];
  } else if (ext === 'csv' || ext === 'txt') {
    grid = parseCsv(decode(await file.arrayBuffer()));
  } else {
    throw new Error(ext === 'xls' ? 'old-xls' : 'bad-type');
  }
  grid = grid.filter((r) => r.some((c) => c !== null && String(c).trim() !== ''));
  if (grid.length === 0) throw new Error('empty');
  const [head, ...rows] = grid;
  return { headers: head.map((c) => (c == null ? '' : String(c).trim())), rows };
}

/** UTF-8, or Windows-1252 when the file isn't valid UTF-8 (CSVs saved by Excel on Windows). */
function decode(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}

/** RFC 4180 CSV: quoted cells, "" escapes, line breaks inside quotes; the separator (; , or tab) is detected. */
export function parseCsv(text: string): Cell[][] {
  const first = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const count = (ch: string) => first.split(ch).length - 1;
  const sep = [';', ',', '\t'].reduce((a, b) => (count(b) > count(a) ? b : a), ',');
  const out: Cell[][] = [];
  let row: Cell[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out;
}

// Column names we recognize, in Spanish and English (compared without accents or case).
const NAMES: Record<Field, string[]> = {
  title: ['titulo', 'title', 'idea', 'asunto', 'subject', 'resumen', 'summary', 'feature', 'pedido', 'request', 'nombre de la idea'],
  description: ['descripcion', 'description', 'detalle', 'details', 'detail', 'comentario', 'comment', 'opinion', 'feedback', 'texto', 'text', 'mensaje', 'message', 'body'],
  category: ['categoria', 'category', 'tipo', 'type', 'etiqueta', 'tag', 'tags'],
  date: ['fecha', 'date', 'creado', 'created', 'created at', 'fecha de creacion', 'fecha de alta'],
  email: ['email', 'e mail', 'mail', 'correo', 'correo electronico', 'email del cliente', 'customer email', 'requester email'],
  name: ['nombre', 'name', 'cliente', 'customer', 'usuario', 'user', 'autor', 'author', 'pedido por', 'solicitante', 'requester', 'empresa', 'company'],
  status: ['estado', 'status'],
};

/** Guesses which column holds each field: exact names first, then names contained in the header. */
export function guessColumns(headers: string[]): Mapping {
  const h = headers.map(norm);
  const m: Mapping = {};
  const used = new Set<number>();
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of (['email', 'title', 'description', 'category', 'date', 'status', 'name'] as Field[])) {
      if (m[f] !== undefined) continue;
      const i = h.findIndex((x, k) => !used.has(k) && x !== '' && NAMES[f].some((n) => (pass === 'exact' ? x === n : (` ${x} `).includes(` ${n} `))));
      if (i >= 0) { m[f] = i; used.add(i); }
    }
  }
  return m;
}

const STATUS: Record<string, string> = {
  pendiente: 'pendiente', pending: 'pendiente', nuevo: 'pendiente', nueva: 'pendiente', new: 'pendiente', 'pendiente de revision': 'pendiente',
  'en revision': 'en_revision', 'in review': 'en_revision', review: 'en_revision', revision: 'en_revision', 'under review': 'en_revision',
  aprobada: 'aprobada', aprobado: 'aprobada', approved: 'aprobada', backlog: 'aprobada', planned: 'aprobada', planificada: 'aprobada',
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** A date cell as YYYY-MM-DD: Excel dates, ISO, dd/mm/yyyy (mm/dd/yyyy in English when it can't be told apart). */
export function toDate(v: Cell, locale: 'es' | 'en'): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(+v) ? null : ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // Excel serial days (1954–2119)
    const d = new Date(Math.round((v - 25569) * 864e5));
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  let [a, b, y] = [+m[1], +m[2], +m[3]];
  if (y < 100) y += 2000;
  const dayFirst = a > 12 ? true : b > 12 ? false : locale === 'es';
  return dayFirst ? ymd(y, b, a) : ymd(y, a, b);
}

const text = (v: Cell) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();

/** Applies the mapping and the server's rules: what will be imported and what is skipped (and why). */
export function normalizeRows(sheet: Sheet, map: Mapping, existingTitles: string[], locale: 'es' | 'en'): { rows: ImportRow[]; skipped: Skipped[] } {
  const exists = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  const skipped: Skipped[] = [];
  const get = (r: Cell[], f: Field) => (map[f] === undefined ? null : r[map[f]!] ?? null);
  sheet.rows.forEach((r, k) => {
    const row = k + 2; // line in the file, counting the header
    let title = text(get(r, 'title')).replace(/\s+/g, ' ');
    let description = text(get(r, 'description'));
    if (!title) return skipped.push({ row, reason: 'sin_titulo' });
    if (title.length < 5) return skipped.push({ row, reason: 'titulo_corto' });
    if (title.length > 80) {
      description = title + (description ? '\n\n' + description : '');
      title = title.slice(0, 79).trimEnd() + '…';
    }
    const key = title.toLowerCase();
    if (seen.has(key)) return skipped.push({ row, reason: 'repetida' });
    seen.add(key);
    if (exists.has(key)) return skipped.push({ row, reason: 'existe' });
    rows.push({
      row, title, description: description.slice(0, 2000),
      category: text(get(r, 'category')),
      date: toDate(get(r, 'date'), locale),
      name: text(get(r, 'name')).slice(0, 120),
      email: text(get(r, 'email')).toLowerCase(),
      status: STATUS[norm(text(get(r, 'status')))] || 'pendiente',
    });
  });
  return { rows, skipped };
}

/** A sample file to fill in, with the column names Boxinger recognizes. */
export function templateCsv(locale: 'es' | 'en'): Blob {
  const es = locale === 'es';
  const sep = es ? ';' : ','; // Excel in Spanish opens ;-separated files in columns
  const rows = es
    ? [['Título', 'Descripción', 'Categoría', 'Fecha', 'Nombre', 'Email', 'Estado'],
       ['Exportar reportes a Excel', 'Necesito bajar los reportes para compartirlos con mi equipo.', 'Feature', '15/03/2024', 'Juan Pérez', 'juan@cliente.com', 'Pendiente'],
       ['Modo oscuro', 'Uso la app de noche y la pantalla encandila.', 'Mejora', '02/05/2024', 'Ana Gómez', '', 'En revisión']]
    : [['Title', 'Description', 'Category', 'Date', 'Name', 'Email', 'Status'],
       ['Export reports to Excel', 'I need to download reports to share them with my team.', 'Feature', '2024-03-15', 'John Smith', 'john@client.com', 'Pending'],
       ['Dark mode', 'I use the app at night and the screen is too bright.', 'Improvement', '2024-05-02', 'Ann Lee', '', 'In review']];
  const cell = (c: string) => (/[";,\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return new Blob(['﻿' + rows.map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}
