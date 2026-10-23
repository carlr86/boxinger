'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';

const DELAY = 120; // quick page changes show nothing
const GIVE_UP = 15000; // a navigation that never lands (e.g. redirected back here) hides the bar anyway

/** Thin bar at the top of the window while the next page loads. Started from instrumentation-client.ts. */
export function NavProgress() {
  const { t } = useI18n();
  const key = usePathname() + '?' + useSearchParams().toString();
  const [p, setP] = useState<number | null>(null);
  const timers = useRef<{ delay?: number; trickle?: number; giveUp?: number; hide?: number }>({});

  const clear = () => {
    const tm = timers.current;
    clearTimeout(tm.delay); clearInterval(tm.trickle); clearTimeout(tm.giveUp); clearTimeout(tm.hide);
    timers.current = {};
  };
  const finish = () => {
    const shown = timers.current.trickle !== undefined;
    clear();
    if (!shown) return setP(null);
    setP(1);
    timers.current.hide = window.setTimeout(() => setP(null), 300);
  };

  useEffect(() => {
    const onStart = (e: Event) => {
      const { url, type } = (e as CustomEvent<{ url: string; type: string }>).detail;
      const to = new URL(url, location.href);
      // Same page (only the #hash, or a tab that just syncs the ?query with replace): nothing to wait for.
      if (to.origin !== location.origin || (to.pathname === location.pathname && (type === 'replace' || to.search === location.search))) return;
      clear();
      timers.current.delay = window.setTimeout(() => {
        setP(0.1);
        timers.current.trickle = window.setInterval(() => setP((v) => (v === null ? v : v + (0.9 - v) * 0.12)), 250);
      }, DELAY);
      timers.current.giveUp = window.setTimeout(finish, GIVE_UP);
    };
    window.addEventListener('bx:nav-start', onStart);
    return () => { window.removeEventListener('bx:nav-start', onStart); clear(); };
  }, []);

  // The new page is on screen.
  useEffect(finish, [key]);

  useEffect(() => {
    if (p === null) return;
    document.documentElement.classList.add('bx-nav-busy');
    return () => document.documentElement.classList.remove('bx-nav-busy');
  }, [p === null]);

  if (p === null) return null;
  return (
    <div className="bx-nav-progress" role="progressbar" aria-label={t('Cargando…')} style={{ opacity: p === 1 ? 0 : 1 }}>
      <div style={{ transform: `scaleX(${p})` }} />
    </div>
  );
}
