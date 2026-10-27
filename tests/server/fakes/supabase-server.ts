// Stands in for src/lib/supabase/server.ts (the client of the signed-in person) in the server tests.
import { current } from './db';

export async function createClient() {
  const db = current();
  return {
    auth: {
      getUser: async () => ({ data: { user: (globalThis as { __fakeUser?: unknown }).__fakeUser ?? null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: (t: string) => db.from(t),
    rpc: (fn: string, args?: Record<string, unknown>) => db.rpc(fn, args),
  };
}
