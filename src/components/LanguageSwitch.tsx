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

/** "Español · English" picker. `tone="dark"` for dark footers. */
export function LanguageSwitch({ tone = 'light', style, preview }: { tone?: 'light' | 'dark'; style?: React.CSSProperties; preview?: boolean }) {
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  // Until the English version is live, only `preview` (the platform admin's menu) shows it, or whoever already switched.
  if (!I18N_LIVE && !preview && locale === 'es') return null;
  const dim = tone === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const on = tone === 'dark' ? '#fff' : 'rgba(0,0,0,0.88)';
  return (
    <span role="group" aria-label={t('Idioma')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: dim, ...style }}>
      <GlobalOutlined aria-hidden />
      {LOCALES.map((l, i) => (
        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <span aria-hidden>·</span>}
          <button type="button" disabled={busy || l === locale} aria-pressed={l === locale} lang={l}
            onClick={() => { setBusy(true); changeLocale(l); }}
            style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', cursor: l === locale ? 'default' : 'pointer', color: l === locale ? on : dim, fontWeight: l === locale ? 600 : 400 }}>
            {LOCALE_NAMES[l]}
          </button>
        </span>
      ))}
    </span>
  );
}
