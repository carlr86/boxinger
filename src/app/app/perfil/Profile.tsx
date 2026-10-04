'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Modal } from 'antd';
import { useSession, useToast } from '@/components/Providers';
import { Avatar, Note, PageHead, Seg, Tag } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { rpc } from '@/lib/rpc';
import { isEmail } from '@/lib/format';
import { useI18n } from '@/lib/i18n/client';
import { I18N_LIVE } from '@/lib/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { CREEM_ENABLED, ENTERPRISE_TAG, PAYPAL_ENABLED } from '@/lib/constants';
import ContactForm from '@/components/ContactForm';
import { authError } from '@/lib/auth-errors';
import { deleteMyAccount } from './actions';
import { CancelModal } from './CancelModal';
import { FreeBoardSelect } from '@/components/FreeBoardSelect';

type Tab = 'datos' | 'notif' | 'sub';
const card: React.CSSProperties = { background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 };

export function Profile() {
  const sp = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const { ctx } = useSession();
  const [tab, setTab] = useState<Tab>((['datos', 'notif', 'sub'].includes(sp.get('tab') || '') ? sp.get('tab') : 'datos') as Tab);
  useEffect(() => { const q = sp.get('tab'); if (q && ['datos', 'notif', 'sub'].includes(q)) setTab(q as Tab); }, [sp]);
  const change = (k: Tab) => { setTab(k); router.replace('/app/perfil' + (k === 'datos' ? '' : '?tab=' + k)); };
  // Signing out (or deleting the account) clears the session before the navigation lands.
  if (!ctx) return null;
  return (
    <>
      <PageHead title={t('Mi perfil')} sub={t('Tus datos, notificaciones y suscripción.')} />
      <Seg options={[['datos', t('Datos personales')], ['notif', t('Notificaciones')], ['sub', t('Suscripción')]]} value={tab} onChange={change} />
      {tab === 'datos' && <Datos />}
      {tab === 'notif' && <Notifs />}
      {tab === 'sub' && <Subscription />}
    </>
  );
}

function Datos() {
  const toast = useToast();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { ctx, refresh, setCtx } = useSession();
  const me = ctx!.me;
  const [name, setName] = useState(me.name);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const isG = me.providers.includes('google');
  const hasPass = me.providers.includes('email');
  const isOwner = ctx!.teams.some((x) => x.own);
  const nameErr = tried && !name.trim() ? t('Ingresá tu nombre') : '';

  async function photo(file: File) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return toast.err(new Error(t('Elegí una imagen PNG o JPG')));
    if (file.size > 2 * 1024 * 1024) return toast.err(new Error(t('La imagen puede pesar hasta 2 MB')));
    setBusy(true);
    const sb = supabaseBrowser();
    const path = `avatars/${me.id}/avatar-${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
    const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type });
    if (error) { setBusy(false); return toast.err(new Error(t('No pudimos subir la imagen: {error}', { error: error.message }))); }
    const url = sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    try { await rpc('update_profile', { p_name: me.name, p_avatar_url: url }); await refresh(); toast.ok('Foto actualizada'); } catch (e) { toast.err(e); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16, alignItems: 'start' }}>
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{t('Datos personales')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name={name || me.name} id={me.id} url={me.avatar_url} size={64} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 14, color: '#059669', cursor: 'pointer' }}>
              {t('Cambiar foto')}
              <input type="file" hidden accept="image/png,image/jpeg" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) photo(f); e.target.value = ''; }} />
            </label>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('PNG o JPG, hasta 2 MB')}</span>
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('Nombre')}
          <input className={'bx-input' + (nameErr ? ' err' : '')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <span style={{ fontSize: 12, color: '#ff4d4f' }}>{nameErr}</span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('Email')}
          <input className="bx-input" value={me.email} disabled style={{ background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.45)' }} />
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{isG ? t('Vinculado a tu cuenta de Google.') : t('Para cambiar el email escribinos a soporte.')}</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('Acceso')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {hasPass && <span style={methodTag}>{t('Email y contraseña')}</span>}
            {isG && <span style={methodTag}>Google</span>}
          </div>
        </div>
        {(I18N_LIVE || me.is_super_admin || locale === 'en') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('Idioma')}
            <LanguageSwitch preview style={{ alignSelf: 'flex-start' }} />
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('También cambia el idioma de los emails que te enviamos.')}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="bx-btn-primary" onClick={async () => {
            setTried(true);
            if (!name.trim()) return;
            try { await rpc('update_profile', { p_name: name }); await refresh(); toast.ok('Perfil actualizado'); } catch (e) { toast.err(e); }
          }}>{t('Guardar cambios')}</button>
          <button type="button" className="bx-btn" onClick={async () => {
            const { error } = await supabaseBrowser().auth.resetPasswordForEmail(me.email, { redirectTo: `${location.origin}/app/auth/callback?next=/app/nueva-contrasena` });
            if (error) toast.err(new Error(authError(error.message))); else toast.ok(t('Te enviamos un link a {email} (válido 1 hora)', { email: me.email }));
          }}>{hasPass ? t('Cambiar contraseña') : t('Crear contraseña')}</button>
        </div>
      </div>
      <div style={{ ...card, gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{t('Borrar cuenta')}</div>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>
          {isOwner
            ? t('Se borran tu cuenta, tus equipos y tus buzones con todas sus ideas, votos y comentarios. Si tenés Pro, se cancela la suscripción.')
            : t('Se borra tu cuenta. Tus ideas y comentarios quedan como de un usuario eliminado.')}
        </span>
        {del ? (
          <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <span>{t('¿Seguro? Esta acción no se puede deshacer.')}</span>
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
                }}>{t('Sí, borrar')}</button>
              <button type="button" className="bx-btn" style={{ height: 28, fontSize: 13 }} onClick={() => setDel(false)}>{t('Cancelar')}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="bx-btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => setDel(true)}>{t('Borrar mi cuenta')}</button>
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
  const { t } = useI18n();
  const { ctx, refresh } = useSession();
  const [n, setN] = useState(ctx!.me.notif);
  const isTeam = ctx!.teams.length > 0;
  const rows: [string, string, string][] = [
    ['comments', 'Nuevos comentarios en mis ideas', 'Cuando alguien comenta una idea que cargaste.'],
    ['replies', 'Respuestas del Equipo', 'Cuando el Equipo responde uno de tus comentarios.'],
    ['status', 'Cambios de estado', 'Cuando una idea tuya pasa a En revisión, Aprobada o Rechazada, o se lanza una que votaste.'],
  ];
  if (isTeam) rows.push(['digest', 'Resumen diario del buzón', 'Un email por día con los comentarios nuevos en todas las ideas.']);
  if (ctx!.teams.some((x) => x.is_admin || x.can_create_boards)) rows.push(['requests', 'Solicitudes de acceso a mis buzones', 'Cuando alguien pide sumarse como invitado a un buzón que administrás.']);
  const toggle = async (k: string) => {
    const next = { ...n, [k]: n[k] === false };
    setN(next);
    try { await rpc('update_notifications', { p_notif: { [k]: next[k] } }); refresh(); } catch (e) { setN(n); toast.err(e); }
  };
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: '8px 24px', maxWidth: 640 }}>
      {rows.map(([k, l, d]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14 }}>{t(l)}</span>
            <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t(d)}</span>
          </div>
          <Switch on={n[k] !== false} onClick={() => toggle(k)} />
        </div>
      ))}
      <p style={{ margin: '12px 0 8px', fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Todas las notificaciones se envían por email.')}</p>
    </div>
  );
}

const FREE_ITEMS = ['1 equipo con 1 buzón', 'Solo vos, sin miembros', 'Buzón solo para invitados o público', 'Ideas ilimitadas', 'Votos y comentarios', 'Ranking y Backlog'];
const ENTERPRISE_ITEMS = ['Todo lo de Pro', 'Miembros ilimitados por equipo', 'Funciones con IA (próximamente)', 'Alta y facturación a medida'];
const PRO_ITEMS = ['Todo lo de Free', 'Equipos ilimitados', 'Buzones ilimitados por equipo', 'Hasta 4 miembros por equipo', 'Acceso por buzón para cada miembro', 'Buzones privados', 'Acceso por dominio de email', 'Matriz de esfuerzo e impacto', 'Roadmap de las ideas', 'Status de las ideas'];
const PROVIDER_L: Record<string, string> = { paypal: 'PayPal', mercadopago: 'Mercado Pago', creem: 'Tarjeta internacional (Creem)', manual: 'Asignado por Boxinger' };

function Subscription() {
  const toast = useToast();
  const { t, dlong, money } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const { ctx, refresh } = useSession();
  const [pick, setPick] = useState(false);
  const [contact, setContact] = useState(false);
  const [mpEmail, setMpEmail] = useState(ctx!.me.email);
  const [mpOpen, setMpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // The provider being opened: the checkout takes a few seconds to answer, so the modal shows it and locks.
  type Provider = 'paypal' | 'mercadopago' | 'creem';
  const [going, setGoing] = useState<Provider | null>(null);
  const goingRef = useRef(false);
  const closePick = () => { if (goingRef.current) return; setPick(false); setMpOpen(false); };
  const acc = ctx!.account;
  const s = acc?.subscription;
  const plan = acc?.plan || 'free';
  const isEnt = plan === 'enterprise';
  const isPro = plan === 'pro';
  const prices = ctx!.prices;
  const checkout = sp.get('checkout');

  useEffect(() => {
    if (checkout === 'ok') {
      // The provider confirms by webhook: check back a few times until Pro shows up.
      toast.ok('¡Gracias! Estamos confirmando tu pago. Pro se activa en unos segundos.');
      const ts = [3000, 8000, 15000, 30000].map((ms) => setTimeout(refresh, ms));
      return () => ts.forEach(clearTimeout);
    }
    if (checkout === 'cancel') toast.info('No se completó el pago. Podés intentarlo de nuevo cuando quieras.');
  }, [checkout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back from the checkout with the browser's Back button restores this page as it was: unlock it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { goingRef.current = false; setGoing(null); setBusy(false); } };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  async function start(provider: Provider) {
    if (goingRef.current) return;
    goingRef.current = true;
    setGoing(provider);
    setBusy(true);
    try {
      const r = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, payer_email: provider === 'mercadopago' ? mpEmail.trim() : undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t('No pudimos iniciar el pago.'));
      window.location.href = j.url;
    } catch (e) { toast.err(e); goingRef.current = false; setGoing(null); setBusy(false); }
  }
  const [cancelOpen, setCancelOpen] = useState(false);
  // Cancelled but still paid for: Mercado Pago comes back with a new subscription that charges from that date.
  const paidUntil = isPro && s?.cancel_at_period_end && s.current_period_end ? s.current_period_end : null;
  async function resume() {
    setBusy(true);
    try {
      const r = await fetch('/api/billing/resume', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t('No pudimos reactivar la suscripción.'));
      if (j.checkout) { setBusy(false); setPick(true); setMpOpen(true); return; }
      await refresh();
      toast.ok('¡Volviste a Pro! Tu suscripción sigue como antes.');
    } catch (e) { toast.err(e); }
    setBusy(false);
  }
  async function cancel(reason: string | null = null, note = '') {
    setBusy(true);
    try {
      const r = await fetch('/api/billing/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason, note }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t('No pudimos cancelar la suscripción.'));
      await refresh();
      setCancelOpen(false);
      toast.ok('Suscripción cancelada. Pro sigue activo hasta el fin del período pagado.');
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }

  const perMonth = ' / ' + t('mes');
  const priceL = isEnt ? t('A medida') : !isPro || !s ? t('Sin costo') : money(s.currency, Number(s.effective_amount)) + perMonth;
  const since = (isPro || isEnt) && s?.pro_since ? s.pro_since : s?.free_since || ctx!.me.created_at;
  const box = (on: boolean): React.CSSProperties => ({ background: '#fff', borderRadius: 8, border: on ? '2px solid #059669' : '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 });
  const mine = <span style={{ fontSize: 12, lineHeight: '20px', padding: '0 7px', borderRadius: 4, border: '1px solid #a9cbc2', background: '#d1fae5', color: '#059669' }}>{t('Tu plan')}</span>;

  return (
    <>
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: '20px 24px', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
        <KV l={t('Plan actual')} v={<span style={{ fontSize: 20, fontWeight: 600 }}>{isEnt ? 'Enterprise' : isPro ? 'Pro' : 'Free'}</span>} />
        <KV l={t('Desde')} v={dlong(since)} />
        <KV l={t('Estado')} v={
          s?.status === 'past_due' ? <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>{t('Pago pendiente')}</Tag>
            : s?.cancel_at_period_end && isPro ? <Tag tone={{ l: '', bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806' }}>{t('Se cancela')}</Tag>
            : <Tag tone={{ l: '', bg: '#f6ffed', bd: '#b7eb8f', fg: '#389e0d' }}>{t('Activa')}</Tag>} />
        <KV l={t('Precio')} v={priceL} />
        {isPro && s?.provider && <KV l={t('Medio de pago')} v={t(PROVIDER_L[s.provider])} />}
        {isPro && s?.current_period_end && <KV l={s.cancel_at_period_end ? t('Pro hasta') : t('Próxima renovación')} v={dlong(s.current_period_end)} />}
      </div>
      {isPro && s?.cancel_at_period_end && (
        <Note tone="warn">
          {s.current_period_end
            ? t('Cancelaste tu suscripción: no se hacen más cobros. Seguís con Pro hasta el {date} y después tu cuenta pasa a Free.', { date: dlong(s.current_period_end) })
            : t('Cancelaste tu suscripción: no se hacen más cobros. Seguís con Pro hasta el fin del período pagado y después tu cuenta pasa a Free.')}
          <FreeBoardSelect style={{ display: 'flex', marginTop: 8, fontSize: 13 }} />
        </Note>
      )}
      {isPro && s?.deal_type && (
        <Note tone="success">{s.deal_until ? t('Tenés un precio especial hasta el {date}. Después vuelve al precio de lista.', { date: dlong(s.deal_until) }) : t('Tenés un precio especial. Después vuelve al precio de lista.')}</Note>
      )}
      {s?.status === 'past_due' && <Note tone="warn">{t('No pudimos cobrar tu último pago. Revisá tu medio de pago en {provider} para no perder Pro.', { provider: PROVIDER_L[s.provider || ''] ? t(PROVIDER_L[s.provider || '']) : t('tu proveedor') })}</Note>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 16, maxWidth: 1080 }}>
        <div style={box(plan === 'free')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 18, fontWeight: 600 }}>Free</span>{plan === 'free' && mine}</div>
          <div><span style={{ fontSize: 28, fontWeight: 600 }}>USD 0</span><span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{perMonth}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: 'rgba(0,0,0,0.78)' }}>{FREE_ITEMS.map((x) => <span key={x}>{t(x)}</span>)}</div>
        </div>
        <div style={box(isPro)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 18, fontWeight: 600 }}>Pro</span>{isPro && mine}</div>
          <div>
            <span style={{ fontSize: 28, fontWeight: 600 }}>{money('USD', Number(prices.USD))}</span><span style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>{perMonth}</span>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>{t('En Argentina: {price} / mes con Mercado Pago', { price: money('ARS', Number(prices.ARS)) })}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: 'rgba(0,0,0,0.78)' }}>{PRO_ITEMS.map((x) => <span key={x}>{t(x)}</span>)}</div>
          {plan === 'free' && (acc
            ? <button type="button" className="bx-btn-primary" style={{ height: 36 }} onClick={() => setPick(true)}>{t('Pasar a Pro')}</button>
            : <><button type="button" className="bx-btn-primary" style={{ height: 36 }} onClick={() => router.push('/app/onboarding')}>{t('Crear mi buzón')}</button>
                <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Para pasar a Pro primero creá tu equipo y tu buzón.')}</span></>)}
          {isPro && s && ['paypal', 'mercadopago', 'creem'].includes(s.provider || '') && !s.cancel_at_period_end && (
            <button type="button" className="bx-btn" disabled={busy} onClick={() => setCancelOpen(true)}>{t('Cancelar suscripción')}</button>
          )}
          {isPro && s && ['mercadopago', 'creem'].includes(s.provider || '') && s.cancel_at_period_end && (
            <>
              <button type="button" className="bx-btn-primary" style={{ height: 36 }} disabled={busy} onClick={resume}>{t('Volver a Pro')}</button>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{s.provider === 'creem' ? t('Se reactiva tu suscripción: no se cobra nada ahora.') : t('No se cobra nada hasta que termine tu mes ya pagado.')}</span>
            </>
          )}
          {isPro && s?.provider === 'manual' && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Tu plan Pro lo gestiona el equipo de Boxinger. Para cambios escribinos a hola@boxinger.com.')}</span>}
        </div>
        <div style={{ ...box(isEnt), border: isEnt ? '2px solid #4338ca' : '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>Enterprise</span>
            {isEnt ? <span style={{ fontSize: 12, lineHeight: '20px', padding: '0 7px', borderRadius: 4, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca' }}>{t('Tu plan')}</span> : <Tag tone={ENTERPRISE_TAG}>{t('Exclusivo')}</Tag>}
          </div>
          <div><span style={{ fontSize: 28, fontWeight: 600 }}>{t('A medida')}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: 'rgba(0,0,0,0.78)' }}>{ENTERPRISE_ITEMS.map((x) => <span key={x}>{t(x)}</span>)}</div>
          {isEnt
            ? <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('Tu plan lo gestiona el equipo de Boxinger. Para cambios escribinos a hola@boxinger.com.')}</span>
            : <button type="button" className="bx-btn" style={{ height: 36, borderColor: '#4338ca', color: '#4338ca' }} onClick={() => setContact(true)}>{t('Contactanos')}</button>}
        </div>
      </div>

      <CancelModal open={cancelOpen} until={s?.current_period_end || null} onClose={() => setCancelOpen(false)} onConfirm={(r, n) => cancel(r, n)} />

      <Modal open={contact} onCancel={() => setContact(false)} footer={null} title={t('Consultar por Enterprise')} width={560} destroyOnHidden>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Contanos sobre tu equipo y te escribimos con una propuesta a medida.')}</span>
          <ContactForm topic="enterprise" name={ctx!.me.name} email={ctx!.me.email} />
        </div>
      </Modal>

      <Modal open={pick} onCancel={closePick} closable={!going} mask={{ closable: !going }} keyboard={!going} footer={null} title={t('Pasar a Pro')} width={460} destroyOnHidden>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>{t('Elegí cómo pagar. La suscripción se renueva cada mes y la podés cancelar cuando quieras.')}</span>
          {paidUntil && <Note tone="success">{t('Ya pagaste hasta el {date}: el primer cobro de la nueva suscripción es ese día.', { date: dlong(paidUntil) })}</Note>}
          {paidUntil ? null : CREEM_ENABLED
            ? <PayOption title={t('Tarjeta internacional')} sub={t('Visa, Mastercard, Amex, Apple Pay o Google Pay · cualquier país · en dólares')} price={money('USD', Number(prices.USD)) + perMonth} disabled={busy} loading={going === 'creem'} onClick={() => start('creem')} />
            : PAYPAL_ENABLED
              ? <PayOption title="PayPal" sub={t('Tarjeta o saldo PayPal · cualquier país')} price={money('USD', Number(prices.USD)) + perMonth} disabled={busy} loading={going === 'paypal'} onClick={() => start('paypal')} />
              : <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('El pago internacional vuelve pronto. Si estás fuera de Argentina, escribinos a hola@boxinger.com.')}</span>}
          <PayOption title="Mercado Pago" sub={t('Tarjetas argentinas · se cobra en pesos')} price={money('ARS', Number(prices.ARS)) + perMonth} disabled={busy} selected={mpOpen} onClick={() => setMpOpen((v) => !v)} />
          {mpOpen && (
            <form style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px 0' }}
              onSubmit={(e) => { e.preventDefault(); if (isEmail(mpEmail.trim())) start('mercadopago'); }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
                {t('Email de tu cuenta de Mercado Pago')}
                <input className="bx-input" type="email" autoFocus required value={mpEmail} onChange={(e) => setMpEmail(e.target.value)} />
                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{t('Tiene que ser el mismo con el que vas a ingresar a Mercado Pago para pagar.')}</span>
              </label>
              <button type="submit" className="bx-btn-primary" disabled={busy || !isEmail(mpEmail.trim())}
                style={{ height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...(going === 'mercadopago' ? { background: '#059669', color: '#fff', border: 0, cursor: 'wait' } : null) }}>
                {going === 'mercadopago' ? <><span className="bx-spinner" aria-hidden />{t('Abriendo Mercado Pago…')}</> : t('Continuar a Mercado Pago')}
              </button>
            </form>
          )}
          <span role="status" style={{ fontSize: 12, color: going ? '#059669' : 'rgba(0,0,0,0.45)' }}>
            {going ? t('Te estamos llevando al sitio de pago. Puede tardar unos segundos, no cierres esta ventana.') : t('Te llevamos al sitio del medio de pago para confirmar. Al volver, Pro se activa automáticamente.')}
          </span>
        </div>
      </Modal>
    </>
  );
}

function PayOption({ title, sub, price, onClick, disabled, selected, loading }: { title: string; sub: string; price: string; onClick: () => void; disabled?: boolean; selected?: boolean; loading?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={'bx-btn bx-pay' + (loading ? ' is-loading' : '')} aria-expanded={selected} aria-busy={loading}
      style={{ height: 'auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', whiteSpace: 'normal', ...(selected ? { borderColor: '#059669', boxShadow: '0 0 0 2px rgba(5,150,105,0.1)' } : null) }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{sub}</span>
      </div>
      {loading
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: '#059669', whiteSpace: 'nowrap' }}><span className="bx-spinner" aria-hidden />{t('Abriendo…')}</span>
        : <span style={{ fontSize: 14, fontWeight: 500 }}>{price}</span>}
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
