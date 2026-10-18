// Downloading a board's Status: a CSV for Excel / Google Sheets and a PDF to share, built in the browser from the
// numbers the page shows (team only, no emails). jsPDF only loads when someone asks for the PDF.
import { csvSep, downloadBlob, toCsv, type CsvCell } from '@/lib/csv';
import type { T } from '@/lib/i18n';

const TZ = 'America/Argentina/Buenos_Aires';

export type StatusCtx = {
  board: { name: string; slug: string };
  t: T;
  locale: 'es' | 'en';
  origin: string; // window.location.origin, for the links
  stats: { received: number; community: number; approved: number; launched: number; avgDays: number | null };
  times: { toApprove: number | null; toLaunch: number | null; rejected: number };
  funnel: { label: string; n: number }[];
  byOrigin: { label: string; launched: number; proposed: number }[];
  growth: { label: string; launched: number; avgImpact: number | null; votes: number }[];
  noGrowth: number;
  ideas: { id: number; title: string; origin: string; state: string; votes: number; date: string; days: number }[];
};

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0) + '%';
const fileDate = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const num = (c: StatusCtx, v: number) => v.toLocaleString(c.locale === 'en' ? 'en-US' : 'es-AR', { maximumFractionDigits: 1 });
const impactL = (c: StatusCtx, v: number | null) => (v == null ? c.t('sin calificar') : `${num(c, v)} / 5`);

export function downloadStatusCsv(c: StatusCtx) {
  const { t } = c, s = c.stats;
  const rows: CsvCell[][] = [
    [t('Status de {board}', { board: c.board.name }), new Date().toLocaleDateString(c.locale === 'en' ? 'en-US' : 'es-AR', { timeZone: TZ })],
    [],
    [t('Resumen'), t('Valor')],
    [t('Ideas recibidas'), s.received], [t('De la Comunidad'), s.community], [t('Aprobadas'), s.approved], [t('Lanzadas'), s.launched],
    [t('Tiempo promedio (días)'), s.avgDays ?? ''],
    [t('De propuesta a aprobada (días)'), c.times.toApprove ?? ''], [t('De aprobada a lanzada (días)'), c.times.toLaunch ?? ''],
    [t('Rechazadas'), c.times.rejected],
    [],
    [t('Etapa'), t('Ideas'), t('% de las recibidas')],
    ...c.funnel.map((f) => [f.label, f.n, pct(f.n, s.received)]),
    [],
    [t('Origen'), t('Lanzadas'), t('Propuestas'), t('% lanzadas')],
    ...c.byOrigin.map((o) => [o.label, o.launched, o.proposed, pct(o.launched, o.proposed)]),
    [],
    [t('Growth'), t('Lanzadas'), t('Impacto promedio'), t('Votos')],
    ...c.growth.map((g) => [g.label, g.launched, g.avgImpact == null ? '' : num(c, g.avgImpact), g.votes]),
    [t('Sin growth'), c.noGrowth, '', ''],
    [],
    [t('Idea'), t('Origen'), t('Estado'), t('Votos'), t('Fecha'), t('Días desde que se propuso'), t('Link')],
    ...c.ideas.map((i) => [i.title, i.origin, i.state, i.votes, i.date, i.days, `${c.origin}/app/b/${c.board.slug}/idea/${i.id}`]),
  ];
  downloadBlob(toCsv(rows, csvSep(c.locale)), `status-${c.board.slug}-${fileDate()}.csv`);
}

/** The built-in PDF fonts only cover Latin-1: swap typographic marks for plain ones and drop the rest (emoji). */
const pdfText = (s: string) => s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[–—]/g, '-').replace(/→/g, '->').replace(/[^\u0009\u000a\u000d -ÿ]/g, '');

export async function downloadStatusPdf(c: StatusCtx) {
  const { jsPDF } = await import('jspdf');
  const { t } = c, s = c.stats;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 18, CW = W - 2 * M, BOTTOM = 280;
  const green: [number, number, number] = [5, 150, 105], ink: [number, number, number] = [11, 43, 34], gray: [number, number, number] = [110, 120, 117];
  const track: [number, number, number] = [240, 242, 241];
  let y = M;
  const need = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  const section = (title: string) => {
    need(16); y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...ink);
    doc.text(pdfText(title), M, y); y += 7;
  };
  const bar = (label: string, n: number, of: number, right: string, color: [number, number, number]) => {
    need(8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 70, 66);
    doc.text(pdfText(label), M, y + 3.5);
    const x = M + 58, w = CW - 58 - 40;
    doc.setFillColor(...track); doc.roundedRect(x, y, w, 5, 1, 1, 'F');
    if (n > 0 && of > 0) { doc.setFillColor(...color); doc.roundedRect(x, y, Math.max(1.5, (w * n) / of), 5, 1, 1, 'F'); }
    doc.setTextColor(...ink);
    doc.text(pdfText(right), W - M, y + 3.5, { align: 'right' });
    y += 8;
  };

  // Header
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...ink);
  doc.text(pdfText(c.board.name), M, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...gray);
  doc.text(pdfText(t('Status') + ' · ' + t('qué pasó con las ideas del buzón')), M, y + 12);
  doc.setFontSize(9);
  doc.text(pdfText(new Intl.DateTimeFormat(c.locale === 'en' ? 'en-US' : 'es-AR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())), W - M, y + 6, { align: 'right' });
  y += 18;
  doc.setDrawColor(...green); doc.setLineWidth(0.8); doc.line(M, y, W - M, y);
  y += 8;

  // Summary: four boxes
  const boxes: [string, string, string][] = [
    [t('Ideas recibidas'), String(s.received), t('{n} de la Comunidad', { n: s.community })],
    [t('Aprobadas'), String(s.approved), t('{pct} de las recibidas', { pct: pct(s.approved, s.received) })],
    [t('Lanzadas'), String(s.launched), t('{pct} de las recibidas', { pct: pct(s.launched, s.received) })],
    [t('Tiempo promedio'), s.avgDays == null ? '-' : t('{n} días', { n: s.avgDays }), t('de la idea al lanzamiento')],
  ];
  const bw = (CW - 9) / 4;
  boxes.forEach(([l, v, n], k) => {
    const x = M + k * (bw + 3);
    doc.setDrawColor(230, 233, 232); doc.setLineWidth(0.3); doc.roundedRect(x, y, bw, 24, 2, 2, 'S');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray); doc.text(pdfText(l), x + 3, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...ink); doc.text(pdfText(v), x + 3, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...gray);
    doc.text(doc.splitTextToSize(pdfText(n), bw - 6) as string[], x + 3, y + 18);
  });
  y += 30;

  section(t('¿Hasta dónde llegan las ideas?'));
  c.funnel.forEach((f, k) => bar(f.label, f.n, s.received, `${f.n} · ${pct(f.n, s.received)}`, k === c.funnel.length - 1 ? [115, 196, 143] : [122, 167, 245]));

  section(t('¿Cuánto tardan las ideas?'));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 70, 66);
  const dl = (n: number | null) => (n == null ? '-' : t('{n} días', { n }));
  for (const [l, v] of [[t('De propuesta a aprobada'), dl(c.times.toApprove)], [t('De aprobada a lanzada'), dl(c.times.toLaunch)], [t('Total, de la idea al lanzamiento'), dl(s.avgDays)]] as [string, string][]) {
    need(6); doc.text(pdfText(l), M, y); doc.setTextColor(...ink); doc.text(pdfText(v), W - M, y, { align: 'right' }); doc.setTextColor(60, 70, 66); y += 6;
  }

  section(t('Lanzadas por origen'));
  c.byOrigin.forEach((o) => bar(o.label, o.launched, o.proposed, `${t('{n} de {max}', { n: o.launched, max: o.proposed })} · ${pct(o.launched, o.proposed)}`, [122, 167, 245]));

  section(t('Growth de las ideas lanzadas'));
  const maxG = Math.max(1, ...c.growth.map((g) => g.launched));
  c.growth.forEach((g) => bar(g.label, g.launched, maxG, `${g.launched} · ${t('impacto')} ${impactL(c, g.avgImpact)}`, [177, 138, 224]));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...gray);
  need(6); doc.text(pdfText(t('{n} lanzadas sin growth. Una idea puede tener más de una categoría.', { n: c.noGrowth })), M, y + 1); y += 6;

  section(t('Ideas en curso y lanzadas'));
  const cols = [0, 92, 116, 140, 152];
  const head = [t('Idea'), t('Origen'), t('Estado'), t('Votos'), t('Fecha')];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...gray);
  head.forEach((h, k) => doc.text(pdfText(h), M + cols[k], y));
  y += 2; doc.setDrawColor(230, 233, 232); doc.line(M, y, W - M, y); y += 4.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  if (!c.ideas.length) { doc.setTextColor(...gray); doc.text(pdfText(t('No hay ideas en este estado.')), M, y); }
  for (const i of c.ideas) {
    const title = doc.splitTextToSize(pdfText(i.title), 88) as string[];
    need(title.length * 4.2 + 2);
    doc.setTextColor(...ink); doc.text(title, M, y);
    doc.setTextColor(60, 70, 66);
    doc.text(pdfText(i.origin), M + cols[1], y); doc.text(pdfText(i.state), M + cols[2], y);
    doc.text(String(i.votes), M + cols[3], y); doc.text(pdfText(i.date), M + cols[4], y);
    y += title.length * 4.2 + 2;
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text('Boxinger · boxinger.com', M, 290);
    doc.text(pdfText(t('Página {n} de {total}', { n: p, total: pages })), W - M, 290, { align: 'right' });
  }
  doc.save(`status-${c.board.slug}-${fileDate()}.pdf`);
}
