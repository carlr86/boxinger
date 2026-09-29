'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Modal, Popconfirm } from 'antd';
import { useSession, useToast } from '@/components/Providers';
import { Avatar, Note, PageHead, Seg, Tag } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { rpc } from '@/lib/rpc';
import { dlong, money } from '@/lib/format';
import { ENTERPRISE_TAG } from '@/lib/constants';
import ContactForm from '@/components/ContactForm';
import { authError } from '@/lib/auth-errors';
import { deleteMyAccount } from './actions';

type Tab = 'datos' | 'notif' | 'sub';
const card: React.CSSProperties = { background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 };

export function Profile() {
  const sp = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((['datos', 'notif', 'sub'].includes(sp.get('tab') || '') ? sp.get('tab') : 'datos') as Tab);
  useEffect(() => { const t = sp.get('tab'); if (t && ['datos', 'notif', 'sub'].includes(t)) setTab(t as Tab); }, [sp]);
  const change = (t: Tab) => { setTab(t); router.replace('/app/perfil' + (t === 'datos' ? '' : '?tab=' + t)); };
  return (
    <>
      <PageHead title="Mi perfil" sub="Tus datos, notificaciones y suscripción." />
      <Seg options={[['datos', 'Datos personales'], ['notif', 'Notificaciones'], ['sub', 'Suscripción']]} value={tab} onChange={change} />
      {tab === 'datos' && <Datos />}
      {tab === 'notif' && <Notifs />}
      {tab === 'sub' && <Subscription />}
    </>
  );
}

function Datos() {
  const toast = useToast();
  const router = useRouter();
  const { ctx, refresh, setCtx } = useSession();
  const me = ctx!.me;
  const [name, setName] = useState(me.name);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const isG = me.providers.includes('google');
  const hasPass = me.providers.includes('email');
  const isOwner = ctx!.teams.some((t) => t.own);
  const nameErr = tried && !name.trim() ? 'Ingresá tu nombre' : '';

  async function photo(file: File) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return toast.err(new Error('Elegí una imagen PNG o JPG'));
    if (file.size > 2 * 1024 * 1024) return toast.err(new Error('La imagen puede pesar hasta 2 MB'));
    setBusy(true);
    const sb = supabaseBrowser();
    const path = `avatars/${me.id}/avatar-${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
    const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type });
    if (error) { setBusy(false); return toast.err(new Error('No pudimos subir la imagen: ' + error.message)); }
    const url = sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    try { await rpc('update_profile', { p_name: me.name, p_avatar_url: url }); await refresh(); toast.ok('Foto actualizada'); } catch (e) { toast.err(e); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16, alignItems: 'start' }}>
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Datos personales</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name={name || me.name} id={me.id} url={me.avatar_url} size={64} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 14, color: '#059669', cursor: 'pointer' }}>
              Cambiar foto
              <input type="file" hidden accept="image/png,image/jpeg" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) photo(f); e.target.value = ''; }} />
            </label>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>PNG o JPG, hasta 2 MB</span>
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Nombre
          <input className={'bx-input' + (nameErr ? ' err' : '')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <span style={{ fontSize: 12, color: '#ff4d4f' }}>{nameErr}</span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Email
          <input className="bx-input" value={me.email} disabled style={{ background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.45)' }} />
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{isG ? 'Vinculado a tu cuenta de Google.' : 'Para cambiar el email escribinos a soporte.'}</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>Acceso
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {hasPass && <span style={methodTag}>Email y contraseña</span>}
            {isG && <span style={methodTag}>Google</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="bx-btn-primary" onClick={async () => {
            setTried(true);
            if (!name.trim()) return;
            try { await rpc('update_profile', { p_name: name }); await refresh(); toast.ok('Perfil actualizado'); } catch (e) { toast.err(e); }
          }}>Guardar cambios</button>
          <button type="button" className="bx-btn" onClick={async () => {
            const { error } = await supabaseBrowser().auth.resetPasswordForEmail(me.email, { redirectTo: `${location.origin}/app/auth/callback?next=/app/nueva-contrasena` });
            if (error) toast.err(new Error(authError(error.message))); else toast.ok('Te enviamos un link a ' + me.email + ' (válido 1 hora)');
          }}>{hasPass ? 'Cambiar contraseña' : 'Crear contraseña'}</button>
        </div>
      </div>
      <div style={{ ...card, gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Borrar cuenta</div>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>
          {isOwner
            ? 'Se borran tu cuenta, tus equipos y tus buzones con todas sus ideas, votos y comentarios. Si tenés Pro, se cancela la suscripción.'
            : 'Se borra tu cuenta. Tus ideas y comentarios quedan como de un usuario eliminado.'}
        </span>
        {del ? (
          <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <span>¿Seguro? Esta acción no se puede deshacer.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={busy} style={{ height: 28, padding: '0 12px', borderRadius: 6, border: 0, background: '#ff4d4f', color: '#fff', fontSize: 13, cursor: 'pointer' }}
                onClick={async () => {
                  setBusy(true);
                  const r = await deleteMyAccount();
                  if (r.error) { setBusy(false); return toast.err(new Error(r.error)); }
                  await supabaseBrowser().auth.signOut().catch(() => {});
                  setCtx(null);
                  toast.ok('Tu cuenta se borró');
                  router.replace('/');
                }}>Sí, borrar</button>
              <button type="button" className="bx-btn" style={{ height: 28, fontSize: 13 }} onClick={() => setDel(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button type="button" className="bx-btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => setDel(true)}>Borrar mi cuenta</button>
        )}
      </div>
    </div>
  );
}
const methodTag: React.CSSProperties = { fontSize: 12, lineHeight: '22px', padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fafafa' };

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{ flex: 'none', position: 'relative', width: 44, height: 22, borderRadius: 11, border: 0, cursor: 'pointer', background: on ? '#059669' : 'rgba(0,0,0,0.25)', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 24 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,35,11,0.2)', transition: 'left .2s' }} />
    </button>
  );
}
export { Switch };

function Notifs() {
  const toast = useToast();
  const { ctx, refresh } = useSession();
  const [n, setN] = useState(ctx!.me.notif);
  const isTeam = ctx!.teams.length > 0;
  const rows: [string, string, string][] = [
    ['comments', 'Nuevos comentarios en mis ideas', 'Cuando alguien comenta una idea que cargaste.'],
    ['replies', 'Respuestas del Equipo', 'Cuando el Equipo responde uno de tus comentarios.'],
    ['status', 'Cambios de estado', 'Cuando una idea tuya pasa a En revisión, Aprobada o Rechazada, o se lanza una que votaste.'],
  ];
  if (isTeam) rows.push(['digest', 'Resumen diario del buzón', 'Un email por día con los comentarios nuevos en todas las ideas.']);
  const toggle = async (k: string) => {
    const next = { ...n, [k]: !n[k] };
    setN(next);
    try { await rpc('update_notifications', { p_notif: { [k]: next[k] } }); refresh(); } catch (e) { setN(n); toast.err(e); }
  };
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: '8px 24px', maxWidth: 640 }}>
      {rows.map(([k, l, d]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14 }}>{l}</span>
            <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{d}</span>
          </div>
          <Switch on={n[k] !== false} onClick={() => toggle(k)} />
        </div>
      ))}
      <p style={{ margin: '12px 0 8px', fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Todas las notificaciones se envían por email.</p>
    </div>
  );
}

const FREE_ITEMS = ['1 equipo con 1 buzón', 'Solo vos, sin miembros', 'Ideas ilimitadas', 'Votos y comentarios', 'Ranking y Backlog'];
const ENTERPRISE_ITEMS = ['Todo lo de Pro', 'Miembros ilimitados por equipo', 'Funciones con IA (próximamente)', 'Alta y facturación a medida'];
const PRO_ITEMS = ['Todo lo de Free', 'Equipos ilimitados', 'Buzones ilimitados por equipo', 'Hasta 4 miembros por equipo', 'Acceso por buzón para cada miembro', 'Buzones privados', 'Matriz de esfuerzo e impacto', 'Roadmap de las ideas', 'Status de las ideas'];
const PROVIDER_L: Record<string, string> = { paypal: 'PayPal', mercadopago: 'Mercado Pago', manual: 'Asignado por Boxinger' };

function Subscription() {
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const { ctx, refresh } = useSession();
  const [pick, setPick] = useState(false);
  const [contact, setContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const acc = ctx!.account;
  const s = acc?.subscription;
  const plan = acc?.plan || 'free';
  const isEnt = plan === 'enterprise';
  const isPro = plan === 'pro';
  const prices = ctx!.prices;
  const checkout = sp.get('checkout');

  useEffect(() => {
    if (checkout === 'ok') { toast.ok('¡Gracias! Estamos confirmando tu pago. Pro se activa en unos segundos.'); const t = setTimeout(refresh, 4000); return () => clearTimeout(t); }
    if (checkout === 'cancel') toast.info('No se completó el pago. Podés intentarlo de nuevo cuando quieras.');
  }, [checkout]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(provider: 'paypal' | 'mercadopago') {
    setBusy(true);
    try {
      const r = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No pudimos iniciar el pago.');
      window.location.href = j.url;
    } catch (e) { toast.err(e); setBusy(false); }
  }
  async function cancel() {
    setBusy(true);
    try {
      const r = await fetch('/api/billing/cancel', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No pudimos cancelar la suscripción.');
      await refresh();
      toast.ok('Suscripción cancelada. Pro sigue activo hasta el fin del período pagado.');
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }

  const priceL = isEnt ? 'A medida' : !isPro || !s ? 'Sin costo' : money(s.currency, Number(s.effective_amount)) + ' / mes';
  const since = (isPro || isEnt) && s?.pro_since ? s.pro_since : s?.free_since || ctx!.me.created_at;
  const box = (on: boolean): React.CSSProperties => ({ background: '#fff', borderRadius: 8, border: on ? '2px solid #059669' : '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 });
  const mine = <span style={{ fontSize: 12, lineHeight: '20px', padding: '0 7px', borderRadius: 4, border: '1px solid #a9cbc2', background: '#d1fae5', color: '#059669' }}>Tu plan</span>;

  return (
    <>
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: '20px 24px', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
        <KV l="Plan actual" v={<span style={{ fontSize: 20, fontWeight: 600 }}>{isEnt ? 'Enterprise' : isPro ? 'Pro' : 'Free'}</span>} />
        <KV l="Desde" v={dlong(since)} />
        <KV l="Estado" v={
          s?.status === 'past_due' ? <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>Pago pendiente</Tag>
            : s?.cancel_at_period_end && isPro ? <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>Se cancela</Tag>
            : <Tag tone={{ l: '', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' }}>Activa</Tag>} />
        <KV l="Precio" v={priceL} />
        {isPro && s?.provider && <KV l="Medio de pago" v={PROVIDER_L[s.provider]} />}
        {isPro && s?.current_period_end && <KV l={s.cancel_at_period_end ? 'Pro hasta' : 'Próxima renovación'} v={dlong(s.current_period_end)} />}
      </div>
      {isPro && s?.deal_type && (
        <Note tone="success">Tenés un precio especial{s.deal_until ? ' hasta el ' + dlong(s.deal_until) : ''}. Después vuelve al precio de lista.</Note>
      )}
      {s?.status === 'past_due' && <Note tone="warn">No pudimos cobrar tu último pago. Revisá tu medio de pago en {PROVIDER_L[s.provider || ''] || 'tu proveedor'} para no perder Pro.</Note>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 16, maxWidth: 1080 }}>
        <div style={box(plan === 'free')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 18, fontWeight: 600 }}>Free</span>{plan === 'free' && mine}</div>
          <div><span style={{ fontSize: 28, fontWeight: 600 }}>USD 0</span><span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}> / mes</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: 'rgba(0,0,0,0.78)' }}>{FREE_ITEMS.map((x) => <span key={x}>{x}</span>)}</div>
        </div>
        <div style={box(isPro)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 18, fontWeight: 600 }}>Pro</span>{isPro && mine}</div>
          <div>
            <span style={{ fontSize: 28, fontWeight: 600 }}>{money('USD', Number(prices.USD))}</span><span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}> / mes</span>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>En Argentina: {money('ARS', Number(prices.ARS))} / mes con Mercado Pago</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: 'rgba(0,0,0,0.78)' }}>{PRO_ITEMS.map((x) => <span key={x}>{x}</span>)}</div>
          {plan === 'free' && (acc
            ? <button type="button" className="bx-btn-primary" style={{ height: 36 }} onClick={() => setPick(true)}>Pasar a Pro</button>
            : <><button type="button" className="bx-btn-primary" style={{ height: 36 }} onClick={() => router.push('/app/onboarding')}>Crear mi buzón</button>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Para pasar a Pro primero creá tu equipo y tu buzón.</span></>)}
          {isPro && s && (s.provider === 'paypal' || s.provider === 'mercadopago') && !s.cancel_at_period_end && (
            <Popconfirm title="¿Cancelar la suscripción Pro?" description="Seguís con Pro hasta el fin del período pagado. Después tu cuenta pasa a Free." okText="Cancelar suscripción" cancelText="Volver" okButtonProps={{ danger: true }} onConfirm={cancel}>
              <button type="button" className="bx-btn" disabled={busy}>Cancelar suscripción</button>
            </Popconfirm>
          )}
          {isPro && s?.provider === 'manual' && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Tu plan Pro lo gestiona el equipo de Boxinger. Para cambios escribinos a hola@boxinger.com.</span>}
        </div>
        <div style={{ ...box(isEnt), border: isEnt ? '2px solid #4338ca' : '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>Enterprise</span>
            {isEnt ? <span style={{ fontSize: 12, lineHeight: '20px', padding: '0 7px', borderRadius: 4, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca' }}>Tu plan</span> : <Tag tone={ENTERPRISE_TAG}>Exclusivo</Tag>}
          </div>
          <div><span style={{ fontSize: 28, fontWeight: 600 }}>A medida</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: 'rgba(0,0,0,0.78)' }}>{ENTERPRISE_ITEMS.map((x) => <span key={x}>{x}</span>)}</div>
          {isEnt
            ? <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Tu plan lo gestiona el equipo de Boxinger. Para cambios escribinos a hola@boxinger.com.</span>
            : <button type="button" className="bx-btn" style={{ height: 36, borderColor: '#4338ca', color: '#4338ca' }} onClick={() => setContact(true)}>Contactanos</button>}
        </div>
      </div>

      <Modal open={contact} onCancel={() => setContact(false)} footer={null} title="Consultar por Enterprise" width={560} destroyOnHidden>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>Contanos sobre tu equipo y te escribimos con una propuesta a medida.</span>
          <ContactForm topic="enterprise" name={ctx!.me.name} email={ctx!.me.email} />
        </div>
      </Modal>

      <Modal open={pick} onCancel={() => setPick(false)} footer={null} title="Pasar a Pro" width={460} destroyOnHidden>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>Elegí cómo pagar. La suscripción se renueva cada mes y la podés cancelar cuando quieras.</span>
          <PayOption title="PayPal" sub="Tarjeta o saldo PayPal · cualquier país" price={money('USD', Number(prices.USD)) + ' / mes'} disabled={busy} onClick={() => start('paypal')} />
          <PayOption title="Mercado Pago" sub="Tarjetas argentinas · se cobra en pesos" price={money('ARS', Number(prices.ARS)) + ' / mes'} disabled={busy} onClick={() => start('mercadopago')} />
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Te llevamos al sitio del medio de pago para confirmar. Al volver, Pro se activa automáticamente.</span>
        </div>
      </Modal>
    </>
  );
}

function PayOption({ title, sub, price, onClick, disabled }: { title: string; sub: string; price: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="bx-btn"
      style={{ height: 'auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', whiteSpace: 'normal' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{sub}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{price}</span>
    </button>
  );
}

function KV({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{l}</span>
      <span style={{ fontSize: 14, alignSelf: 'flex-start' }}>{v}</span>
    </div>
  );
}
