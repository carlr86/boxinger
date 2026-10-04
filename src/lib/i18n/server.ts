import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, makeT, pickLocale, type Locale } from './index';

/** The language of the current request (cookie, else the browser's preference). */
export const getLocale = cache(async (): Promise<Locale> => {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLocale(c.get(LOCALE_COOKIE)?.value, h.get('accept-language'));
});

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(locale) };
}
