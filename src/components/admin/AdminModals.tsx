'use client';
import { useEffect, useState } from 'react';
import { Drawer, Modal } from 'antd';
import { rpc } from '@/lib/rpc';
import { Avatar, Choice, Field, Note, Rows, Tag } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { useGridCols } from '@/components/board/IdeaGrid';
import { BAD, OK, planTone } from '@/lib/constants';

const VIS_L: Record<string, string> = { public: 'Público', invite: 'Solo invitados', private: 'Privado' };
import { SITE_URL, boardUrl, displayUrl } from '@/lib/env';
import { ddmmyyyy, dlong, fmtPrice, isEmail, money, plural, rel } from '@/lib/format';
import { adminCreateClient, adminSendActivation, adminUpdateSubscription } from '@/app/app/admin/actions';
import type { Client, ClientDetail, Prices } from './types';

const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const tomorrow = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d; };
const PROVIDER_L: Record<string, string> = { paypal: 'PayPal', mercadopago: 'Mercado Pago', lemonsqueezy: 'Lemon Squeezy', creem: 'Creem', manual: 'Manual' };
const card = (on: boolean): React.CSSProperties => ({ border: on ? '2px solid #059669' : '1px solid #d9d9d9', background: on ? '#d1fae5' : '#fff', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' });
const activationLink = (t: string) => `${SITE_URL}/app/activar/${t}`;

// ───────────────────────── Crear cliente ─────────────────────────
export function NewClientModal({ open, onClose, onDone, prices }: { open: boolean; onClose: () => void; onDone: () => void; prices: { USD: number } }) {
  const toast = useToast();
  const blank = { name: '', email: '', team: '', board: '', plan: 'free' as 'free' | 'pro' | 'enterprise', send: true };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ token: string; slug: string; board: string; sent: boolean; account_id: string } | null>(null);
  useEffect(() => { if (open) { setF(blank); setTried(false); setDone(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const e = { name: !f.name.trim() ? 'Ingresá el nombre' : '', email: !f.email.trim() ? 'Ingresá el email' : !isEmail(f.email.trim()) ? 'Email inválido' : '', team: !f.team.trim() ? 'Ingresá el nombre del equipo' : '' };

  async function submit() {
    setTried(true);
    if (e.name || e.email || e.team) return;
    setBusy(true);
    const r = await adminCreateClient(f);
    setBusy(false);
    if (!r.ok) return toast.err(new Error(r.error));
    setDone({ ...r.data, sent: f.send });
    toast.ok(f.send ? 'Cliente creado · acceso enviado a ' + f.email.trim() : 'Cliente creado');
    onDone();
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={done ? 'Cliente creado' : 'Crear cliente'} width={520} destroyOnHidden>
      {!done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
          <Field label="Nombre y apellido" error={tried ? e.name : ''}><input className="bx-input" maxLength={60} placeholder="Ej: Laura Giménez" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} /></Field>
          <Field label="Email" error={tried ? e.email : ''}><input className="bx-input" maxLength={80} placeholder="laura@empresa.com" value={f.email} onChange={(x) => setF({ ...f, email: x.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <Field label="Nombre del equipo" error={tried ? e.team : ''}><input className="bx-input" maxLength={60} placeholder="Ej: Giménez Seguros" value={f.team} onChange={(x) => setF({ ...f, team: x.target.value })} /></Field>
            <Field label="Primer buzón" hint="Si lo dejás vacío, usa el nombre del equipo."><input className="bx-input" maxLength={60} placeholder={f.team.trim() || 'Nombre del buzón'} value={f.board} onChange={(x) => setF({ ...f, board: x.target.value })} /></Field>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Plan
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              {([['free', 'Free', '1 equipo · 1 buzón · solo el admin'], ['pro', 'Pro', money('USD', prices.USD) + ' / mes · hasta 4 miembros'], ['enterprise', 'Enterprise', 'A medida · miembros ilimitados · IA']] as const).map(([k, l, d]) => (
                <div key={k} style={card(f.plan === k)} onClick={() => setF({ ...f, plan: k })}><span style={{ fontWeight: 600 }}>{l}</span><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>{d}</span></div>
              ))}
            </div>
            {f.plan === 'pro' && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Pro asignado a mano (sin cobro automático). El cliente puede suscribirse después desde su perfil.</span>}
            {f.plan === 'enterprise' && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Enterprise se factura fuera de la plataforma, según lo acordado con el cliente.</span>}
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.send} onChange={(x) => setF({ ...f, send: x.target.checked })} style={{ width: 16, height: 16, marginTop: 2, accentColor: '#059669' }} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Enviar acceso por email ahora</span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{f.send ? 'Le llega un email con el link para activar su cuenta (válido 7 días).' : 'El cliente queda creado y podés enviarle el acceso más tarde.'}</span>
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="bx-btn" onClick={onClose}>Cancelar</button>
            <button type="button" className="bx-btn-primary" disabled={busy} onClick={submit}>{f.send ? 'Crear y enviar acceso' : 'Crear cliente'}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
          <Note tone="success">{done.sent ? `Enviamos el acceso a ${f.email.trim()}. Cuando active la cuenta va a poder entrar a su buzón.` : `${f.name.trim()} quedó creado sin acceso. Podés enviarlo ahora o más tarde desde el menú de la tabla.`}</Note>
          <Rows rows={[{ l: 'Cliente', v: f.name.trim() }, { l: 'Email', v: f.email.trim() }, { l: 'Equipo', v: f.team.trim() }, { l: 'Buzón', v: done.board }, { l: 'Plan', v: f.plan === 'enterprise' ? 'Enterprise · a medida' : f.plan === 'pro' ? 'Pro · ' + money('USD', prices.USD) + ' / mes' : 'Free · sin costo' }]} />
          <CopyLink label="Link de activación" url={activationLink(done.token)} hint="Válido por 7 días. Al activarlo, el cliente crea su contraseña o entra con Google." />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {!done.sent && <button type="button" className="bx-btn" onClick={async () => { const r = await adminSendActivation(done.account_id, true); if (r.ok) { toast.ok('Acceso enviado a ' + f.email.trim()); setDone({ ...done, sent: true }); onDone(); } else toast.err(new Error(r.error)); }}>Enviar acceso por email</button>}
            <button type="button" className="bx-btn-primary" onClick={onClose}>Listo</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CopyLink({ label, url, hint }: { label: string; url: string; hint?: string }) {
  const toast = useToast();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{label}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 4px 4px 11px', background: '#fafafa' }}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.replace(/^https?:\/\//, '')}</span>
        <a style={{ padding: '4px 10px' }} onClick={() => { navigator.clipboard?.writeText(url).catch(() => {}); toast.ok('Link copiado'); }}>Copiar</a>
      </div>
      {hint && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{hint}</span>}
    </div>
  );
}

// ───────────────────────── Editar suscripción ─────────────────────────
export function EditSubscriptionModal({ client: c, onClose, onDone }: { client: Client | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free');
  const [mode, setMode] = useState<'list' | 'pct' | 'fixed'>('list');
  const [value, setValue] = useState('');
  const [term, setTerm] = useState<'months' | 'date' | 'none'>('months');
  const [months, setMonths] = useState('3');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!c) return;
    const act = !!c.deal_type;
    setPlan(c.plan.toLowerCase() as 'free' | 'pro' | 'enterprise'); setMode(act ? c.deal_type! : 'list'); setValue(act ? String(c.deal_value) : '');
    setTerm(act ? (c.deal_until ? 'date' : 'none') : 'months'); setMonths('3'); setUntil(act && c.deal_until ? iso(new Date(c.deal_until)) : '');
    setNote(c.deal_note || ''); setNotify(true); setTried(false);
  }, [c]);
  if (!c) return <Modal open={false} />;

  const list = Number(c.list_amount), cur = c.currency, isPro = plan === 'pro', hasValue = isPro && mode !== 'list', v = Number(value);
  const valueErr = !hasValue ? '' : !value ? 'Ingresá un valor' : mode === 'pct' ? (!(v >= 1 && v <= 100) ? 'Entre 1 y 100 %' : '') : !(v > 0) ? 'Tiene que ser mayor a 0' : v >= list ? `Tiene que ser menor al precio de lista (${money(cur, list)})` : '';
  const m = Number(months);
  const untilTs = !hasValue || term === 'none' ? null : term === 'months' ? (m >= 1 ? (() => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.getTime(); })() : NaN) : until ? new Date(until + 'T23:59').getTime() : NaN;
  const termErr = !hasValue ? '' : term === 'months' ? (!(Number.isInteger(m) && m >= 1 && m <= 36) ? 'Entre 1 y 36 meses' : '') : term === 'date' ? (!until ? 'Elegí una fecha' : (untilTs as number) < tomorrow().getTime() ? 'La fecha tiene que ser posterior a hoy' : '') : '';
  const eff = !isPro ? 0 : !hasValue || valueErr ? list : mode === 'fixed' ? v : Math.round(list * (1 - v / 100) * 100) / 100;
  const sum = plan === 'enterprise' ? 'Todo lo de Pro, miembros ilimitados y funciones con IA. Se factura fuera de la plataforma.' : !isPro ? 'Plan Free, sin costo.' : !hasValue ? 'Precio de lista. Sigue los cambios de precio programados.' : valueErr || termErr ? 'Completá los datos para ver el resumen.'
    : (mode === 'pct' ? v + '% de descuento sobre la lista' : 'Precio exclusivo') + (untilTs ? ` hasta el ${ddmmyyyy(untilTs)}. Después vuelve al precio de lista (${money(cur, list)}).` : ', sin vencimiento.');

  async function save() {
    setTried(true);
    if (valueErr || termErr) return;
    setBusy(true);
    const r = await adminUpdateSubscription({ account: c!.account_id, plan, dealType: hasValue ? (mode as 'pct' | 'fixed') : null, value: hasValue ? v : null, until: hasValue && untilTs ? new Date(untilTs).toISOString() : null, note, notify });
    setBusy(false);
    if (!r.ok) return toast.err(new Error(r.error));
    if (r.data.warning) toast.info(r.data.warning);
    toast.ok('Suscripción actualizada' + (notify ? ' · se avisó a ' + c!.email : ''));
    onDone(); onClose();
  }

  return (
    <Modal open onCancel={onClose} footer={null} width={520} destroyOnHidden
      title={<div style={{ display: 'flex', flexDirection: 'column' }}><span>Editar suscripción</span><span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(0,0,0,0.45)' }}>{c.name} · {c.email}</span></div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
        {c.provider && c.provider !== 'manual' && c.plan === 'Pro' && plan !== 'pro' && <Note tone="warn">Al guardar se cancela la suscripción en {PROVIDER_L[c.provider]} para que no se le vuelva a cobrar.</Note>}
        {c.provider && c.provider !== 'manual' && c.plan === 'Pro' && plan === 'pro' && <Note>Suscripción cobrada por {PROVIDER_L[c.provider]} en {cur}. Los cambios de precio se aplican también en {PROVIDER_L[c.provider]} desde el próximo cobro.</Note>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Plan
          <Choice options={[['free', 'Free'], ['pro', 'Pro'], ['enterprise', 'Enterprise']]} value={plan} onChange={setPlan} />
        </div>
        {isPro && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Precio
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              {([['list', 'Precio de lista', money(cur, list) + ' / mes'], ['pct', 'Descuento', 'Porcentaje sobre el precio de lista'], ['fixed', 'Precio exclusivo', `Monto fijo en ${cur} / mes`]] as const).map(([k, l, d]) => (
                <div key={k} style={card(mode === k)} onClick={() => setMode(k)}><span style={{ fontWeight: 600, fontSize: 14 }}>{l}</span><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>{d}</span></div>
              ))}
            </div>
          </div>
        )}
        {hasValue && (
          <>
            <Field label={mode === 'pct' ? 'Descuento (%)' : `Precio exclusivo (${cur} / mes)`} error={tried ? valueErr : ''}>
              <input className="bx-input" type="number" min="0" step={mode === 'pct' ? '1' : '0.5'} placeholder={mode === 'pct' ? 'Ej: 20' : cur === 'USD' ? 'Ej: 7,99' : 'Ej: 9999'} value={value} onChange={(x) => setValue(x.target.value)} />
            </Field>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Plazo
              <Choice options={[['months', 'Por meses'], ['date', 'Hasta fecha'], ['none', 'Sin vencimiento']]} value={term} onChange={setTerm} />
              {term === 'months' && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="bx-input" type="number" min="1" max="36" step="1" style={{ width: 90 }} value={months} onChange={(x) => setMonths(x.target.value)} /><span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>meses desde hoy</span></div>}
              {term === 'date' && <input className="bx-input" type="date" min={iso(tomorrow())} value={until} onChange={(x) => setUntil(x.target.value)} style={{ width: 180 }} />}
              {tried && termErr && <span style={{ fontSize: 13, color: '#ff4d4f' }}>{termErr}</span>}
            </div>
            <Field label="Motivo (interno)"><input className="bx-input" maxLength={120} placeholder="Ej: acuerdo comercial, cliente fundador" value={note} onChange={(x) => setNote(x.target.value)} /></Field>
          </>
        )}
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Resumen</span>
          <span style={{ fontSize: 20, fontWeight: 600 }}>{plan === 'enterprise' ? 'A medida' : isPro ? money(cur, eff) + ' / mes' : money(cur, 0)}</span>
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>{sum}</span>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={notify} onChange={(x) => setNotify(x.target.checked)} style={{ width: 16, height: 16, accentColor: '#059669' }} />Avisar al cliente por email
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="bx-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="bx-btn-primary" disabled={busy} onClick={save}>Guardar cambios</button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Programar precio ─────────────────────────
export function SchedulePriceModal({ open, currency, prices, onClose, onDone }: { open: boolean; currency: 'USD' | 'ARS'; prices: Prices | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState(iso(tomorrow()));
  const [scope, setScope] = useState<'all' | 'new'>('all');
  const [notify, setNotify] = useState(true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPrice(''); setFrom(iso(tomorrow())); setScope('all'); setNotify(true); setTried(false); } }, [open]);
  if (!prices) return null;
  const cur = Number(prices.current[currency]), nPro = prices.pro_count[currency], pv = Number(price);
  const fromTs = from ? new Date(from + 'T00:00').getTime() : 0;
  const errs = {
    price: !price ? 'Ingresá un precio' : !(pv > 0) || Math.round(pv * 100) !== pv * 100 ? 'Usá un número mayor a 0, con hasta 2 decimales' : pv === cur ? 'Es igual al precio vigente' : '',
    from: !from ? 'Elegí una fecha' : fromTs < tomorrow().getTime() ? 'La fecha tiene que ser posterior a hoy' : prices.rows.some((r) => r.currency === currency && ddmmyyyy(r.effective_from) === ddmmyyyy(fromTs)) ? 'Ya hay un cambio programado para ese día' : '',
  };
  const days = fromTs ? Math.round((fromTs - Date.now()) / 864e5) : 0;

  async function save() {
    setTried(true);
    if (errs.price || errs.from) return;
    setBusy(true);
    try {
      await rpc('admin_schedule_price', { p_currency: currency, p_amount: pv, p_from: from, p_scope: scope, p_notify: notify });
      fetch('/api/outbox', { method: 'POST' }).catch(() => {});
      toast.ok(`Precio ${money(currency, pv)} programado desde el ${ddmmyyyy(fromTs)}${notify && scope === 'all' ? ' · aviso enviado' : ''}`);
      onDone(); onClose();
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={`Programar nuevo precio Pro (${currency})`} width={520} destroyOnHidden>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>Precio vigente: {money(currency, cur)} / mes · {currency === 'USD' ? 'Creem' : 'Mercado Pago'}.</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label={`Nuevo precio (${currency} / mes)`} error={tried ? errs.price : ''}><input className="bx-input" type="number" min="1" step={currency === 'USD' ? '0.01' : '1'} placeholder={currency === 'USD' ? 'Ej: 12' : 'Ej: 17999'} value={price} onChange={(x) => setPrice(x.target.value)} /></Field>
          <Field label="Vigente desde" error={tried ? errs.from : ''}><input className="bx-input" type="date" min={iso(tomorrow())} value={from} onChange={(x) => setFrom(x.target.value)} /></Field>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Aplica a
          {([['all', 'Todas las suscripciones', 'Las activas pasan al nuevo precio en su próxima renovación desde esa fecha.'], ['new', 'Solo nuevas suscripciones', `Las ${nPro} activas mantienen ${money(currency, cur)}.`]] as const).map(([k, l, d]) => (
            <div key={k} style={card(scope === k)} onClick={() => setScope(k)}><span style={{ fontWeight: 600 }}>{l}</span><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>{d}</span></div>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={notify} onChange={(x) => setNotify(x.target.checked)} style={{ width: 16, height: 16, marginTop: 2, accentColor: '#059669' }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>Avisar por email a los clientes Pro</span>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{!notify ? 'No se envía ningún aviso.' : scope === 'new' ? 'Solo aplica a nuevas suscripciones: no hace falta avisar.' : 'Se envía hoy un email con el nuevo precio y la fecha' + (days > 0 && days < 30 ? '. Se recomienda avisar con al menos 30 días.' : '.')}</span>
          </span>
        </label>
        {pv > 0 && scope === 'all' && !errs.price && (
          <Note>MRR estimado desde esa fecha: {money(currency, nPro * pv)} ({pv > cur ? '+' : '−'}{money(currency, Math.abs(nPro * (pv - cur)))} con {plural(nPro, 'suscripción activa', 'suscripciones activas')}).</Note>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="bx-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="bx-btn-primary" disabled={busy} onClick={save}>Programar precio</button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Detalle del cliente ─────────────────────────
export function ClientDrawer({ accountId, onClose, openBoard, onEditSub, reload }: { accountId: string; onClose: () => void; openBoard: (id: string) => void; onEditSub: (c: Client) => void; reload: () => void }) {
  const toast = useToast();
  const { isMobile } = useGridCols();
  const [c, setC] = useState<ClientDetail | null>(null);
  const load = () => rpc<ClientDetail>('admin_client_detail', { p_account: accountId }).then(setC).catch((e) => toast.err(e));
  useEffect(() => { load(); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = c ? Math.floor((Date.now() - +new Date(c.last_activity_at)) / 864e5) : 0;
  const risk = !c || c.plan !== 'Pro' ? '—' : d >= 14 ? 'Alto' : d >= 7 ? 'Medio' : 'Bajo';

  return (
    <Drawer open placement="right" onClose={onClose} closable={false} width={isMobile ? '100%' : 520} styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
        <a onClick={onClose} style={{ color: 'rgba(0,0,0,0.45)', fontSize: 20, lineHeight: 1 }}>×</a>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Detalle del cliente</span>
        {c && <a style={{ fontSize: 14 }} onClick={() => onEditSub(c)}>Editar suscripción</a>}
      </div>
      {c && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={c.name} id={c.owner_id} size={44} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 16, fontWeight: 600 }}>{c.name}</span><span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{c.email}</span></div>
            <Tag tone={planTone(c.plan)}>{c.plan}</Tag>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
            {[['Buzones', c.board_list.length], ['Ideas', c.ideas], ['Miembros', c.guests]].map(([l, v]) => (
              <div key={l as string} style={{ background: '#fafafa', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{l}</span><span style={{ fontSize: 20, fontWeight: 600 }}>{v}</span></div>
            ))}
          </div>
          {!c.activated && c.activation_token && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <CopyLink label="Link de activación (pendiente)" url={activationLink(c.activation_token)} />
              <a style={{ fontSize: 14 }} onClick={async () => { const r = await adminSendActivation(c.account_id, true); if (r.ok) { toast.ok((c.invite === 'sent' ? 'Acceso reenviado a ' : 'Acceso enviado a ') + c.email); load(); reload(); } else toast.err(new Error(r.error)); }}>{c.invite === 'sent' ? 'Reenviar acceso por email' : 'Enviar acceso por email'}</a>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Cuenta</span>
            <Rows rows={[
              { l: 'Nombre', v: c.name }, { l: 'Email', v: c.email }, { l: 'Método de acceso', v: c.login }, { l: 'Alta', v: ddmmyyyy(c.created_at) },
              { l: 'Última actividad', v: rel(c.last_activity_at) }, { l: 'Estado', v: c.status === 'active' ? 'Activa' : 'Suspendida', fg: c.status === 'active' ? '#389e0d' : '#cf1322' },
            ]} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Suscripción</span>
            <Rows rows={[
              { l: 'Plan', v: c.plan, fg: planTone(c.plan).fg },
              { l: 'Inicio', v: ddmmyyyy(c.plan !== 'Free' ? c.pro_since || c.created_at : c.free_since || c.created_at) },
              { l: 'Precio', v: c.plan === 'Enterprise' ? 'A medida · facturado fuera de la plataforma' : c.plan === 'Pro' ? money(c.currency, Number(c.amount)) + ' / mes' + (c.deal_type ? (c.deal_type === 'fixed' ? ' · Precio exclusivo' : ' · −' + c.deal_value + '%') + (c.deal_until ? ' hasta ' + ddmmyyyy(c.deal_until) : ' sin vencimiento') : '') : 'Sin costo', fg: c.deal_type ? '#d46b08' : undefined },
              ...(c.plan === 'Pro' ? [{ l: 'Medio de pago', v: PROVIDER_L[c.provider || ''] || '—' }, { l: c.cancel_at_period_end ? 'Pro hasta' : 'Próximo cobro', v: c.current_period_end ? dlong(c.current_period_end) : '—' }] : []),
              ...(c.cancel ? [{ l: 'Motivo de la baja', v: ({ precio: 'Caro para lo que lo usa', poco_uso: 'No lo usa lo suficiente', falta_funcion: 'Le falta una función', otra_herramienta: 'Se pasa a otra herramienta', temporal: 'Por un tiempo, después vuelve', otro: 'Otro' } as Record<string, string>)[c.cancel.reason || ''] || 'No lo indicó' },
                ...(c.cancel.note ? [{ l: 'Comentario', v: c.cancel.note }] : []),
                { l: 'Canceló el', v: ddmmyyyy(c.cancel.at) }] : []),
              { l: 'Facturado a la fecha', v: [c.billed ? 'USD ' + fmtPrice(Number(c.billed)) : '', c.billed_ars ? 'ARS ' + fmtPrice(Number(c.billed_ars)) : ''].filter(Boolean).join(' · ') || '—' },
              { l: 'Riesgo de churn', v: risk, fg: risk === 'Alto' ? '#cf1322' : risk === 'Medio' ? '#d48806' : undefined },
            ]} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Buzones · {c.board_list.length}</span>
            {c.board_list.map((b) => (
              <div key={b.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <a onClick={() => openBoard(b.id)} style={{ fontWeight: 600 }}>{b.name}</a>
                  <Tag>{VIS_L[b.visibility] || b.visibility}</Tag>
                  <Tag tone={b.status === 'active' ? OK : BAD}>{b.status === 'active' ? 'Activo' : 'Suspendido'}</Tag>
                </div>
                <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>/app/b/{b.slug}</span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
                  <span>{b.ideas} ideas</span><span>{b.visibility === 'private' ? 'Solo Equipo' : b.guests + ' miembros'}</span><span>Equipo: {b.team_name}</span><span>Creado {ddmmyyyy(b.created_at)}</span><span>Actividad {rel(b.last_activity_at)}</span>
                </div>
              </div>
            ))}
          </div>
          {c.payments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Pagos</span>
              <Rows rows={c.payments.map((p) => ({ l: (p.paid_at ? ddmmyyyy(p.paid_at) : '—') + ' · ' + (PROVIDER_L[p.provider] || p.provider), v: money(p.currency as 'USD', Number(p.amount)) + ' · ' + ({ completed: 'Cobrado', failed: 'Fallido', refunded: 'Reembolsado', pending: 'Pendiente' } as Record<string, string>)[p.status] + (p.status === 'completed' && Number(p.refunded_amount) > 0 ? ' · reembolso parcial de ' + money(p.currency as 'USD', Number(p.refunded_amount)) : ''), fg: p.status === 'failed' ? '#cf1322' : undefined }))} />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

// ───────────────────────── Detalle del buzón ─────────────────────────
type BoardDet = { board_id: string; name: string; slug: string; visibility: string; status: string; created_at: string; last_activity_at: string; ideas: number; votes: number; comments: number; guests_count: number; guests: { user_id: string; name: string; email: string; joined_at: string }[]; account: Client };

export function AdminBoardDrawer({ boardId, onClose, onChanged, openClient }: { boardId: string; onClose: () => void; onChanged: () => void; openClient: (id: string) => void }) {
  const toast = useToast();
  const { isMobile } = useGridCols();
  const [b, setB] = useState<BoardDet | null>(null);
  const load = () => rpc<BoardDet>('admin_board_detail', { p_board: boardId }).then(setB).catch((e) => toast.err(e));
  useEffect(() => { load(); }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = b?.account;

  return (
    <Drawer open placement="right" onClose={onClose} closable={false} width={isMobile ? '100%' : 480} styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
        <a onClick={onClose} style={{ color: 'rgba(0,0,0,0.45)', fontSize: 20, lineHeight: 1 }}>×</a>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Detalle del buzón</span>
        {b && <a href={'/app/b/' + b.slug} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>Ver buzón</a>}
      </div>
      {b && a && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Tag tone={planTone(a.plan)}>{a.plan}</Tag>
              <Tag tone={b.status === 'active' ? OK : BAD}>{b.status === 'active' ? 'Activo' : 'Suspendido'}</Tag>
              <Tag>{VIS_L[b.visibility] || b.visibility}</Tag>
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{b.name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{displayUrl(b.slug)}</span>
              <a onClick={() => { navigator.clipboard?.writeText(boardUrl(b.slug)).catch(() => {}); toast.ok('Link del buzón copiado'); }}>Copiar</a>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
            {[['Ideas', b.ideas], ['Miembros', b.guests_count], ['Votos', b.votes], ['Comentarios', b.comments]].map(([l, v]) => (
              <div key={l as string} style={{ background: '#fafafa', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{l}</span><span style={{ fontSize: 20, fontWeight: 600 }}>{Number(v).toLocaleString('es-AR')}</span></div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Dueño</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={a.name} id={a.owner_id} />
              <div style={{ display: 'flex', flexDirection: 'column' }}><a onClick={() => openClient(a.account_id)}>{a.name}</a><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{a.email}</span></div>
            </div>
            <Rows rows={[{ l: 'Rol', v: 'Admin (dueño)' }, { l: 'Método de acceso', v: a.login }, { l: 'Cuenta creada', v: dlong(a.created_at) }, { l: 'Buzones de la cuenta', v: String(a.boards) }, { l: 'Última actividad', v: rel(a.last_activity_at) }]} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Miembros de la Comunidad · {b.guests_count}</span>
            {b.guests.map((m) => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={m.name} id={m.user_id} size={28} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 14 }}>{m.name}</span><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{m.email}</span></div>
                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{rel(m.joined_at)}</span>
              </div>
            ))}
            {b.guests_count > b.guests.length && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>y {b.guests_count - b.guests.length} miembros más</span>}
            {b.guests_count === 0 && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>El buzón todavía no tiene miembros de la Comunidad.</span>}
          </div>
          <button type="button" className={b.status === 'active' ? 'bx-btn-danger' : 'bx-btn'} style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              try { await rpc('admin_set_board_status', { p_board: b.board_id, p_status: b.status === 'active' ? 'suspended' : 'active' }); toast.ok(b.status === 'active' ? 'Buzón suspendido · queda en solo lectura' : 'Buzón reactivado'); load(); onChanged(); }
              catch (e) { toast.err(e); }
            }}>{b.status === 'active' ? 'Suspender buzón' : 'Reactivar buzón'}</button>
        </div>
      )}
    </Drawer>
  );
}
