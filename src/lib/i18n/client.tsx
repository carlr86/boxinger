'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as F from '@/lib/format';
import { LOCALE_COOKIE, makeT, translateMessage, type Locale, type T } from './index';

const I18nContext = createContext<{ locale: Locale; now: number | null }>({ locale: 'es', now: null });

/** `serverNow` is when the server printed the page: relative times ("hace 5 min") use it until the
 *  page has hydrated, so the browser prints the same text even if a minute went by or its clock differs. */
export function I18nProvider({ locale, serverNow, children }: { locale: Locale; serverNow: number; children: React.ReactNode }) {
  const [now, setNow] = useState<number | null>(serverNow);
  useEffect(() => setNow(null), []);
  const value = useMemo(() => ({ locale, now }), [locale, now]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

type D = string | number | Date;

function build(locale: Locale, now: number | null) {
  const t: T = makeT(locale);
  return {
    locale,
    t,
    /** For messages that come already written (database errors). */
    tm: (s: string) => translateMessage(locale, s),
    plural: (n: number, one: string, many: string) => n + ' ' + t(n === 1 ? one : many),
    rel: (d: D) => F.rel(d, locale, now ?? Date.now()),
    relShort: (d: D) => F.relShort(d, locale, now ?? Date.now()),
    exact: (d: D) => F.exact(d, locale),
    dshort: (d: D) => F.dshort(d, locale),
    ddmmyyyy: (d: D) => F.ddmmyyyy(d, locale),
    dlong: (d: D) => F.dlong(d, locale),
    daysL: (n: number) => F.daysL(n, locale),
    money: (c: 'USD' | 'ARS', v: number) => F.money(c, v, locale),
    fmtPrice: (v: number) => F.fmtPrice(v, locale),
  };
}

/** Interface language plus the text and date helpers bound to it. */
export function useI18n() {
  const { locale, now } = useContext(I18nContext);
  return useMemo(() => build(locale, now), [locale, now]);
}

/** Saves the choice (cookie for this browser; the caller also stores it in the profile) and reloads. */
export function applyLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
