'use client';

import { useEffect } from 'react';

// Microsoft Clarity (heatmaps + session recordings), only on the public pages: it is mounted by
// src/app/(site)/layout.tsx and never inside /app, where boards hold customers' private ideas.
// Links from the landing into /app are client-side, so the script would keep recording there:
// when this layout unmounts we stop Clarity, and start it again when the visitor comes back.
// Production only, so local work and previews don't pollute the stats.
const PROJECT_ID = 'z3iv8ndrba';

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };
declare global { interface Window { clarity?: ClarityFn } }

export function Clarity() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (window.clarity) {
      window.clarity('start');
    } else {
      const queue: ClarityFn = (...args) => { (queue.q ||= []).push(args); };
      window.clarity = queue;
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.clarity.ms/tag/' + PROJECT_ID;
      document.head.appendChild(s);
    }
    return () => { window.clarity?.('stop'); };
  }, []);
  return null;
}
