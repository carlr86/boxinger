'use client';

import { useEffect } from 'react';
import { getConsent, onConsentChange } from '@/lib/cookie-consent';

// Microsoft Clarity (heatmaps + session recordings), only on the public pages: it is mounted by
// src/app/(site)/layout.tsx and never inside /app, where boards hold customers' private ideas.
// It only loads after the visitor accepts the cookie notice (CookieBanner); if they reject it later
// we stop it and tell Clarity consent was denied. Without consent its cookies are deleted.
// Links from the landing into /app are client-side, so the script would keep recording there:
// when this layout unmounts we stop Clarity, and start it again when the visitor comes back.
// Production only, so local work and previews don't pollute the stats.
const PROJECT_ID = 'z3iv8ndrba';
const COOKIES = ['_clck', '_clsk']; // its first-party cookies; the ones on clarity.ms/bing.com it drops itself on denied consent

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };
declare global { interface Window { clarity?: ClarityFn } }

function start() {
  if (!window.clarity) {
    const queue: ClarityFn = (...args) => { (queue.q ||= []).push(args); };
    window.clarity = queue;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.clarity.ms/tag/' + PROJECT_ID;
    document.head.appendChild(s);
  }
  window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
  window.clarity('start');
}

function revoke() {
  window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
  window.clarity?.('stop');
}

// Also on every visit without consent: visitors from before the notice may still have them.
function clearCookies() {
  const parts = location.hostname.split('.');
  const domains = ['', ...parts.map((_, i) => '; domain=.' + parts.slice(i).join('.'))];
  for (const name of COOKIES) for (const d of domains) document.cookie = name + '=; Max-Age=0; path=/' + d;
}

export function Clarity() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    let on = false;
    const sync = () => {
      const yes = getConsent() === 'yes';
      if (yes && !on) start();
      else if (!yes && on) revoke();
      if (!yes) clearCookies();
      on = yes;
    };
    sync();
    const off = onConsentChange(sync);
    return () => { off(); if (on) window.clarity?.('stop'); };
  }, []);
  return null;
}
