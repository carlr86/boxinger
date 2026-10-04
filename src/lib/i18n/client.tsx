'use client';
import { createContext, useContext, useMemo } from 'react';
import * as F from '@/lib/format';
import { LOCALE_COOKIE, makeT, translateMessage, type Locale, type T } from './index';

const I18nContext = createContext<Locale>('es');

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

type D = string | number | Date;

function build(locale: Locale) {
  const t: T = makeT(locale);
  return {
    locale,
    t,
    /** For messages that come already written (database errors). */
    tm: (s: string) => translateMessage(locale, s),
    plural: (n: number, one: string, many: string) => n + ' ' + t(n === 1 ? one : many),
    rel: (d: D) => F.rel(d, locale),
    relShort: (d: D) => F.relShort(d, locale),
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
  const locale = useContext(I18nContext);
  return useMemo(() => build(locale), [locale]);
}

/** Saves the choice (cookie for this browser; the caller also stores it in the profile) and reloads. */
export function applyLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
