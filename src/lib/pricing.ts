import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import { ENTERPRISE_USD } from '@/lib/constants';

export const DEFAULT_PRO_USD = 9.99;

/** Current list price of Pro in USD, for public pages. Falls back to the launch price. */
export async function getPublicProPrice(): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return DEFAULT_PRO_USD;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc('current_price', { p_currency: 'USD' });
    if (error || data == null) return DEFAULT_PRO_USD;
    return Number(data);
  } catch {
    return DEFAULT_PRO_USD;
  }
}

/** Current list price of Enterprise in USD, for public pages. Falls back to the launch price. */
export async function getPublicEnterprisePrice(): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return ENTERPRISE_USD;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc('current_plan_price', { p_plan: 'enterprise', p_currency: 'USD' });
    if (error || data == null) return ENTERPRISE_USD;
    return Number(data);
  } catch {
    return ENTERPRISE_USD;
  }
}
