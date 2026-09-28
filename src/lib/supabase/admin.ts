import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, requireEnv } from '@/lib/env';

let admin: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS: only for webhooks, cron, email outbox and super-admin actions. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin)
    admin = createClient(SUPABASE_URL, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return admin;
}
