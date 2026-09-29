'use client';
import { supabaseBrowser } from '@/lib/supabase/browser';

/** True when the Google provider is enabled in Supabase (Authentication › Providers). */
export async function googleEnabled(): Promise<boolean> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } });
    const j = await r.json();
    return !!j?.external?.google;
  } catch {
    return true; // let Supabase answer if the check itself fails
  }
}

/** Starts Google sign-in, or returns an error message when it isn't available yet. */
export async function signInWithGoogle(redirectTo: string, loginHint?: string): Promise<string | null> {
  if (!(await googleEnabled())) return 'El ingreso con Google todavía no está disponible. Usá tu email y contraseña.';
  const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: loginHint ? { login_hint: loginHint } : undefined } });
  return error ? error.message : null;
}
