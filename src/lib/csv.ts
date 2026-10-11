// Building and downloading CSV files that open straight in Excel and Google Sheets.

export type CsvCell = string | number | boolean | null | undefined;

/** Excel in Spanish expects ";" between columns; in English, ",". */
export const csvSep = (locale: 'es' | 'en') => (locale === 'es' ? ';' : ',');

/**
 * Text that starts with = + - @ (or a tab / carriage return) would run as a formula when the file is opened
 * in Excel, a known way to attack whoever opens it ("CSV injection"); a leading ' keeps it as plain text.
 */
function cell(v: CsvCell, sep: string): string {
  if (v == null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to a UTF-8 CSV (with BOM, so Excel shows accents right). */
export function toCsv(rows: CsvCell[][], sep: string): Blob {
  return new Blob(['﻿' + rows.map((r) => r.map((c) => cell(c, sep)).join(sep)).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
