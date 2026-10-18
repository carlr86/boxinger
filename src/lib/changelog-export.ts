// Downloading a board's Novedades (launched ideas): a CSV for Excel / Google Sheets and a PDF to share.
// Built in the browser from what the page already shows (no emails). jsPDF only loads when someone asks for the PDF.
import { csvSep, downloadBlob, toCsv } from '@/lib/csv';
import type { Idea } from '@/lib/types';
import type { T } from '@/lib/i18n';

const TZ = 'America/Argentina/Buenos_Aires';

export type ChangelogCtx = {
  board: { name: string; slug: string; logo_url: string | null };
  ideas: Idea[]; // launched, newest first
  catL: (id: string) => string;
  t: T;
  locale: 'es' | 'en';
  origin: string; // window.location.origin, for the links
};

const author = (i: Idea, t: T) => (i.anonymous ? t('Anónimo') : i.author_id ? i.author_name : t(i.author_name));
const originL = (i: Idea, t: T) => t(i.origin === 'equipo' ? 'Equipo' : 'Comunidad');
const link = (c: ChangelogCtx, i: Idea) => `${c.origin}/app/b/${c.board.slug}/idea/${i.id}`;
const fileDate = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const fmt = (c: ChangelogCtx, d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(c.locale === 'en' ? 'en-US' : 'es-AR', { timeZone: TZ, ...o }).format(new Date(d));

export function downloadChangelogCsv(c: ChangelogCtx) {
  const { t } = c;
  const day = (d: string) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
    return c.locale === 'es' ? p.split('-').reverse().join('/') : p;
  };
  const head = ['Lanzada el', 'Título', 'Descripción', 'Categoría', 'Origen', 'Propuesta por', 'Votos', 'Link'].map((h) => t(h));
  const rows = c.ideas.map((i) => [day(i.launched_at!), i.title, i.description, c.catL(i.category_id), originL(i, t), author(i, t), i.votes, link(c, i)]);
  downloadBlob(toCsv([head, ...rows], csvSep(c.locale)), `novedades-${c.board.slug}-${fileDate()}.csv`);
}

/** The built-in PDF fonts only cover Latin-1: swap typographic marks for plain ones and drop the rest (emoji). */
const pdfText = (s: string) => s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/[^\u0009\u000a\u000d -ÿ]/g, '');

async function logoData(url: string | null): Promise<{ data: string; fmt: 'PNG' | 'JPEG' } | null> {
  if (!url) return null;
  try {
    const b = await (await fetch(url)).blob();
    const f = b.type === 'image/png' ? 'PNG' : b.type === 'image/jpeg' ? 'JPEG' : null;
    if (!f) return null;
    const data = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(b); });
    return { data, fmt: f };
  } catch { return null; }
}

export async function downloadChangelogPdf(c: ChangelogCtx) {
  const { jsPDF } = await import('jspdf');
  const { t } = c;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 18, CW = W - 2 * M, BOTTOM = 280;
  const green: [number, number, number] = [5, 150, 105], ink: [number, number, number] = [11, 43, 34], gray: [number, number, number] = [110, 120, 117];
  let y = M;

  // Header: board logo and name, "Novedades", date.
  const logo = await logoData(c.board.logo_url);
  if (logo) { try { doc.addImage(logo.data, logo.fmt, M, y, 14, 14); } catch { /* unreadable image: name only */ } }
  const x0 = logo ? M + 18 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...ink);
  doc.text(pdfText(c.board.name), x0, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...gray);
  doc.text(pdfText(t('Novedades') + ' · ' + t('lo que el equipo ya lanzó')), x0, y + 12);
  doc.setFontSize(9);
  doc.text(pdfText(fmt(c, new Date().toISOString(), { day: 'numeric', month: 'long', year: 'numeric' })), W - M, y + 6, { align: 'right' });
  y += 20;
  doc.setDrawColor(...green); doc.setLineWidth(0.8); doc.line(M, y, W - M, y);
  y += 10;

  const need = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  if (!c.ideas.length) {
    doc.setFontSize(11); doc.setTextColor(...gray);
    doc.text(pdfText(t('Todavía no hay novedades.')), M, y);
  }

  let month = '';
  for (const i of c.ideas) {
    const m = fmt(c, i.launched_at!, { month: 'long', year: 'numeric' });
    const label = m[0].toUpperCase() + m.slice(1);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    const title = doc.splitTextToSize(pdfText(i.title), CW) as string[];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const desc = i.description ? (doc.splitTextToSize(pdfText(i.description), CW) as string[]) : [];
    const h = 6 + title.length * 5.5 + desc.length * 4.6 + 12;
    if (label !== month) {
      if (month) y += 4; // a bit more room before each new month
      need(12 + Math.min(h, 40));
      month = label;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...green);
      doc.text(pdfText(label), M, y);
      y += 8;
    }
    need(Math.min(h, BOTTOM - M));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gray);
    doc.text(pdfText(t('Lanzada') + ' · ' + fmt(c, i.launched_at!, { day: 'numeric', month: 'long' })), M, y);
    y += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...ink);
    for (const l of title) { need(6); doc.text(l, M, y); y += 5.5; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 70, 66);
    for (const l of desc) { need(5); doc.text(l, M, y); y += 4.6; }
    y += 1.5;
    need(10);
    doc.setFontSize(9); doc.setTextColor(...gray);
    doc.text(pdfText([c.catL(i.category_id), originL(i, t), t('Propuesta por {name}', { name: author(i, t) }), `${i.votes} ${t(i.votes === 1 ? 'voto' : 'votos')}`].join(' · ')), M, y);
    y += 4.5;
    doc.setTextColor(...green);
    doc.textWithLink(pdfText(t('Ver la idea')), M, y, { url: link(c, i) });
    y += 8;
  }

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray);
    doc.text('Boxinger · boxinger.com', M, 290);
    doc.text(pdfText(t('Página {n} de {total}', { n: p, total: pages })), W - M, 290, { align: 'right' });
  }
  doc.save(`novedades-${c.board.slug}-${fileDate()}.pdf`);
}
