'use client';
import { useCallback, useEffect, useState } from 'react';
import { Popconfirm } from 'antd';
import { rpc } from '@/lib/rpc';
import { SITE_URL } from '@/lib/env';
import { Note, ProPill, Seg } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import type { BoardApi } from './shared';
import { SlackCard, type SlackInfo } from './SlackCard';

// Board settings › Integrations (Pro, Team and Enterprise, team Admin): notices in a Slack channel (SlackCard), and the
// board's address and key so Zapier, Make, Google Forms or any tool can send ideas. Those arrive hidden, for the team
// to review and publish.

type ApiKey = { hint: string; origin: 'comunidad' | 'equipo'; default_category: string | null; created_at: string; created_by: string | null; last_used_at: string | null; use_count: number };
type Info = { api: ApiKey | null; slack: SlackInfo | null; pending: number };

const ENDPOINT = `${SITE_URL}/api/v1/ideas`;
const card: React.CSSProperties = { background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 10px', overflowWrap: 'anywhere' };
const muted: React.CSSProperties = { fontSize: 13, color: 'rgba(0,0,0,0.45)' };

export function Integrations({ api }: { api: BoardApi }) {
  const { t, rel, plural } = useI18n();
  const toast = useToast();
  const board = api.data.board.id;
  const [info, setInfo] = useState<Info | null>(null);
  const [fresh, setFresh] = useState(''); // the key just created: shown only now
  const [testKey, setTestKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => rpc<Info>('get_integrations', { p_board: board }).then(setInfo).catch((e) => { toast.err(e); setInfo({ api: null, slack: null, pending: 0 }); }), [board]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (api.pro) load(); }, [api.pro, load]);

  const copy = (text: string) => { navigator.clipboard?.writeText(text).catch(() => {}); toast.ok('Copiado'); };

  async function createKey() {
    setBusy(true);
    const k = await api.run(rpc<string>('create_api_key', { p_board: board }), info?.api ? 'Clave nueva creada: la anterior dejó de funcionar' : 'Conexión creada');
    setBusy(false);
    if (k) { setFresh(k); setTestKey(k); load(); }
  }
  async function deleteKey() {
    const r = await api.run(rpc('delete_api_key', { p_board: board }), 'Conexión borrada');
    if (r !== undefined) { setFresh(''); setTestKey(''); load(); }
  }
  async function setOptions(origin: string, category: string) {
    const r = await api.run(rpc('set_integration_options', { p_board: board, p_origin: origin, p_category: category }), 'Guardado');
    if (r !== undefined) load();
  }
  // Goes through the same address Zapier and Make use, with the key.
  async function sendTest() {
    if (!testKey.trim()) return toast.err(new Error(t('Pegá la clave del buzón para enviar la prueba.')));
    setBusy(true);
    try {
      const res = await fetch('/api/v1/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + testKey.trim() },
        body: JSON.stringify({ title: t('Idea de prueba de la integración'), description: t('Si ves esta idea en «Por revisar», la conexión funciona. Podés borrarla.'), name: t('Prueba de integración') }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error || t('La prueba no funcionó ({code}).', { code: res.status }));
      toast.ok(t('Listo: la idea de prueba llegó al Buzón, en «Por revisar».'));
      await Promise.all([load(), api.reload()]);
    } catch (e) {
      toast.err(e);
    } finally {
      setBusy(false);
    }
  }

  if (!api.pro) {
    return (
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>{t('Integraciones')}<ProPill /></div>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Recibí avisos en Slack y recibí ideas desde Zapier, Make, Google Forms, Google Sheets y otras herramientas, sin copiarlas a mano. Está en los planes Pro, Team y Enterprise.')}</span>
        <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={api.goPro}>{t('Pasar a Pro')}</button>
      </div>
    );
  }
  if (!info) return <div style={card}><span style={muted}>{t('Cargando…')}</span></div>;
  const k = info.api;

  return (
    <>
      <SlackCard api={api} info={info.slack} reload={load} />

      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{t('Recibí ideas desde otras herramientas')}</div>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>
          {t('Conectá Zapier, Make, Google Forms, Google Sheets o cualquier herramienta que pueda mandar un pedido web. Las ideas llegan ocultas, con la etiqueta «Por integración», y el Equipo decide qué hacer con cada una.')}
        </span>
        <HowItWorks />
        {info.pending > 0 && (
          <Note>
            {t('Hay {n} para revisar.', { n: plural(info.pending, 'idea', 'ideas') })}{' '}
            <a onClick={() => api.setView('buzon')}>{t('Verlas en el Buzón')}</a>
          </Note>
        )}
        {!k ? (
          <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={createKey}>{t('Crear conexión')}</button>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Dirección')}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ ...mono, flex: 1 }}>{ENDPOINT}</code>
                <button type="button" className="bx-btn" onClick={() => copy(ENDPOINT)}>{t('Copiar')}</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Clave')}</span>
              {fresh ? (
                <Note tone="success" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span>{t('Copiala y guardala ahora: por seguridad no la vamos a volver a mostrar.')}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{ ...mono, flex: 1, background: '#fff' }}>{fresh}</code>
                    <button type="button" className="bx-btn" onClick={() => copy(fresh)}>{t('Copiar')}</button>
                  </div>
                </Note>
              ) : (
                <code style={mono}>bxk_••••••••{k.hint}</code>
              )}
              <span style={muted}>
                {t('Creada {when}{by}', { when: rel(k.created_at), by: k.created_by ? ' · ' + k.created_by : '' })}
                {' · '}{k.use_count ? t('Recibió {n} · la última {when}', { n: plural(k.use_count, 'idea', 'ideas'), when: rel(k.last_used_at!) }) : t('Todavía no recibió ideas')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Popconfirm title={t('¿Crear una clave nueva?')} description={t('La clave actual deja de funcionar: vas a tener que cambiarla en Zapier, Make o donde la uses.')}
                okText={t('Crear clave nueva')} cancelText={t('Cancelar')} onConfirm={createKey}>
                <button type="button" className="bx-btn" disabled={busy}>{t('Crear clave nueva')}</button>
              </Popconfirm>
              <Popconfirm title={t('¿Borrar la conexión?')} description={t('Dejan de llegar ideas por integraciones. Las que ya llegaron quedan en el buzón.')}
                okText={t('Borrar')} cancelText={t('Cancelar')} okButtonProps={{ danger: true }} onConfirm={deleteKey}>
                <button type="button" className="bx-btn" style={{ color: '#cf1322' }}>{t('Borrar conexión')}</button>
              </Popconfirm>
            </div>
          </>
        )}
      </div>

      {k && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{t('Cómo llegan las ideas')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14 }}>{t('Cuentan como ideas de')}</span>
            <Seg options={[['comunidad', t('Comunidad')], ['equipo', t('Equipo')]]} value={k.origin} onChange={(o) => setOptions(o, k.default_category || api.cats[0]?.id)} />
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            {t('Categoría, si la idea no trae una que exista en el buzón')}
            <select className="bx-select" value={k.default_category || ''} onChange={(e) => setOptions(k.origin, e.target.value)} style={{ alignSelf: 'flex-start', minWidth: 220 }}>
              {api.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
      )}

      {k && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{t('Probar la conexión')}</div>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Manda una idea de prueba por el mismo camino que usan Zapier y Make.')}</span>
          {!fresh && (
            <input className="bx-input" value={testKey} onChange={(e) => setTestKey(e.target.value)} placeholder={t('Pegá la clave del buzón (bxk_…)')} autoComplete="off" spellCheck={false} />
          )}
          <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={sendTest}>{t('Enviar idea de prueba')}</button>
        </div>
      )}

      {k && <Guides apiKey={fresh} />}
    </>
  );
}

/** Three steps, for someone who never connected anything. */
function HowItWorks() {
  const { t } = useI18n();
  const steps = [
    [t('Creá la conexión'), t('Te damos una dirección y una clave para este buzón.')],
    [t('Conectá tu herramienta'), t('Un formulario o una planilla de Google, Make, Zapier u otra. Más abajo tenés la guía de cada una.')],
    [t('Revisá y decidí'), t('Las ideas llegan a «Por revisar», en el Buzón. Cada una se puede publicar, rechazar o archivar.')],
  ];
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {steps.map(([title, text], n) => (
        <li key={n} style={{ display: 'flex', gap: 10, background: '#fafafa', borderRadius: 8, padding: '12px 14px' }}>
          <span style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', background: '#d1fae5', color: '#047857', fontWeight: 700, fontSize: 13, display: 'grid', placeItems: 'center' }}>{n + 1}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, color: 'rgba(0,0,0,0.65)' }}><b style={{ fontSize: 14, color: 'rgba(0,0,0,0.88)', fontWeight: 600 }}>{title}</b>{text}</span>
        </li>
      ))}
    </ol>
  );
}

type Tool = 'forms' | 'sheets' | 'make' | 'zapier' | 'other';
const NO_KEY = 'PEGÁ_ACÁ_TU_CLAVE';

/** Step-by-step guides per tool, with the address (and the key, while it is on screen) already filled in. */
function Guides({ apiKey }: { apiKey: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [tool, setTool] = useState<Tool>('forms');
  const key = apiKey || NO_KEY;
  const copy = (text: string) => { navigator.clipboard?.writeText(text).catch(() => {}); toast.ok('Copiado'); };

  const Code = ({ text, tall }: { text: string; tall?: boolean }) => (
    <div style={{ position: 'relative' }}>
      <pre style={{ ...mono, margin: 0, whiteSpace: 'pre-wrap', paddingRight: 72, ...(tall ? { maxHeight: 340, overflowY: 'auto' } : {}) }}>{text}</pre>
      <button type="button" className="bx-btn" onClick={() => copy(text)} style={{ position: 'absolute', top: 6, right: 6, height: 26, padding: '0 10px', fontSize: 12 }}>{t('Copiar')}</button>
    </div>
  );
  const Steps = ({ items }: { items: React.ReactNode[] }) => (
    <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, lineHeight: 1.55 }}>
      {items.map((x, n) => <li key={n}>{x}</li>)}
    </ol>
  );

  const json = `{
  "title": "Exportar movimientos a Excel",
  "description": "Necesito bajar los reportes",
  "name": "Lucía Fernández",
  "email": "lucia@cliente.com",
  "external_id": "respuesta-123"
}`;
  const script = `// Boxinger: manda cada respuesta del formulario como idea a tu buzón.
const BOXINGER_URL = '${ENDPOINT}';
const BOXINGER_CLAVE = '${key}';

function enviarABoxinger(e) {
  const r = {};
  e.response.getItemResponses().forEach(function (item) {
    r[item.getItem().getTitle().trim().toLowerCase()] = String(item.getResponse());
  });
  const idea = {
    title: r['título'] || r['titulo'] || r['title'] || '',
    description: r['descripción'] || r['descripcion'] || r['description'] || '',
    name: r['nombre'] || r['name'] || '',
    email: e.response.getRespondentEmail() || r['email'] || '',
    external_id: e.response.getId(),
  };
  UrlFetchApp.fetch(BOXINGER_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + BOXINGER_CLAVE },
    payload: JSON.stringify(idea),
    muteHttpExceptions: true,
  });
}`;

  // Google Sheets / Apps Script: a file of its own inside the sheet's project (it can live next to the client's own code,
  // e.g. an Apps Script web app that saves suggestions to a tab). A timer sends new rows; boxingerEnviar sends at once.
  const sheetsScript = `// Boxinger: manda a tu buzón las sugerencias que se guardan en una pestaña de esta planilla.
// Va en un archivo propio («Boxinger») dentro del proyecto de Apps Script y no toca el resto del código.

const BOXINGER_URL = '${ENDPOINT}';
const BOXINGER_CLAVE = '${key}'; // o guardala en Configuración del proyecto › Propiedades del script, como BOXINGER_CLAVE
const BOXINGER_PESTANA = 'Sugerencias'; // la pestaña donde se guardan las sugerencias
const BOXINGER_PLANILLA_ID = ''; // solo si el proyecto no está dentro de la planilla
const BOXINGER_COLUMNAS = { // cómo se llaman las columnas (sin importar mayúsculas ni acentos)
  title: ['titulo', 'idea', 'sugerencia', 'title'],
  description: ['descripcion', 'detalle', 'comentario', 'description'],
  name: ['nombre', 'name'],
  email: ['email', 'correo', 'mail'],
};

// Forma automática: ejecutala una vez. Después revisa la pestaña cada 5 minutos.
function boxingerPreparar() {
  const ya = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'boxingerRevisar'; });
  if (!ya) ScriptApp.newTrigger('boxingerRevisar').timeBased().everyMinutes(5).create();
  boxingerColumnaEstado_(boxingerHoja_());
  boxingerRevisar();
}

// Manda las filas nuevas (hasta 50 por vuelta) y anota qué pasó en la columna «Boxinger».
function boxingerRevisar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const hoja = boxingerHoja_();
    const est = boxingerColumnaEstado_(hoja) - 1;
    if (hoja.getLastRow() < 2) return;
    const filas = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
    const cab = filas[0].map(boxingerNorm_);
    const col = {};
    Object.keys(BOXINGER_COLUMNAS).forEach(function (k) {
      const nombres = BOXINGER_COLUMNAS[k].map(boxingerNorm_);
      col[k] = cab.findIndex(function (h) { return nombres.indexOf(h) >= 0; });
    });
    let enviadas = 0;
    for (let i = 1; i < filas.length && enviadas < 50; i++) {
      const f = filas[i];
      if (String(f[est]).trim() !== '') continue; // ya se mandó (o tuvo un error)
      if (f.every(function (v, j) { return j === est || String(v).trim() === ''; })) continue; // fila vacía
      const dato = function (k) { return col[k] >= 0 ? String(f[col[k]]).trim() : ''; };
      if (!dato('title')) { hoja.getRange(i + 1, est + 1).setValue('Falta el título'); continue; }
      const r = boxingerEnviar({ title: dato('title'), description: dato('description'), name: dato('name'), email: dato('email'),
        external_id: boxingerHuella_(hoja.getName(), f, est) });
      enviadas++;
      if (r.ok) hoja.getRange(i + 1, est + 1).setValue('Enviada');
      else if (r.parar) { console.warn('Boxinger: ' + r.error); break; } // clave, plan o límite del día: sigue en la próxima vuelta
      else if (!r.reintentar) hoja.getRange(i + 1, est + 1).setValue('Error: ' + r.error);
    }
  } finally {
    lock.releaseLock();
  }
}

// Forma directa: llamala desde la función que guarda la sugerencia, por ejemplo
// boxingerEnviar({ title: datos.titulo, description: datos.detalle, name: datos.nombre, email: datos.email });
function boxingerEnviar(idea) {
  const clave = PropertiesService.getScriptProperties().getProperty('BOXINGER_CLAVE') || BOXINGER_CLAVE;
  try {
    const res = UrlFetchApp.fetch(BOXINGER_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + clave },
      payload: JSON.stringify(idea),
      muteHttpExceptions: true,
    });
    const c = res.getResponseCode();
    let body = {};
    try { body = JSON.parse(res.getContentText()); } catch (e) {}
    if (c < 300) return { ok: true };
    return { ok: false, error: body.error || 'código ' + c, parar: c === 401 || c === 403 || c === 429, reintentar: c >= 500 };
  } catch (e) {
    return { ok: false, error: String(e), reintentar: true };
  }
}

function boxingerHoja_() {
  const libro = BOXINGER_PLANILLA_ID ? SpreadsheetApp.openById(BOXINGER_PLANILLA_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(BOXINGER_PESTANA);
  if (!hoja) throw new Error('Boxinger: no encontré la pestaña «' + BOXINGER_PESTANA + '».');
  return hoja;
}

// La columna «Boxinger» (la agrega al final si no está).
function boxingerColumnaEstado_(hoja) {
  const ultima = Math.max(1, hoja.getLastColumn());
  const i = hoja.getRange(1, 1, 1, ultima).getValues()[0].map(boxingerNorm_).indexOf('boxinger');
  if (i >= 0) return i + 1;
  hoja.getRange(1, ultima + 1).setValue('Boxinger');
  return ultima + 1;
}

function boxingerNorm_(s) {
  return String(s).trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
}

// Un identificador fijo por fila (con sus datos), para que Boxinger no cree dos veces la misma idea.
function boxingerHuella_(pestana, fila, sin) {
  const datos = pestana + '|' + fila.filter(function (v, j) { return j !== sin; }).map(String).join('|');
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, datos, Utilities.Charset.UTF_8);
  return 'sheet-' + d.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 40);
}`;

  return (
    <div style={card}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{t('Cómo conectarla')}</div>
      <Seg options={[['forms', 'Google Forms'], ['sheets', 'Google Sheets'], ['make', 'Make'], ['zapier', 'Zapier'], ['other', t('Otra herramienta')]]} value={tool} onChange={setTool} />
      {!apiKey && tool !== 'other' && (
        <Note tone="warn">{t('Donde dice {placeholder}, pegá la clave del buzón. Si no la guardaste, creá una clave nueva: la vas a ver una vez y la guía la completa sola.', { placeholder: NO_KEY })}</Note>
      )}

      {tool === 'forms' && (
        <>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Gratis y sin otras herramientas: cada respuesta del formulario llega como una idea.')}</span>
          <Steps items={[
            t('Armá el formulario con estas preguntas, escritas igual: «Título» (obligatoria), «Descripción», «Nombre» y «Email». Si el formulario ya recoge los emails, la pregunta Email no hace falta.'),
            t('En el formulario, abrí el menú ⋮ de arriba a la derecha y elegí «Apps Script» (o «Editor de secuencias de comandos»).'),
            <>{t('Borrá lo que aparece, pegá este código y tocá Guardar:')}<div style={{ marginTop: 8 }}><Code text={script} /></div></>,
            t('A la izquierda, entrá a «Activadores» (el reloj) › «Añadir activador». Elegí la función enviarABoxinger y el evento «Al enviar el formulario», y guardá. Google te va a pedir permiso: aceptalo con tu cuenta.'),
            t('Respondé el formulario una vez para probar: la idea aparece en «Por revisar».'),
          ]} />
        </>
      )}

      {tool === 'sheets' && (
        <>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Gratis y sin otras herramientas: las filas nuevas de una pestaña de tu planilla llegan como ideas. Sirve aunque las escriba un formulario propio o una app hecha con Apps Script.')}</span>
          <Steps items={[
            t('Abrí la planilla y entrá a «Extensiones» › «Apps Script». Si ya tiene un proyecto (por ejemplo, tu app hecha con Apps Script), se abre ese: no hace falta tocar lo que tiene.'),
            t('Al lado de «Archivos», tocá «+» › «Secuencia de comandos» y llamalo Boxinger.'),
            <>{t('Pegá este código y cambiá BOXINGER_PESTANA por el nombre de la pestaña donde se guardan las sugerencias. Revisá que la primera fila tenga los títulos de las columnas (por ejemplo, Título, Descripción, Nombre y Email). Tocá Guardar:')}<div style={{ marginTop: 8 }}><Code text={sheetsScript} tall /></div></>,
            t('Arriba elegí la función boxingerPreparar y tocá «Ejecutar». Google te va a pedir permiso: aceptalo con tu cuenta. Desde ahí revisa la pestaña cada 5 minutos y suma una columna «Boxinger» que dice «Enviada» (o el error) en cada fila.'),
            t('Agregá una sugerencia de prueba: en unos minutos aparece en «Por revisar».'),
          ]} />
          <Note tone="info">{t('¿Querés que llegue al instante? Si la sugerencia la guarda tu propio código de Apps Script, sumá una línea con boxingerEnviar (en el código hay un ejemplo) en la función que la guarda y publicá una versión nueva de la app («Implementar» › «Gestionar implementaciones»). En ese caso no ejecutes boxingerPreparar, para no mandarla dos veces.')}</Note>
          <span style={muted}>{t('Si otras personas pueden ver el proyecto, guardá la clave en «Configuración del proyecto» › «Propiedades del script», con el nombre BOXINGER_CLAVE, y borrala del código.')}</span>
        </>
      )}

      {tool === 'make' && (
        <>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Funciona con la cuenta gratis de Make. Sirve para planillas de Google, Typeform, Intercom, HubSpot y cientos de herramientas más.')}</span>
          <Steps items={[
            t('Creá un escenario y elegí de dónde salen las ideas: por ejemplo, Google Sheets › «Watch New Rows».'),
            t('Agregá el módulo HTTP › «Make a request».'),
            <>{t('En URL pegá esta dirección y en Method elegí POST:')}<div style={{ marginTop: 8 }}><Code text={ENDPOINT} /></div></>,
            <>{t('En Headers agregá uno: en Name, Authorization, y en Value:')}<div style={{ marginTop: 8 }}><Code text={'Bearer ' + key} /></div></>,
            <>{t('En Body type elegí Raw y en Content type, JSON. En Request content pegá esto y cambiá cada valor por el dato que corresponde:')}<div style={{ marginTop: 8 }}><Code text={json} /></div></>,
            t('Guardá y tocá «Run once» para probar: la idea aparece en «Por revisar». Después encendé el escenario.'),
          ]} />
        </>
      )}

      {tool === 'zapier' && (
        <>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Usa «Webhooks by Zapier», que en Zapier está en los planes pagos. Si buscás algo gratis, usá Make o Google Forms.')}</span>
          <Steps items={[
            t('Creá un Zap y elegí de dónde salen las ideas: Typeform, Gmail, HubSpot, Intercom, una planilla…'),
            t('Como acción elegí «Webhooks by Zapier» › «POST».'),
            <>{t('En URL pegá esta dirección y en Payload Type elegí json:')}<div style={{ marginTop: 8 }}><Code text={ENDPOINT} /></div></>,
            t('En Data agregá title, description, name, email y external_id, y elegí de qué dato sale cada uno. Solo title es obligatorio.'),
            <>{t('En Headers agregá Authorization con este valor:')}<div style={{ marginTop: 8 }}><Code text={'Bearer ' + key} /></div></>,
            t('Probá el paso: la idea aparece en «Por revisar». Después publicá el Zap.'),
          ]} />
        </>
      )}

      {tool === 'other' && (
        <>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
            {t('Un pedido POST a la dirección, con la clave en el encabezado «Authorization: Bearer» y los datos en JSON. Solo el título es obligatorio.')}
          </span>
          <Code text={`POST ${ENDPOINT}
Authorization: Bearer ${key}
Content-Type: application/json

${json}`} />
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Qué datos podés mandar')}</span>
        {([
          ['title', t('El título de la idea. Obligatorio, de al menos 5 letras; si pasa de 80, el resto va a la descripción.')],
          ['description', t('El detalle. Opcional.')],
          ['name', t('Quién la pidió. Solo lo ve el Equipo.')],
          ['email', t('Su email. Solo lo ve el Equipo; si es de alguien del buzón, la idea queda a su nombre y le llegan los avisos.')],
          ['category', t('El nombre de una categoría del buzón. Si no coincide, va a la categoría elegida arriba.')],
          ['external_id', t('Un identificador de la respuesta o el mensaje. Si llega dos veces el mismo, se crea una sola idea.')],
        ] as const).map(([f, d]) => (
          <div key={f} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'baseline' }}>
            <code style={{ ...mono, padding: '1px 6px', flex: 'none' }}>{f}</code><span style={{ color: 'rgba(0,0,0,0.65)' }}>{d}</span>
          </div>
        ))}
        <span style={muted}>{t('Hasta 200 ideas por día por buzón.')}</span>
      </div>
    </div>
  );
}
