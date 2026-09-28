'use client';
import { supabaseBrowser } from '@/lib/supabase/browser';

/** Calls a Postgres function and throws its (Spanish, user-facing) error message. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabaseBrowser().rpc(fn, args);
  if (error) throw new Error(cleanError(error.message));
  return data as T;
}

export function cleanError(msg: string): string {
  if (!msg) return 'Algo salió mal. Probá de nuevo.';
  if (/JWT|jwt expired/i.test(msg)) return 'Tu sesión venció. Volvé a ingresar.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'No hay conexión. Probá de nuevo.';
  return msg;
}

/** Sends queued emails right away (the daily cron retries anything left). */
export function flushEmails() {
  fetch('/api/outbox', { method: 'POST' }).catch(() => {});
}
