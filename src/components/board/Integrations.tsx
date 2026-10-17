'use client';
import { useCallback, useEffect, useState } from 'react';
import { Popconfirm } from 'antd';
import { rpc } from '@/lib/rpc';
import { SITE_URL } from '@/lib/env';
import { Note, ProPill, Seg } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import type { BoardApi } from './shared';

// Board settings › Integrations (Pro and Enterprise, team Admin): the board's address and key so Zapier, Make,
// Google Forms or any tool can send ideas. They arrive hidden, for the team to review and publish.

type ApiKey = { hint: string; origin: 'comunidad' | 'equipo'; default_category: string | null; created_at: string; created_by: string | null; last_used_at: string | null; use_count: number };
type Info = { api: ApiKey | null; pending: number };

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

  const load = useCallback(() => rpc<Info>('get_integrations', { p_board: board }).then(setInfo).catch((e) => { toast.err(e); setInfo({ api: null, pending: 0 }); }), [board]); // eslint-disable-line react-hooks/exhaustive-deps
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
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Recibí ideas desde Zapier, Make, Google Forms y otras herramientas, sin copiarlas a mano. Está en los planes Pro y Enterprise.')}</span>
        <button type="button" className="bx-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={api.goPro}>{t('Pasar a Pro')}</button>
      </div>
    );
  }
  if (!info) return <div style={card}><span style={muted}>{t('Cargando…')}</span></div>;
  const k = info.api;

  return (
    <>
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{t('Recibí ideas desde otras herramientas')}</div>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>
          {t('Conectá Zapier, Make, Google Forms o cualquier herramienta que pueda mandar un pedido web. Las ideas llegan ocultas, con la etiqueta «Por integración», y el Equipo las revisa y las publica.')}
        </span>
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

      {k && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{t('Para quien la conecte')}</div>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
            {t('Un pedido POST a la dirección, con la clave en el encabezado «Authorization: Bearer» y los datos en JSON. Solo el título es obligatorio.')}
          </span>
          <pre style={{ ...mono, margin: 0, whiteSpace: 'pre-wrap' }}>{`POST ${ENDPOINT}
Authorization: Bearer bxk_…
Content-Type: application/json

{
  "title": "Exportar movimientos a Excel",
  "description": "Necesito bajar los reportes",
  "name": "Lucía Fernández",
  "email": "lucia@cliente.com",
  "category": "Feature",
  "external_id": "respuesta-123"
}`}</pre>
          <span style={muted}>{t('external_id es opcional: si llega dos veces el mismo, se crea una sola idea. Hasta 200 ideas por día por buzón.')}</span>
        </div>
      )}
    </>
  );
}
