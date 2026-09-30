'use client';
import { useEffect } from 'react';
import { useSession } from '@/components/Providers';

const COLORS = ['#059669', '#10b981', '#a7f3d0', '#4f46e5', '#fbbf24'];
const NEW_ACCOUNT_MS = 3 * 864e5; // email sign-ups may confirm a while after registering

/** Confetti the first time a newly created account opens the app (once per account and browser). */
export function WelcomeConfetti() {
  const { ctx } = useSession();
  const me = ctx?.me;
  useEffect(() => {
    if (!me || Date.now() - new Date(me.created_at).getTime() > NEW_ACCOUNT_MS) return;
    const key = 'bx-welcome:' + me.id;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return; // no storage: skip rather than repeat on every load
    }
    let cancelled = false;
    import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return;
      const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 2000 };
      confetti({ ...base, particleCount: 120, spread: 80, startVelocity: 45, origin: { y: 0.6 } });
      setTimeout(() => {
        confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
        confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
      }, 250);
    });
    return () => { cancelled = true; };
  }, [me]);
  return null;
}
