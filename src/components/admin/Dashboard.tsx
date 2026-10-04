'use client';
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '@/lib/rpc';
import { Seg, Tag } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { planTone } from '@/lib/constants';
import { ddmmyyyy, fmtPrice, money, plural, rel } from '@/lib/format';
import type { Overview } from './types';

const DAY = 864e5;
const RISK = {
  alto: { l: 'Alto', bg: '#fff2f0', bd: '#ffccc7', fg: '#cf1322' },
  medio: { l: 'Medio', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' },
  bajo: { l: 'Bajo', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' },
};
const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function Dashboard({ period, openClient, openBoard }: { period: '7' | '30' | '90'; openClient: (id: string) => void; openBoard: (id: string) => void }) {
  const toast = useToast();
  const [o, setO] = useState<Overview | null>(null);
  const [riskF, setRiskF] = useState<'all' | 'alto' | 'medio' | 'bajo'>('all');
  useEffect(() => { rpc<Overview>('admin_overview', { p_days: +period }).then(setO).catch((e) => toast.err(e)); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const pro = useMemo(() => (o?.pro || []).map((c) => {
    const d = Math.floor((Date.now() - +new Date(c.last_activity_at)) / DAY);
    return { c, d, r: (d >= 14 ? 'alto' : d >= 7 ? 'medio' : 'bajo') as keyof typeof RISK };
  }).sort((a, b) => b.d - a.d), [o]);
  if (!o) return <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>Cargando…</div>;

  const mrrUsd = pro.filter((x) => x.c.currency === 'USD').reduce((a, x) => a + Number(x.c.amount), 0);
  const mrrArs = pro.filter((x) => x.c.currency === 'ARS').reduce((a, x) => a + Number(x.c.amount), 0);
  const nAlto = pro.filter((x) => x.r === 'alto').length, nMed = pro.filter((x) => x.r === 'medio').length;
  const shown = pro.filter((x) => riskF === 'all' || x.r === riskF);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16 }}>
        {([['Cuentas', o.accounts], ['Buzones activos', o.active_boards], ['Ideas', o.ideas], ['Votos', o.votes], ['Comentarios', o.comments]] as const).map(([l, v]) => (
          <div key={l} style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{l}</span>
            <span style={{ fontSize: 30, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString('es-AR')}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16, alignItems: 'start' }}>
        <Signups />
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Buzones con actividad · últimos 7 días</span>
            <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{plural(o.recent_boards.length, 'buzón', 'buzones')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 300, overflowY: 'auto' }}>
            {o.recent_boards.map((b) => (
              <div key={b.board_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <a onClick={() => openBoard(b.board_id)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</a>
                  <Tag tone={planTone(b.plan)}>{b.plan}</Tag>
                </span>
                <span style={{ color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>{b.ideas} ideas · {rel(b.last_activity_at)}</span>
              </div>
            ))}
            {o.recent_boards.length === 0 && <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>Ningún buzón tuvo actividad esta semana.</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>Ventas</span>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>Suscripciones Pro activas y su última actividad, para detectar churn temprano.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
        {[
          { l: 'MRR', v: 'USD ' + fmtPrice(mrrUsd), n: (mrrArs ? 'ARS ' + fmtPrice(mrrArs) + ' · ' : '') + 'ARR proyectado USD ' + fmtPrice(Math.round(mrrUsd * 12)) },
          { l: 'Suscripciones Pro activas', v: String(pro.length), n: 'Lista ' + money('USD', o.prices.USD) + ' / ' + money('ARS', o.prices.ARS) },
          { l: 'Conversión Free → Pro', v: Math.round((pro.length / Math.max(1, o.accounts)) * 100) + '%', n: pro.length + ' de ' + o.accounts + ' cuentas' },
          { l: 'Cuentas Enterprise', v: String(o.enterprise || 0), n: 'Facturadas fuera de la plataforma' },
          { l: 'En riesgo de churn', v: String(nAlto + nMed), n: nAlto + ' alto · ' + nMed + ' medio', fg: nAlto + nMed ? '#cf1322' : undefined },
        ].map((s) => (
          <div key={s.l} style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{s.l}</span>
            <span style={{ fontSize: 28, fontWeight: 600, color: s.fg }}>{s.v}</span>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{s.n}</span>
          </div>
        ))}
      </div>
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', overflowX: 'auto' }}>
        <div style={{ minWidth: 860 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Suscripciones Pro activas</span>
            <Seg small options={[['all', 'Todas'], ['alto', 'Alto'], ['medio', 'Medio'], ['bajo', 'Bajo']]} value={riskF} onChange={setRiskF} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 90px 110px 140px 110px 90px 90px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontSize: 14, fontWeight: 600 }}>
            {['Cuenta', 'Buzones', 'Pro desde', 'MRR', 'Días sin uso', 'Riesgo', ''].map((h, k) => <div key={k} style={{ padding: '12px 16px' }}>{h}</div>)}
          </div>
          {shown.map(({ c, d, r }) => (
            <div key={c.account_id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 90px 110px 140px 110px 90px 90px', borderBottom: '1px solid #f0f0f0', fontSize: 14, alignItems: 'center' }}>
              <div style={{ padding: '12px 16px', minWidth: 0, display: 'flex', flexDirection: 'column' }}><span>{c.name}</span><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</span></div>
              <div style={{ padding: '12px 16px' }}><a onClick={() => openClient(c.account_id)} title="Ver buzones del cliente">{c.boards}</a></div>
              <div style={{ padding: '12px 16px' }}>{c.pro_since ? ddmmyyyy(c.pro_since) : '—'}</div>
              <div style={{ padding: '12px 16px' }}>{money(c.currency, Number(c.amount))}</div>
              <div style={{ padding: '12px 16px' }}>{d === 0 ? 'Hoy' : plural(d, 'día', 'días')}</div>
              <div style={{ padding: '12px 16px' }}><Tag tone={RISK[r]}>{RISK[r].l}</Tag></div>
              <div style={{ padding: '12px 16px' }}><a href={'mailto:' + c.email}>Contactar</a></div>
            </div>
          ))}
          {shown.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>No hay suscripciones en este nivel de riesgo.</div>}
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Riesgo según días sin actividad en el board: Bajo menos de 7, Medio de 7 a 13, Alto 14 o más.</span>
    </>
  );
}

type Range = '7d' | 'mes' | 'anio' | 'custom';

function Signups() {
  const toast = useToast();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [range, setRange] = useState<Range>('7d');
  const [year, setYear] = useState(String(today.getFullYear()));
  const [from, setFrom] = useState(iso(addD(today, -59)));
  const [to, setTo] = useState(iso(today));
  const [data, setData] = useState<{ at: string; pro: number; free: number }[]>([]);

  const q = useMemo(() => {
    if (range === '7d') return { f: iso(addD(today, -6)), t: iso(today), b: 'day' };
    if (range === 'mes') return { f: iso(addD(today, -29)), t: iso(today), b: 'day' };
    if (range === 'anio') return { f: year + '-01-01', t: year + '-12-31', b: 'month' };
    const n = Math.round((+new Date(to) - +new Date(from)) / DAY) + 1;
    return { f: from, t: to, b: n <= 31 ? 'day' : n <= 120 ? 'week' : 'month' };
  }, [range, year, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rpc<{ at: string; pro: number; free: number }[]>('admin_board_signups', { p_from: q.f, p_to: q.t, p_bucket: q.b }).then(setData).catch((e) => toast.err(e));
  }, [q.f, q.t, q.b]); // eslint-disable-line react-hooks/exhaustive-deps

  const mx = Math.max(1, ...data.map((x) => x.pro + x.free));
  const step = Math.ceil(data.length / 12);
  const label = (s: string) => {
    const d = new Date(s);
    return q.b === 'month' ? d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') : range === '7d' ? d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '') : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  };
  const tot = data.reduce((a, x) => a + x.pro + x.free, 0);

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Altas de buzones</span>
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{plural(tot, 'buzón nuevo', 'buzones nuevos')} en el período</span>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#059669' }} />Pro · {data.reduce((a, x) => a + x.pro, 0)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#a9cbc2' }} />Free · {data.reduce((a, x) => a + x.free, 0)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Seg small options={[['7d', 'Últimos 7 días'], ['mes', 'Último mes'], ['anio', 'Año'], ['custom', 'Personalizado']]} value={range} onChange={setRange} />
          {range === 'anio' && (
            <select className="bx-select" value={year} onChange={(e) => setYear(e.target.value)}>
              {[0, 1, 2].map((k) => String(today.getFullYear() - k)).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {range === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="date" className="bx-input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              <span>a</span>
              <input type="date" className="bx-input" value={to} min={from} max={iso(today)} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 20 ? 2 : 6, height: 150 }}>
        {data.map((x, k) => (
          <div key={x.at} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{data.length <= 14 ? x.pro + x.free : ''}</span>
            <div title={`${label(x.at)}: ${x.pro} Pro · ${x.free} Free`} style={{ width: '100%', maxWidth: 28, display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: Math.round((x.pro / mx) * 110), background: '#059669', borderRadius: '3px 3px 0 0' }} />
              <div style={{ height: x.pro + x.free ? Math.round((x.free / mx) * 110) : 2, background: '#a9cbc2', borderRadius: x.pro ? 0 : '3px 3px 0 0' }} />
            </div>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>{k % step === 0 ? label(x.at) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

