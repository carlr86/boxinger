'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Popconfirm } from 'antd';
import { rpc } from '@/lib/rpc';
import { Note, ToggleRow } from '@/components/ui';
import { SlackLogo } from '@/components/SlackLogo';
import { useToast } from '@/components/Providers';
import { useI18n } from '@/lib/i18n/client';
import type { BoardApi } from './shared';

// Board settings › Integrations › «Avisos en Slack» (Pro and Enterprise, team Admin): one Slack channel per board that
// hears about new ideas, ideas waiting in «Por revisar», the Roadmap, launches and a Monday summary.
// The connection itself goes through /api/slack/connect → Slack → /api/slack/callback.

export type SlackEvents = { new_idea: boolean; review: boolean; planned: boolean; launched: boolean; weekly: boolean };
export type SlackInfo = {
  channel: string | null; workspace: string | null; config_url: string | null; events: SlackEvents;
  created_at: string; created_by: string | null; last_sent_at: string | null; error: string | null; error_at: string | null;
};

const ENABLED = !!process.env.NEXT_PUBLIC_SLACK_CLIENT_ID;
const card: React.CSSProperties = { background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 };
const muted: React.CSSProperties = { fontSize: 13, color: 'rgba(0,0,0,0.45)' };

export function SlackCard({ api, info, reload, enabled = ENABLED }: { api: BoardApi; info: SlackInfo | null; reload: () => void; enabled?: boolean }) {
  const { t, rel } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const back = useSearchParams().get('slack');
  const [busy, setBusy] = useState(false);
  const board = api.data.board.id;
  const connectUrl = `/api/slack/connect?board=${board}`;

  // Coming back from Slack: say how it went once, then clean the address.
  useEffect(() => {
    if (!back) return;
    if (back === 'ok') toast.ok(t('Listo: Slack quedó conectado. Te mandamos un primer mensaje al canal.'));
    else if (back === 'cancelado') toast.info(t('No se conectó Slack: cancelaste en la pantalla de Slack.'));
    else if (back === 'sin-configurar') toast.err(new Error(t('La conexión con Slack todavía no está habilitada.')));
    else toast.err(new Error(t('No pudimos conectar Slack. Probá de nuevo.')));
    router.replace(`${pathname}?seccion=integraciones`, { scroll: false });
  }, [back]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null;

  async function setEvent(k: keyof SlackEvents, v: boolean) {
    const r = await api.run(rpc('set_slack_events', { p_board: board, p_events: { ...info!.events, [k]: v } }), 'Guardado');
    if (r !== undefined) reload();
  }
  async function test() {
    setBusy(true);
    try {
      const res = await fetch('/api/slack/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error || t('La prueba no funcionó ({code}).', { code: res.status }));
      toast.ok(t('Listo: mandamos un mensaje de prueba al canal.'));
    } catch (e) {
      toast.err(e);
    } finally {
      setBusy(false);
      reload();
    }
  }
  async function disconnect() {
    const r = await api.run(rpc('delete_slack', { p_board: board }), 'Slack desconectado');
    if (r !== undefined) reload();
  }

  const events: [keyof SlackEvents, string, string][] = [
    ['new_idea', t('Idea nueva'), t('Cuando alguien carga una idea, o el Equipo publica una que estaba oculta.')],
    ['review', t('Idea para revisar'), t('Cuando llega una idea por integración y espera en «Por revisar».')],
    ['planned', t('Pasa al Roadmap'), t('La primera vez que una idea entra al Roadmap.')],
    ['launched', t('Idea lanzada'), t('Cuando una idea se marca como lanzada.')],
    ['weekly', t('Resumen semanal'), t('Los lunes: ideas nuevas, votos, comentarios y las más votadas de la semana.')],
  ];

  return (
    <div style={card}>
      <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}><SlackLogo />{t('Avisos en Slack')}</div>
      <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>
        {t('Boxinger avisa en un canal de Slack cuando llega una idea, cuando una pasa al Roadmap o se lanza, y cada lunes manda un resumen. Cada mensaje tiene el link a la idea.')}
      </span>

      {!info ? (
        <>
          <a href={connectUrl} className="bx-btn" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', fontWeight: 600, textDecoration: 'none' }}>
            <SlackLogo size={18} />{t('Conectar con Slack')}
          </a>
          <span style={muted}>{t('Se abre Slack: elegís el canal y tocás «Permitir». Boxinger solo puede escribir en ese canal; no lee nada.')}{' '}
            <a href="/slack" target="_blank" rel="noopener">{t('Cómo funciona')}</a></span>
        </>
      ) : (
        <>
          {info.error && (
            <Note tone="warn" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span>{/channel_is_archived/.test(info.error) ? t('El canal de Slack se archivó.') : t('Slack ya no acepta los avisos: puede que hayan quitado la app o borrado el canal.')}{' '}
                {t('Los avisos están en pausa hasta que vuelvas a conectar.')}</span>
              <a href={connectUrl} style={{ alignSelf: 'flex-start', fontWeight: 600 }}>{t('Volver a conectar')}</a>
            </Note>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14 }}>
              {t('Conectado a {channel}', { channel: info.channel || t('un canal') })}
              {info.workspace ? <span style={{ color: 'rgba(0,0,0,0.45)' }}> · {info.workspace}</span> : null}
            </span>
            <span style={muted}>
              {t('Desde {when}{by}', { when: rel(info.created_at), by: info.created_by ? ' · ' + info.created_by : '' })}
              {info.last_sent_at ? ' · ' + t('Último aviso {when}', { when: rel(info.last_sent_at) }) : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t('Qué avisar')}</span>
            {events.map(([k, label, desc]) => <ToggleRow key={k} label={label} desc={desc} on={!!info.events?.[k]} onChange={(v) => setEvent(k, v)} />)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="bx-btn-primary" disabled={busy} onClick={test}>{busy ? t('Enviando…') : t('Enviar mensaje de prueba')}</button>
            <a href={connectUrl} className="bx-btn" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{t('Cambiar de canal')}</a>
            <Popconfirm title={t('¿Desconectar Slack?')} description={t('Dejan de llegar avisos al canal. Para sacar la app del todo, quitala también desde Slack.')}
              okText={t('Desconectar')} cancelText={t('Cancelar')} okButtonProps={{ danger: true }} onConfirm={disconnect}>
              <button type="button" className="bx-btn" style={{ color: '#cf1322' }}>{t('Desconectar')}</button>
            </Popconfirm>
          </div>
        </>
      )}
    </div>
  );
}
