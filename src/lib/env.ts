// Centralized env access. Server-only secrets are read lazily so a missing
// provider key only breaks the feature that needs it.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export const boardUrl = (slug: string) => `${SITE_URL}/app/b/${slug}`;
export const displayUrl = (slug: string) => `${SITE_URL.replace(/^https?:\/\//, '')}/app/b/${slug}`;
