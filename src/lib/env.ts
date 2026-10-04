// Centralized env access. Server-only secrets are read lazily so a missing
// provider key only breaks the feature that needs it.

/** Public base URL. Tolerates a missing scheme ("boxinger.com") and falls back if it is not a valid URL. */
function siteUrl(): string {
  let v = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  if (v && !/^https?:\/\//i.test(v)) v = (/^(localhost|127\.)/.test(v) ? 'http://' : 'https://') + v;
  try {
    return v ? new URL(v).origin : 'http://localhost:3000';
  } catch {
    return 'https://boxinger.com';
  }
}
export const SITE_URL = siteUrl();
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/** Pasted values sometimes carry spaces or quotes: drop them. */
export const cleanEnv = (v: string | undefined) => v?.trim().replace(/^(['"])(.*)\1$/, '$2').trim() || undefined;

export function requireEnv(name: string): string {
  const v = cleanEnv(process.env[name]);
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export const boardUrl = (slug: string) => `${SITE_URL}/app/b/${slug}`;
export const displayUrl = (slug: string) => `${SITE_URL.replace(/^https?:\/\//, '')}/app/b/${slug}`;
