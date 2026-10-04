'use client';
import { useEffect, useState } from 'react';
import { rpc } from '@/lib/rpc';
import { Tag } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { ddmmyyyy, rel } from '@/lib/format';

type AppError = { id: number; source: string; message: string; detail: Record<string, unknown>; count: number; first_at: string; last_at: string };
export type ErrorsData = { open: number; rows: AppError[] };

const SOURCE: Record<string, string> = {
  server: 'Servidor', navegador: 'Navegador', emails: 'Emails', checkout: 'Checkout', 'cancelar-suscripcion': 'Cancelación',
  'webhook-creem': 'Aviso de Creem', 'webhook-mercadopago': 'Aviso de Mercado Pago', 'webhook-paypal': 'Aviso de PayPal',
  'cron-precios': 'Proceso diario', 'cron-contacto': 'Proceso diario',
};
const card: React.CSSProperties = { background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 };

/** Admin › Errores: open production errors (src/lib/alerts.ts). */
export function ErrorsPage({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast();
  const [d, setD] = useState<ErrorsData | null>(null);
  const [more, setMore] = useState<number | null>(null);
  const load = () => rpc<ErrorsData>('admin_errors', { p_limit: 50 }).then((r) => { setD(r); onCount(r.open); }).catch((e) => toast.err(e));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const resolve = async (id: number | null) => {
    try { await rpc('admin_resolve_error', { p_id: id }); toast.ok(id ? 'Error marcado como resuelto' : 'Errores marcados como resueltos'); load(); } catch (e) { toast.err(e); }
  };
  const copy = (e: AppError) => {
    const text = `Error en Boxinger (${SOURCE[e.source] || e.source})\n${e.message}\n${e.count} veces, última ${new Date(e.last_at).toLocaleString('es-AR')}\n\n${JSON.stringify(e.detail, null, 2)}`;
    navigator.clipboard?.writeText(text).then(() => toast.ok('Detalle copiado'), () => toast.err(new Error('No se pudo copiar')));
  };

  return (
    <>
      <div style={{ ...card, background: '#fafafa' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>¿Qué hago con un error?</span>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7, color: 'rgba(0,0,0,0.75)' }}>
          <li>Tocá <b>Copiar detalle</b> y pasáselo a quien mantiene la app (por ejemplo, a Claude en una sesión de trabajo). No hace falta entenderlo.</li>
          <li>Cuando te confirmen que está arreglado y publicado, marcalo como <b>Resuelto</b>.</li>
          <li>Si vuelve a pasar, se reabre solo y te llega otro email: así sabés que el arreglo no alcanzó.</li>
        </ol>
        <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Un error que pasó una sola vez y no se repite en días suele ser un corte momentáneo: también lo podés marcar como resuelto.</span>
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Sin resolver · {d?.open ?? '…'}</span>
          {!!d?.open && <a onClick={() => resolve(null)} style={{ fontSize: 13 }}>Marcar todos como resueltos</a>}
        </div>
        {d && d.rows.length === 0 && <span style={{ fontSize: 14, color: '#389e0d' }}>No hay errores sin resolver. Todo funciona.</span>}
        {d?.rows.map((e) => (
          <div key={e.id} style={{ borderTop: '1px solid #f0f0f0', padding: '12px 0 4px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Tag tone={{ l: '', bg: '#fff2f0', bd: '#ffccc7', fg: '#cf1322' }}>{SOURCE[e.source] || e.source}</Tag>
              <span style={{ flex: 1, minWidth: 220, overflowWrap: 'anywhere' }}>{e.message}</span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>{e.count > 1 ? e.count + ' veces · ' : ''}{rel(e.last_at)}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <a onClick={() => copy(e)}>Copiar detalle</a>
              <a onClick={() => setMore(more === e.id ? null : e.id)}>{more === e.id ? 'Ocultar detalle' : 'Ver detalle'}</a>
              <a onClick={() => resolve(e.id)}>Resuelto</a>
            </div>
            {more === e.id && (
              <pre style={{ margin: 0, fontSize: 12, background: '#fafafa', borderRadius: 6, padding: 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 300, overflowY: 'auto' }}>
                {`Primera vez: ${ddmmyyyy(e.first_at)}\n` + JSON.stringify(e.detail, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
