'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Popconfirm } from 'antd';
import { rpc } from '@/lib/rpc';
import { Choice, Note, ProPill, SectionLabel } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import { FIELDS, MAX_ROWS, guessColumns, normalizeRows, readFile, templateCsv, type Field, type Mapping, type Sheet, type SkipReason } from '@/lib/import/parse';
import type { BoardApi } from './shared';

type Step = 'file' | 'map' | 'preview';
type Past = { id: number; file_name: string | null; rows: number; left: number; created_at: string; user_name: string | null };
type Result = { import_id: number | null; created: number; skipped: { row: number; reason: SkipReason }[] };

const LABEL: Record<Field, string> = {
  title: 'Título', description: 'Descripción', category: 'Categoría', date: 'Fecha',
  name: 'Nombre de quien la pidió', email: 'Email de quien la pidió', status: 'Estado',
};
const REASON: Record<SkipReason, string> = {
  sin_titulo: 'Sin título', titulo_corto: 'Título de menos de 5 caracteres', repetida: 'Repetida en el archivo', existe: 'Ya existe en el buzón',
};
const muted: React.CSSProperties = { fontSize: 13, color: 'rgba(0,0,0,0.45)' };
const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #f5f5f5', verticalAlign: 'top' };

/** Import ideas from a CSV or Excel file: upload, match columns, preview, import. Also lists past imports to undo them. */
export function ImportModal({ api, open, onClose, isMobile }: { api: BoardApi; open: boolean; onClose: () => void; isMobile: boolean }) {
  const { t, locale, plural, ddmmyyyy } = useI18n();
  const toast = useToast();
  const cats = api.data.categories;
  const [step, setStep] = useState<Step>('file');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<Mapping>({});
  const [origin, setOrigin] = useState<'comunidad' | 'equipo'>('comunidad');
  const [defCat, setDefCat] = useState('');
  const [fileErr, setFileErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [past, setPast] = useState<Past[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const loadPast = () => rpc<Past[]>('get_imports', { p_board: api.data.board.id }).then(setPast).catch(() => setPast([]));
  useEffect(() => {
    if (!open) return;
    setStep('file'); setSheet(null); setFileName(''); setMap({}); setOrigin('comunidad'); setFileErr(''); setDefCat(cats[0]?.id || '');
    loadPast();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(file: File | undefined) {
    if (!file) return;
    setFileErr(''); setBusy(true);
    try {
      const s = await readFile(file);
      if (s.rows.length > MAX_ROWS) {
        setFileErr(t('El archivo tiene {n} filas. Podés importar hasta 1.000 por vez: dividilo en partes.', { n: s.rows.length.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR') }));
      } else if (s.rows.length === 0) {
        setFileErr(t('El archivo solo tiene la fila de títulos de columna.'));
      } else {
        setSheet(s); setFileName(file.name); setMap(guessColumns(s.headers)); setStep('map');
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setFileErr(code === 'old-xls' ? t('El formato .xls es viejo: abrilo en Excel y guardalo como .xlsx o .csv.')
        : code === 'bad-type' ? t('Subí un archivo .csv o .xlsx.')
        : code === 'empty' ? t('El archivo está vacío.')
        : t('No pudimos leer el archivo. Probá guardarlo de nuevo como .xlsx o .csv.'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(templateCsv(locale));
    const a = document.createElement('a');
    a.href = url; a.download = locale === 'en' ? 'ideas-template.csv' : 'plantilla-ideas.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const plan = useMemo(() => (sheet ? normalizeRows(sheet, map, api.data.ideas.map((i) => i.title), locale) : { rows: [], skipped: [] }), [sheet, map, api.data.ideas, locale]);
  const catName = (name: string) => cats.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())?.name;
  const defName = cats.find((c) => c.id === defCat)?.name || '';
  const showDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : t('Hoy'));

  async function runImport() {
    if (busy || !plan.rows.length) return;
    setBusy(true);
    const r = await api.run(rpc<Result>('import_ideas', {
      p_board: api.data.board.id, p_file: fileName, p_origin: origin, p_default_category: defCat, p_rows: plan.rows,
    }));
    setBusy(false);
    if (!r) return;
    toast.ok(r.skipped.length > plan.skipped.length
      ? t('Importamos {ideas}. Se saltearon {rows} que ya estaban en el buzón.', { ideas: plural(r.created, 'idea', 'ideas'), rows: plural(r.skipped.length - plan.skipped.length, 'fila', 'filas') })
      : t('Importamos {ideas}.', { ideas: plural(r.created, 'idea', 'ideas') }));
    api.reload();
    onClose();
  }

  async function undo(p: Past) {
    const n = await api.run(rpc<number>('undo_import', { p_id: p.id }));
    if (n === undefined) return;
    toast.ok(t('Importación deshecha: se borraron {ideas}.', { ideas: plural(n, 'idea', 'ideas') }));
    loadPast(); api.reload();
  }

  const steps: [Step, string][] = [['file', t('Archivo')], ['map', t('Columnas')], ['preview', t('Vista previa')]];
  const stepIdx = steps.findIndex(([k]) => k === step);
  const sample = (i: number | undefined) => {
    if (i === undefined || !sheet) return '';
    const v = sheet.rows.find((r) => r[i] != null && String(r[i]).trim() !== '')?.[i];
    return v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 60);
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('Importar ideas')} destroyOnHidden
      width={isMobile ? '100%' : 720} style={isMobile ? { top: 'auto', bottom: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : { top: '6vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          {steps.map(([k, l], n) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: n <= stepIdx ? '#059669' : 'rgba(0,0,0,0.35)', fontWeight: n === stepIdx ? 600 : 400 }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                background: n <= stepIdx ? '#059669' : '#f0f0f0', color: n <= stepIdx ? '#fff' : 'rgba(0,0,0,0.45)' }}>{n + 1}</span>
              {l}{n < steps.length - 1 && <span style={{ color: 'rgba(0,0,0,0.2)', marginLeft: 2 }}>—</span>}
            </span>
          ))}
        </div>

        {step === 'file' && (
          <>
            <div onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
              style={{ border: '1.5px dashed ' + (drag ? '#059669' : '#d9d9d9'), background: drag ? '#ecfdf5' : '#fafafa', borderRadius: 8, padding: '32px 16px',
                textAlign: 'center', cursor: busy ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: '#059669' }}>
                <path d="M12 15V4m0 0l-4 4m4-4l4 4M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{busy ? t('Leyendo el archivo…') : t('Elegí un archivo o arrastralo acá')}</span>
              <span style={muted}>{t('CSV o Excel (.xlsx), hasta 1.000 ideas. La primera fila tiene que tener los nombres de las columnas.')}</span>
              <input ref={input} type="file" accept=".csv,.xlsx,.xls,text/csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            {fileErr && <Note tone="error">{fileErr}</Note>}
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
              {t('Sirve para traer opiniones que ya tenés en planillas, encuestas o tu sistema de soporte. Se conserva la fecha original y no se le avisa a nadie.')}{' '}
              <a onClick={downloadTemplate}>{t('Descargar plantilla')}</a>
            </span>
            {past && past.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SectionLabel>{t('Importaciones anteriores')}</SectionLabel>
                {past.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, padding: '8px 12px', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.file_name || t('Archivo')}</span>
                      <span style={muted}>{ddmmyyyy(p.created_at)} · {plural(p.rows, 'idea', 'ideas')}{p.left !== p.rows ? ' · ' + t('quedan {n}', { n: p.left }) : ''}{p.user_name ? ' · ' + p.user_name : ''}</span>
                    </div>
                    {p.left > 0 && (
                      <Popconfirm title={t('¿Deshacer esta importación?')} description={t('Se borran {ideas} de esta importación, con sus votos y comentarios.', { ideas: plural(p.left, 'idea', 'ideas') })}
                        okText={t('Deshacer')} cancelText={t('Cancelar')} okButtonProps={{ danger: true }} onConfirm={() => undo(p)}>
                        <button type="button" className="bx-btn" style={{ height: 28, fontSize: 13 }}>{t('Deshacer')}</button>
                      </Popconfirm>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'map' && sheet && (
          <>
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Revisá qué columna de {file} corresponde a cada dato. Solo el título es obligatorio.', { file: fileName })}</span>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: isMobile ? 6 : '10px 16px', alignItems: 'center' }}>
              {FIELDS.map((f) => (
                <FieldRow key={f} label={t(LABEL[f]) + (f === 'title' ? ' *' : '')} hint={sample(map[f])}>
                  <select className="bx-select" style={{ width: '100%' }} value={map[f] ?? ''}
                    onChange={(e) => setMap({ ...map, [f]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">{t('— No importar —')}</option>
                    {sheet.headers.map((h, i) => <option key={i} value={i}>{h || t('Columna {n}', { n: i + 1 })}</option>)}
                  </select>
                </FieldRow>
              ))}
            </div>
            {(map.name !== undefined || map.email !== undefined) && <span style={muted}>{t('Quién pidió cada idea lo ve solo el equipo. Si el email es de alguien que ya está en el buzón, la idea queda a su nombre y le llegan los avisos de Roadmap y lanzamiento.')}</span>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              {t('Estas ideas vienen de')}
              <Choice options={[['comunidad', t('Comunidad')], ['equipo', t('Equipo')]]} value={origin} onChange={setOrigin} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              {map.category !== undefined ? t('Categoría para las que no coincidan con las del buzón') : t('Categoría para todas')}
              <select className="bx-select" style={{ alignSelf: 'flex-start', minWidth: 220 }} value={defCat} onChange={(e) => setDefCat(e.target.value)}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="bx-btn" onClick={() => setStep('file')}>{t('Atrás')}</button>
              <button type="button" className="bx-btn-primary" disabled={map.title === undefined || !defCat} onClick={() => setStep('preview')}>{t('Continuar')}</button>
            </div>
          </>
        )}

        {step === 'preview' && sheet && (
          <>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {plan.rows.length ? t('Se van a importar {ideas}', { ideas: plural(plan.rows.length, 'idea', 'ideas') }) : t('No hay ideas para importar')}
            </span>
            {plan.rows.length > 0 && (
              <div style={{ overflowX: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr><th style={th}>{t('Título')}</th><th style={th}>{t('Categoría')}</th><th style={th}>{t('Fecha')}</th>{(map.name !== undefined || map.email !== undefined) && <th style={th}>{t('Pedida por')}</th>}</tr></thead>
                  <tbody>
                    {plan.rows.slice(0, 8).map((r) => (
                      <tr key={r.row}>
                        <td style={td}>{r.title}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{catName(r.category) || <span style={{ color: 'rgba(0,0,0,0.45)' }}>{defName}</span>}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{showDate(r.date)}</td>
                        {(map.name !== undefined || map.email !== undefined) && <td style={td}>{r.name || r.email || '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.rows.length > 8 && <div style={{ ...muted, padding: '6px 8px' }}>{t('y {n} más', { n: plan.rows.length - 8 })}</div>}
              </div>
            )}
            {plan.skipped.length > 0 && (
              <Note tone="warn">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <b style={{ fontWeight: 600 }}>{t('Se saltean {rows}:', { rows: plural(plan.skipped.length, 'fila', 'filas') })}</b>
                  {plan.skipped.slice(0, 30).map((s) => <span key={s.row}>{t('Fila {n}', { n: s.row })}: {t(REASON[s.reason])}</span>)}
                  {plan.skipped.length > 30 && <span>{t('y {n} más', { n: plan.skipped.length - 30 })}</span>}
                </div>
              </Note>
            )}
            <span style={muted}>{t('Quedan como Pendiente de revisión (salvo que el archivo diga En revisión o Aprobada), con la etiqueta Importada. Si te equivocás, podés deshacer la importación.')}</span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="bx-btn" onClick={() => setStep('map')}>{t('Atrás')}</button>
              <button type="button" className="bx-btn-primary" disabled={busy || !plan.rows.length} onClick={runImport}>
                {busy ? t('Importando…') : t('Importar {ideas}', { ideas: plural(plan.rows.length, 'idea', 'ideas') })}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ fontSize: 14 }}>{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {children}
        {hint && <span style={{ ...muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</span>}
      </div>
    </>
  );
}

/** The "Importar" button in the Buzón header (team Admin). On Free it shows the Pro pill and leads to the plan. */
export function ImportButton({ api, onClick }: { api: BoardApi; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="bx-btn" onClick={api.pro ? onClick : api.goPro} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {t('Importar')}
      {!api.pro && <ProPill />}
    </button>
  );
}
