'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { getConsent, onCookieSettingsOpen, openCookieSettings, setConsent, type Consent } from '@/lib/cookie-consent';

// Cookie notice for the public pages (mounted with Clarity by src/app/(site)/layout.tsx). It shows
// until the visitor answers, and again from the footer link. «Rechazar» and «Aceptar» look the same
// on purpose: rejecting has to be as easy as accepting.
export function CookieBanner() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setOpen(true);
    return onCookieSettingsOpen(() => setOpen(true));
  }, []);

  if (!open) return null;
  const answer = (c: Consent) => { setConsent(c); setOpen(false); };
  const btn: React.CSSProperties = {
    flex: 1, height: 40, borderRadius: 8, border: '1px solid #4338ca', background: '#fff', color: '#4338ca',
    font: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  };
  return (
    <div role="dialog" aria-modal="false" aria-labelledby="bx-cookies-t"
      style={{
        position: 'fixed', zIndex: 1000, left: 16, right: 16, bottom: 16, maxWidth: 420, marginLeft: 'auto',
        background: '#fff', color: 'rgba(0,0,0,0.78)', border: '1px solid #e5e7eb', borderRadius: 12,
        boxShadow: '0 16px 40px -12px rgba(15,23,42,0.35)', padding: '18px 20px', fontSize: 14, lineHeight: 1.55,
      }}>
      <b id="bx-cookies-t" style={{ display: 'block', fontSize: 15, color: 'rgba(0,0,0,0.88)', marginBottom: 6 }}>{t('Cookies')}</b>
      <p style={{ margin: '0 0 14px' }}>
        {t('Usamos Microsoft Clarity para ver cómo se navegan estas páginas y mejorarlas. Sus cookies solo se activan si aceptás. Nunca se usa dentro de la app.')}{' '}
        <Link href="/privacidad#cookies" style={{ color: '#4338ca', textDecoration: 'underline' }}>{t('Más información')}</Link>
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={btn} onClick={() => answer('no')}>{t('Rechazar')}</button>
        <button type="button" style={btn} onClick={() => answer('yes')}>{t('Aceptar')}</button>
      </div>
    </div>
  );
}

/** Footer link that opens the notice again. */
export function CookieSettingsLink({ style, className }: { style?: React.CSSProperties; className?: string }) {
  const { t } = useI18n();
  return (
    <button type="button" className={className} onClick={openCookieSettings}
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left', ...style }}>
      {t('Preferencias de cookies')}
    </button>
  );
}
