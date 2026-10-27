// Stands in for src/lib/supabase/admin.ts (the service-role client) in the server tests.
import { current } from './db';

export const supabaseAdmin = () => current();
