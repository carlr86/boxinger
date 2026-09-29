import type { NextRequest } from 'next/server';
import { SITE_URL } from '@/lib/env';

const INTERNAL = /^(0\.0\.0\.0|127\.0\.0\.1|\[::\]|\[::1\])(:\d+)?$/;

/**
 * The origin the visitor used (https://boxinger.com, http://localhost:3000…).
 * Behind Hostinger's proxy `request.nextUrl.origin` is the internal bind address
 * (http://0.0.0.0:3000), so redirects must be built from the forwarded Host header.
 */
export function publicOrigin(req: NextRequest): string {
  const h = req.headers;
  const host = (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim();
  if (host && !INTERNAL.test(host)) {
    const proto = (h.get('x-forwarded-proto') || '').split(',')[0].trim() || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return SITE_URL;
}
