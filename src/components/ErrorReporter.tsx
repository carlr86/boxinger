'use client';
import { useEffect } from 'react';

/** Sends a browser error to /api/client-error (deduplicated, at most 5 per page load). */
export function sendClientError(e: { message: string; stack?: string; digest?: string; kind: string }) {
  try {
    const w = window as unknown as { __bxErr?: Set<string> };
    const sent = (w.__bxErr ||= new Set());
    if (sent.size >= 5 || sent.has(e.message)) return;
    sent.add(e.message);
    const body = JSON.stringify({ ...e, path: location.pathname });
    if (!navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' })))
      fetch('/api/client-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {}
}

// Noise from browsers and extensions, not from Boxinger.
const IGNORE = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|AbortError|Load failed|Failed to fetch|NetworkError|chrome-extension:|moz-extension:/i;

/** Catches errors outside React (event handlers, promises) and reports them. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      if (ev.filename && !ev.filename.startsWith(location.origin)) return;
      const msg = ev.error?.message || ev.message || '';
      if (!msg || IGNORE.test(msg) || IGNORE.test(ev.error?.stack || '')) return;
      sendClientError({ message: msg, stack: ev.error?.stack, kind: 'error' });
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const r = ev.reason, msg = r instanceof Error ? r.message : typeof r === 'string' ? r : '';
      if (!msg || IGNORE.test(msg) || IGNORE.test(r?.stack || '')) return;
      sendClientError({ message: msg, stack: r?.stack, kind: 'promise' });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return null;
}
