'use client';
import { useState } from 'react';
import { Tooltip } from 'antd';
import { rpc } from '@/lib/rpc';
import { csvSep, downloadBlob, toCsv, type CsvCell } from '@/lib/csv';
import { DEV, GROWTH, IDEA_STATUS, PRIO, RM_COLS } from '@/lib/constants';
import { useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import { usesMrr, usesSegments, type BoardApi } from './shared';

type Row = {
  id: number; title: string; description: string; category: string; status: string; origin: string; reject_reason: string | null;
  hidden: boolean; imported: boolean; ai: boolean; has_image?: boolean; anonymous?: boolean; requester_name: string | null; requester_email: string | null;
  author_name: string | null; author_email: string | null; created_at: string; approved_at: string | null; launched_at: string | null;
  importante: number; interesante: number; no_importante: number; comments: number;
  impact: number | null; effort: number | null; priority: string | null; rm_col: string | null; dev_status: string; growth: string[] | null;
  mrr?: number | null; segments?: string | null; // segment names, comma-separated
};
type Export = { board: string; slug: string; roadmap_names: Record<string, string>; mrr_currency?: string; ideas: Row[] };

/** "Exportar": every idea of the board to a CSV for Excel or Google Sheets (team Admin, every plan). Same first columns as the import. */
export function ExportButton({ api, iconOnly }: { api: BoardApi; iconOnly?: boolean }) {
  const { t, locale, plural } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Spanish: dd/mm/aaaa (what Excel in Spanish reads as a date); English: aaaa-mm-dd.
  const day = (d: string | null) => {
    if (!d) return '';
    const x = new Date(d);
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
    return locale === 'es' ? p.split('-').reverse().join('/') : p;
  };
  const yesNo = (v: boolean) => (v ? t('Sí') : t('No'));

  async function run() {
    if (busy) return;
    setBusy(true);
    const r = await api.run(rpc<Export>('export_ideas', { p_board: api.data.board.id }));
    setBusy(false);
    if (!r) return;
    // MRR and segments only when the board uses them.
    const mrr = usesMrr(api), segs = usesSegments(api);
    const col = (k: string | null) => (k ? r.roadmap_names?.[k] || t(RM_COLS.find((c) => c.k === k)?.l || k) : '');
    const head = ['ID', 'Título', 'Descripción', 'Categoría', 'Estado', 'Fecha', 'Nombre', 'Email', 'Origen', 'Votos', 'Importante', 'Interesante', 'No importante',
      'Puntaje', 'Comentarios', 'Impacto', 'Esfuerzo', 'Prioridad', 'Roadmap', 'Desarrollo', 'Lanzada el', 'Aprobada el', 'Motivo del rechazo', 'Growth',
      ...(mrr ? ['MRR', 'Moneda'] : []), ...(segs ? ['Segmentos'] : []),
      'Oculta para la Comunidad', 'Importada', 'Sugerida por IA', 'Tiene imagen', 'Anónima', 'Link'].map((h) => t(h));
    const rows: CsvCell[][] = r.ideas.map((i) => {
      const votes = Number(i.importante) + Number(i.interesante) + Number(i.no_importante);
      return [
        i.id, i.title, i.description, i.category, IDEA_STATUS[i.status] ? t(IDEA_STATUS[i.status].l) : i.status, day(i.created_at),
        i.author_name || i.requester_name || '', i.author_email || i.requester_email || '',
        t(i.origin === 'equipo' ? 'Equipo' : 'Comunidad'), votes, Number(i.importante), Number(i.interesante), Number(i.no_importante),
        2 * Number(i.importante) + Number(i.interesante), Number(i.comments), i.impact ?? '', i.effort ?? '',
        i.priority && PRIO[i.priority] ? t(PRIO[i.priority].l) : '', col(i.rm_col), DEV[i.dev_status] ? t(DEV[i.dev_status].l) : '',
        day(i.launched_at), day(i.approved_at), i.reject_reason || '', (i.growth || []).map((g) => (GROWTH[g] ? t(GROWTH[g].l) : g)).join(', '),
        ...(mrr ? [i.mrr ?? '', i.mrr != null ? r.mrr_currency || '' : ''] : []), ...(segs ? [i.segments || ''] : []),
        yesNo(i.hidden), yesNo(i.imported), yesNo(i.ai), yesNo(!!i.has_image), yesNo(!!i.anonymous), `${window.location.origin}/app/b/${r.slug}/idea/${i.id}`,
      ];
    });
    const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
    downloadBlob(toCsv([head, ...rows], csvSep(locale)), `ideas-${r.slug}-${today}.csv`);
    toast.ok(r.ideas.length ? t('Exportamos {ideas}.', { ideas: plural(r.ideas.length, 'idea', 'ideas') }) : t('El buzón todavía no tiene ideas: el archivo solo tiene los títulos de las columnas.'));
  }

  const icon = (
    <svg width={iconOnly ? 16 : 14} height={iconOnly ? 16 : 14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 15V4m0 0l-4 4m4-4l4 4M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const label = t('Exportar todas las ideas a Excel o Google Sheets');
  // Buzón header: just the icon, the description on hover.
  if (iconOnly) return (
    <Tooltip title={busy ? t('Exportando…') : label}>
      <button type="button" className="bx-btn" onClick={run} disabled={busy} aria-label={label} style={{ width: 36, padding: 0, display: 'inline-grid', placeItems: 'center' }}>{icon}</button>
    </Tooltip>
  );
  return (
    <button type="button" className="bx-btn" onClick={run} disabled={busy} title={t('Descargar todas las ideas del buzón en un archivo para Excel o Google Sheets')}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      {busy ? t('Exportando…') : t('Exportar')}
    </button>
  );
}
