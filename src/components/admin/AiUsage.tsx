'use client';
import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { EyeOutlined, SlidersOutlined } from '@ant-design/icons';
import { rpc } from '@/lib/rpc';
import { Tag } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { planTone } from '@/lib/constants';
import { ddmmyyyy, rel } from '@/lib/format';
import { Table, type Col, type MenuItems } from './Table';

type Board = { board_id: string; name: string; suggest: number; rank: number; cost_usd: number };
type Limits = { suggest: number; rank: number; custom: boolean };
type ClientUse = { account_id: string; name: string; email: string; plan: string; runs: number; suggest: number; rank: number; cost_usd: number; tokens: number; last_at: string | null; boards: Board[]; limits: Limits };
type Overview = {
  month: string;
  months: { month: string; runs: number; cost_usd: number }[];
  totals: { runs: number; suggest: number; rank: number; cost_usd: number; input_tokens: number; output_tokens: number; clients: number };
  clients: ClientUse[];
  defaults: { suggest: number; rank: number; account_suggest: number; account_rank: number };
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthL = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const usd = (v: number) => 'USD ' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 0.1 ? 3 : 2 });
const num = (v: number) => Number(v).toLocaleString('es-AR');
const sec = 'rgba(0,0,0,0.45)';
const card: React.CSSProperties = { background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 };

/** Admin › Consumo IA: what the Enterprise AI assistant costs, per client and board (public.admin_ai_overview). */
export function AiUsagePage({ openClient, openBoard }: { openClient: (id: string) => void; openBoard: (id: string) => void }) {
  const toast = useToast();
  const [month, setMonth] = useState<string | null>(null);
  const [d, setD] = useState<Overview | null>(null);
  const [quota, setQuota] = useState<string | null>(null);
  const load = () => rpc<Overview>('admin_ai_overview', { p_month: month }).then(setD).catch((e) => toast.err(e));
  useEffect(() => { load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <span style={{ fontSize: 14, color: sec }}>Cargando…</span>;
  const t = d.totals;
  const current = d.month === d.months[0]?.month; // limits apply to the current month
  const max = Math.max(0.0001, ...d.months.map((m) => Number(m.cost_usd)));

  const cols: Col<ClientUse>[] = [
    { key: 'name', title: 'Cliente', width: '1.6fr', sort: (c) => c.name, render: (c) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <a onClick={() => openClient(c.account_id)}>{c.name}</a>
        <span style={{ fontSize: 12, color: sec, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</span>
      </div>
    ) },
    { key: 'plan', title: 'Plan', width: '120px', sort: (c) => c.plan, render: (c) => <Tag tone={planTone(c.plan)}>{c.plan}</Tag> },
    { key: 'boards', title: 'Por buzón', width: '1.8fr', render: (c) => c.boards.length ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
        {c.boards.map((b) => <span key={b.board_id}><a onClick={() => openBoard(b.board_id)}>{b.name}</a> <span style={{ color: sec }}>· {b.rank} an. · {b.suggest} sug. · {usd(b.cost_usd)}</span></span>)}
      </div>
    ) : <span style={{ color: sec }}>Sin uso</span> },
    { key: 'rank', title: 'Análisis', width: '100px', sort: (c) => c.rank, render: (c) => num(c.rank) },
    { key: 'suggest', title: 'Sugerencias', width: '110px', sort: (c) => c.suggest, render: (c) => num(c.suggest) },
    { key: 'quota', title: 'Cupo mensual', width: '150px', sort: (c) => c.limits.rank, render: (c) => (
      <a onClick={() => setQuota(c.account_id)} title="Cambiar cupo" style={{ display: 'flex', flexDirection: 'column', fontSize: 13, color: 'inherit' }}>
        <span>{current ? `${c.rank} / ${c.limits.rank}` : c.limits.rank} análisis</span>
        <span>{current ? `${c.suggest} / ${c.limits.suggest}` : c.limits.suggest} sugerencias</span>
        {c.limits.custom && <span style={{ fontSize: 12, color: '#4338ca' }}>Cupo especial</span>}
      </a>
    ) },
    { key: 'tokens', title: 'Tokens', width: '110px', sort: (c) => c.tokens, render: (c) => <span style={{ color: sec }}>{num(c.tokens)}</span> },
    { key: 'cost', title: 'Costo', width: '110px', sort: (c) => Number(c.cost_usd), render: (c) => <b>{usd(c.cost_usd)}</b> },
    { key: 'last', title: 'Último uso', width: '120px', sort: (c) => (c.last_at ? +new Date(c.last_at) : 0), render: (c) => c.last_at ? <span title={ddmmyyyy(c.last_at)}>{rel(c.last_at)}</span> : <span style={{ color: sec }}>—</span> },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <select className="bx-select" value={d.month} onChange={(e) => setMonth(e.target.value)}>
          {d.months.map((m) => <option key={m.month} value={m.month}>{monthL(m.month)}</option>)}
        </select>
        <span style={{ fontSize: 13, color: sec }}>
          El costo se calcula con el precio de lista de Claude Sonnet 5.5 (USD 2 / 10 por millón de tokens de entrada / salida). El saldo real está en <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer">console.anthropic.com</a>.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {[
          ['Costo del mes', usd(t.cost_usd)],
          ['Usos', num(t.runs) + ` (${num(t.rank)} análisis · ${num(t.suggest)} sugerencias)`],
          ['Clientes que lo usaron', num(t.clients)],
          ['Costo promedio por uso', t.runs ? usd(t.cost_usd / t.runs) : '—'],
          ['Tokens', `${num(t.input_tokens)} entrada · ${num(t.output_tokens)} salida`],
        ].map(([l, v]) => (
          <div key={l} style={card}><span style={{ fontSize: 13, color: sec }}>{l}</span><span style={{ fontSize: l === 'Costo del mes' ? 24 : 16, fontWeight: 600 }}>{v}</span></div>
        ))}
      </div>

      <div style={{ ...card, gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Últimos 6 meses</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
          {d.months.slice().reverse().map((m) => (
            <a key={m.month} onClick={() => setMonth(m.month)} title={`${monthL(m.month)}: ${usd(m.cost_usd)} · ${m.runs} usos`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end', color: 'inherit' }}>
              <span style={{ fontSize: 12, color: sec }}>{usd(m.cost_usd)}</span>
              <span style={{ width: '100%', maxWidth: 56, height: `${Math.max(3, (Number(m.cost_usd) / max) * 70)}px`, borderRadius: 4, background: m.month === d.month ? '#4338ca' : '#c7d2fe' }} />
              <span style={{ fontSize: 12, color: m.month === d.month ? '#4338ca' : sec, fontWeight: m.month === d.month ? 600 : 400 }}>{MONTHS[Number(m.month.slice(5)) - 1].slice(0, 3)}</span>
            </a>
          ))}
        </div>
      </div>

      <span style={{ fontSize: 13, color: sec }}>
        Cupo por cliente: {d.defaults.account_rank} análisis y {d.defaults.account_suggest} sugerencias por mes entre todos sus buzones (y hasta {d.defaults.rank} y {d.defaults.suggest} en cada buzón). Tocá el cupo de un cliente para cambiarlo.
      </span>
      <Table cols={cols} rows={d.clients} rowKey={(c) => c.account_id} minWidth={1250} menu={(c): MenuItems => [{ key: 'q', icon: <SlidersOutlined />, label: 'Cambiar cupo', onClick: () => setQuota(c.account_id) }, { key: 'd', icon: <EyeOutlined />, label: 'Ver cliente', onClick: () => openClient(c.account_id) }]} empty="Ningún cliente usó el asistente este mes y no hay clientes Enterprise." />
      <LimitsModal accountId={quota} onClose={() => setQuota(null)} onDone={() => { setQuota(null); load(); }} />
    </>
  );
}

type ClientLimits = {
  plan: string;
  members: { limit: number; unlimited: boolean; custom: boolean; default: number };
  ai: { rank: number; suggest: number; custom: boolean };
  ai_defaults: { account_rank: number; account_suggest: number; rank: number; suggest: number };
};

/** Platform admin: one client's limits (members per team on Enterprise and monthly AI uses). Defaults leave fields as they are. */
export function LimitsModal({ accountId, onClose, onDone }: { accountId: string | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [l, setL] = useState<ClientLimits | null>(null);
  const [members, setMembers] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [rank, setRank] = useState('');
  const [sug, setSug] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setL(null);
    if (accountId) rpc<ClientLimits>('admin_client_limits', { p_account: accountId }).then((r) => {
      setL(r); setMembers(String(r.members.limit)); setUnlimited(r.members.unlimited); setRank(String(r.ai.rank)); setSug(String(r.ai.suggest));
    }).catch((e) => toast.err(e));
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const custom = (v: string, def: number) => (v.trim() === '' || Number(v) === def ? null : Math.round(Number(v)));
  const worst = l ? Number(rank || l.ai_defaults.account_rank) * 0.16 + Number(sug || l.ai_defaults.account_suggest) * 0.03 : 0;
  async function save(reset?: boolean) {
    if (!l) return;
    setBusy(true);
    try {
      await rpc('admin_set_client_limits', reset
        ? { p_account: accountId, p_members: null, p_members_unlimited: false, p_rank: null, p_suggest: null }
        : { p_account: accountId, p_members: unlimited ? null : custom(members, l.members.default), p_members_unlimited: unlimited,
            p_rank: custom(rank, l.ai_defaults.account_rank), p_suggest: custom(sug, l.ai_defaults.account_suggest) });
      toast.ok(reset ? 'Límites por defecto' : 'Límites actualizados');
      onDone();
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 };
  return (
    <Modal open={!!accountId} onCancel={onClose} footer={null} title="Límites del cliente" width={460} destroyOnHidden>
      {!l ? <span style={{ fontSize: 14, color: sec }}>Cargando…</span> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
          {l.plan !== 'enterprise' && <span style={{ fontSize: 13, color: '#d46b08' }}>Este cliente no está en Enterprise: los límites aplican cuando lo esté.</span>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Miembros por equipo</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#059669' }} />Ilimitados
            </label>
            {!unlimited && <label style={field}>Hasta (además del dueño)<input className="bx-input" type="number" min="1" max="10000" value={members} onChange={(e) => setMembers(e.target.value)} /></label>}
            <span style={{ fontSize: 12, color: sec }}>Por defecto: {l.members.default}. Los invitados de la Comunidad no tienen límite.</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Asistente IA por mes (entre todos los buzones)</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={field}>Análisis<input className="bx-input" type="number" min="0" max="1000" value={rank} onChange={(e) => setRank(e.target.value)} /></label>
              <label style={field}>Sugerencias<input className="bx-input" type="number" min="0" max="1000" value={sug} onChange={(e) => setSug(e.target.value)} /></label>
            </div>
            <span style={{ fontSize: 12, color: sec }}>Por defecto: {l.ai_defaults.account_rank} y {l.ai_defaults.account_suggest}. Cada buzón tiene además su tope ({l.ai_defaults.rank} y {l.ai_defaults.suggest}). Costo máximo si usa todo: {usd(worst)} por mes.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {(l.members.custom || l.ai.custom) && <button type="button" className="bx-btn" disabled={busy} onClick={() => save(true)} style={{ marginRight: 'auto' }}>Volver a los límites por defecto</button>}
            <button type="button" className="bx-btn" onClick={onClose}>Cancelar</button>
            <button type="button" className="bx-btn-primary" disabled={busy} onClick={() => save()}>Guardar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
