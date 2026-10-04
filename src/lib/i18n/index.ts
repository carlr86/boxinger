// Interface language. The Spanish text in the code is the source and the lookup key:
// t('Guardar') returns 'Save' in English. A text missing from EN shows in Spanish,
// so a forgotten translation never breaks a screen. `npm run i18n` lists the missing ones.
import { EN, EN_PATTERNS } from './en';

export type Locale = 'es' | 'en';
export const LOCALES: Locale[] = ['es', 'en'];
export const LOCALE_COOKIE = 'bx_locale';
export const LOCALE_NAMES: Record<Locale, string> = { es: 'Español', en: 'English' };

/** Off while the English version is being finished: the switch shows only to the platform admin
 * and the browser language is ignored. Turn on when every screen is translated. */
export const I18N_LIVE = true;

export type Vars = Record<string, string | number>;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** Translates a Spanish source text. `{name}` placeholders are filled from `vars`. */
export function translate(locale: Locale, s: string, vars?: Vars): string {
  return fill(locale === 'en' ? EN[s] ?? s : s, vars);
}

/** Like translate, for messages built elsewhere (database errors): also tries the patterns with values inside. */
export function translateMessage(locale: Locale, s: string): string {
  if (locale !== 'en' || !s) return s;
  if (EN[s]) return EN[s];
  for (const [re, en] of EN_PATTERNS) {
    const m = s.match(re);
    if (m) return en.replace(/\$(\d)/g, (_, i) => m[+i] ?? '');
  }
  return s;
}

export const isLocale = (v: unknown): v is Locale => v === 'es' || v === 'en';

/** First visit: the cookie wins; otherwise English only when the browser prefers it. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  if (!I18N_LIVE) return 'es';
  const first = (acceptLanguage || '').split(',')[0]?.trim().toLowerCase() || '';
  return first.startsWith('en') ? 'en' : 'es';
}

export type T = (s: string, vars?: Vars) => string;
export const makeT = (locale: Locale): T => (s, vars) => translate(locale, s, vars);
