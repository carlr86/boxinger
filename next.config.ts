import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

// Content-Security-Policy. The app loads no third-party scripts (PayPal / Mercado Pago / Creem
// open by full-page redirect, not embedded), so the only outside origin the browser talks to is
// Supabase (REST + realtime websockets) and its Storage images, plus Google profile photos. antd 6 and Next inject inline
// styles and inline hydration scripts, so 'unsafe-inline' is needed for style/script; prod does
// NOT need eval, but `next dev` (HMR / React Refresh) does, so eval is allowed in development only.
// frame-ancestors 'self' blocks clickjacking. NOTE: when the embeddable widget ships, that one
// route needs its own looser frame-ancestors so other sites can embed it — do it per-route, not here.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Google sign-in profile photos come from lh3.googleusercontent.com.
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Force HTTPS for two years, including subdomains. Safe: the site already runs only on HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework in the x-powered-by header.
  poweredByHeader: false,
  // antd 6 ships ESM; nothing to transpile. Logos and avatars live in Supabase Storage.
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
