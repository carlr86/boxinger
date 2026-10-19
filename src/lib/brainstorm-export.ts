// Brainstorming downloads: «Agrupar» (ideas by group) and the Backlog (accepted ideas), as CSV for Excel / Google
// Sheets or a PDF to share. Built in the browser from what the page shows; jsPDF only loads for the PDF.
import { csvSep, downloadBlob, toCsv, type CsvCell } from '@/lib/csv';

export type ListSection = { title?: string; rows: { title: string; meta: string; desc?: string }[] };
export type ListExport = { file: string; title: string; subtitle: string; csv: CsvCell[][]; sections: ListSection[]; empty: string; locale: 'es' | 'en'; pageL: (n: number, total: number) => string };

const fileDate = () => new Date().toLocaleDateString('en-CA');
const pdfText = (s: string) => s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[–—]/g, '-').replace(/★/g, '*').replace(/[^\u0009\u000a\u000d -ÿ]/g, '');

export function downloadListCsv(x: ListExport) {
  downloadBlob(toCsv(x.csv, csvSep(x.locale)), `${x.file}-${fileDate()}.csv`);
}

export async function downloadListPdf(x: ListExport) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 18, CW = W - 2 * M, BOTTOM = 280;
  const green: [number, number, number] = [5, 150, 105], ink: [number, number, number] = [11, 43, 34], gray: [number, number, number] = [110, 120, 117];
  let y = M;
  const need = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...ink);
  doc.text(pdfText(x.title), M, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...gray);
  doc.text(pdfText(x.subtitle), M, y + 12);
  doc.setFontSize(9);
  doc.text(new Intl.DateTimeFormat(x.locale === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()), W - M, y + 6, { align: 'right' });
  y += 18; doc.setDrawColor(...green); doc.setLineWidth(0.8); doc.line(M, y, W - M, y); y += 9;
  if (!x.sections.some((s) => s.rows.length)) { doc.setFontSize(11); doc.setTextColor(...gray); doc.text(pdfText(x.empty), M, y); }
  for (const s of x.sections) {
    if (!s.rows.length) continue;
    if (s.title) {
      need(14); y += 2;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...green);
      doc.text(pdfText(s.title), M, y); y += 7;
    }
    for (const r of s.rows) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      const title = doc.splitTextToSize(pdfText(r.title), CW) as string[];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      const desc = r.desc ? (doc.splitTextToSize(pdfText(r.desc), CW) as string[]).slice(0, 4) : [];
      need(title.length * 5 + desc.length * 4.3 + 9);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink);
      for (const l of title) { doc.text(l, M, y); y += 5; }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 70, 66);
      for (const l of desc) { doc.text(l, M, y); y += 4.3; }
      doc.setFontSize(8.5); doc.setTextColor(...gray);
      doc.text(pdfText(r.meta), M, y); y += 7;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text('Boxinger · boxinger.com', M, 290);
    doc.text(pdfText(x.pageL(p, pages)), W - M, 290, { align: 'right' });
  }
  doc.save(`${x.file}-${fileDate()}.pdf`);
}

// ── What each Brainstorming view downloads ──
type T = (s: string, v?: Record<string, string | number>) => string;
type I = { id: number; title: string; description: string; status: string; votes: number; points?: number; avg?: number | null; group_id?: string | null; impact?: number | null; effort?: number | null; approved_at?: string | null; hidden?: boolean };
type Ctx = { t: T; locale: 'es' | 'en'; board: { name: string; slug: string; vote_scale?: string; groups?: { id: string; name: string; position: number }[] | null }; ideas: I[]; origin: string };

const day = (locale: 'es' | 'en', d?: string | null) => (d ? new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR') : '');
const voteMeta = (c: Ctx, i: I) => {
  const s = c.board.vote_scale;
  if (s === 'like') return c.t('{n} me gusta', { n: i.votes });
  const v = i.votes === 1 ? c.t('1 voto') : c.t('{n} votos', { n: i.votes });
  if (s === 'cinco') return i.avg != null ? `${v} · ★ ${String(i.avg)}` : v;
  return `${v} · ${c.t('{n} puntos', { n: Number(i.points ?? 0) })}`;
};
const rate = (c: Ctx, i: I) => [i.impact ? `${c.t('Impacto')} ${i.impact}/5` : '', i.effort ? `${c.t('Esfuerzo')} ${i.effort}/5` : ''].filter(Boolean).join(' · ');
const link = (c: Ctx, i: I) => `${c.origin}/app/b/${c.board.slug}/idea/${i.id}`;
const byPoints = (a: I, b: I) => Number(b.points ?? b.votes) - Number(a.points ?? a.votes);
const pageL = (c: Ctx) => (n: number, total: number) => c.t('Página {n} de {total}', { n, total });

export function affinityExport(c: Ctx): ListExport {
  const { t } = c;
  const live = c.ideas.filter((i) => !i.hidden && i.status !== 'rechazada');
  const groups = (c.board.groups || []).slice().sort((a, b) => a.position - b.position);
  const sections: ListSection[] = groups.map((g) => ({ title: g.name, rows: live.filter((i) => i.group_id === g.id).sort(byPoints)
    .map((i) => ({ title: i.title + (i.status === 'aprobada' ? ` (${t('Aceptada')})` : ''), desc: i.description, meta: [voteMeta(c, i), rate(c, i)].filter(Boolean).join(' · ') })) }));
  const loose = live.filter((i) => !i.group_id && i.votes > 0 && i.status !== 'aprobada').sort(byPoints);
  sections.push({ title: t('Sin grupo'), rows: loose.map((i) => ({ title: i.title, desc: i.description, meta: voteMeta(c, i) })) });
  const head = [t('Grupo'), t('Idea'), t('Descripción'), t('Estado'), t('Votos'), t('Puntos'), t('Promedio'), t('Impacto'), t('Esfuerzo'), t('Link')];
  const row = (g: string, i: I): CsvCell[] => [g, i.title, i.description, i.status === 'aprobada' ? t('Aceptada') : t('En el grupo'), i.votes, Number(i.points ?? 0), i.avg ?? '', i.impact || '', i.effort || '', link(c, i)];
  const csv: CsvCell[][] = [head, ...groups.flatMap((g) => live.filter((i) => i.group_id === g.id).sort(byPoints).map((i) => row(g.name, i))), ...loose.map((i) => row(t('Sin grupo'), i))];
  return { file: `agrupar-${c.board.slug}`, title: c.board.name, subtitle: t('Brainstorming') + ' · ' + t('Agrupar por afinidad'), csv, sections, empty: t('Todavía no hay ideas agrupadas.'), locale: c.locale, pageL: pageL(c) };
}

export function backlogExport(c: Ctx): ListExport {
  const { t } = c;
  const gName = (id?: string | null) => (c.board.groups || []).find((g) => g.id === id)?.name || '';
  const acc = c.ideas.filter((i) => !i.hidden && i.status === 'aprobada').sort((a, b) => +new Date(b.approved_at || 0) - +new Date(a.approved_at || 0));
  const head = [t('Idea'), t('Descripción'), t('Grupo'), t('Votos'), t('Puntos'), t('Promedio'), t('Impacto'), t('Esfuerzo'), t('Aceptada el'), t('Link')];
  const csv: CsvCell[][] = [head, ...acc.map((i) => [i.title, i.description, gName(i.group_id), i.votes, Number(i.points ?? 0), i.avg ?? '', i.impact || '', i.effort || '', day(c.locale, i.approved_at), link(c, i)] as CsvCell[])];
  const sections: ListSection[] = [{ rows: acc.map((i) => ({ title: i.title, desc: i.description, meta: [gName(i.group_id), voteMeta(c, i), rate(c, i), t('Aceptada el {date}', { date: day(c.locale, i.approved_at) })].filter(Boolean).join(' · ') })) }];
  return { file: `backlog-${c.board.slug}`, title: c.board.name, subtitle: t('Brainstorming') + ' · ' + t('Backlog: las ideas aceptadas'), csv, sections, empty: t('Todavía no hay ideas aceptadas.'), locale: c.locale, pageL: pageL(c) };
}
