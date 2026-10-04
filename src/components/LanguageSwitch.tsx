'use client';
import { useState } from 'react';
import { GlobalOutlined } from '@ant-design/icons';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { applyLocale, useI18n } from '@/lib/i18n/client';
import { I18N_LIVE, LOCALE_NAMES, LOCALES, type Locale } from '@/lib/i18n';

/** Stores the language in the profile (when signed in) and in this browser, then reloads. */
export async function changeLocale(l: Locale) {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  if (data.session) await sb.rpc('set_locale', { p_locale: l }).then(() => {}, () => {});
  applyLocale(l);
}

/** Language selector (globe + dropdown). `label` adds the word "Idioma" before it, as a menu row. */
export function LanguageSwitch({ style, preview, label }: { style?: React.CSSProperties; preview?: boolean; label?: boolean }) {
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  // Until the English version is live, only `preview` (the platform admin's menu) shows it, or whoever already switched.
  if (!I18N_LIVE && !preview && locale === 'es') return null;
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(0,0,0,0.65)', ...style }}>
      <GlobalOutlined aria-hidden style={{ fontSize: 15 }} />
      {label ? <span style={{ flex: 1 }}>{t('Idioma')}</span> : <span className="bx-sr-only">{t('Idioma')}</span>}
      <select className="bx-select" value={locale} disabled={busy} aria-label={t('Idioma')}
        onChange={(e) => { const l = e.target.value as Locale; setBusy(true); changeLocale(l); }}
        style={{ height: 30, fontSize: 13, cursor: 'pointer', paddingRight: 4 }}>
        {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</option>)}
      </select>
    </label>
  );
}
