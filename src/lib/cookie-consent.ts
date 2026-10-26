// The visitor's answer to the cookie notice on the public pages (Microsoft Clarity's statistics
// cookies). Kept in this browser's local storage, which is essential storage and needs no consent.
// The answer is asked again after a year, as the European guidelines recommend.
const KEY = 'bx-cookies';
const CHANGED = 'bx-cookies-changed';
const OPEN = 'bx-cookies-open';
const MAX_AGE = 365 * 24 * 60 * 60 * 1000;

export type Consent = 'yes' | 'no';

export function getConsent(): Consent | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as { v?: string; at?: number } | null;
    if (!v || (v.v !== 'yes' && v.v !== 'no') || typeof v.at !== 'number' || Date.now() - v.at > MAX_AGE) return null;
    return v.v;
  } catch {
    return null;
  }
}

export function setConsent(c: Consent) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: c, at: Date.now() })); } catch { /* private window: asks again next time */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function onConsentChange(fn: () => void) {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

/** Shows the notice again so the visitor can change their answer (footer link «Preferencias de cookies»). */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN));
}

export function onCookieSettingsOpen(fn: () => void) {
  window.addEventListener(OPEN, fn);
  return () => window.removeEventListener(OPEN, fn);
}
