import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { SimpleHeader } from '@/components/SimpleHeader';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/session';
import { getT } from '@/lib/i18n/server';

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;

const NOTICES: Record<string, string> = {
  verificado: 'Tu email quedó verificado. Ingresá para continuar.',
  contrasena: 'Actualizaste tu contraseña. Ingresá con la nueva.',
  error: 'El link venció o ya se usó. Ingresá o pedí uno nuevo.',
};

export async function AuthPage({ mode, searchParams }: { mode: 'login' | 'registro'; searchParams: SP }) {
  const sp = await searchParams;
  const { t } = await getT();
  const next = safeNext(one(sp.next));
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect(next);

  // Coming from a board: show its name ("Vas a quedar como Comunidad de …").
  let boardName: string | null = null;
  const m = next.match(/^\/app\/b\/([a-z0-9-]+)/);
  if (m) {
    const { data } = await sb.rpc('get_board', { p_slug: m[1] });
    boardName = (data as { board?: { name: string } } | null)?.board?.name ?? null;
  }
  return (
    <>
      <SimpleHeader />
      <main className="bx-main" style={{ paddingBottom: 48 }}>
        <AuthForm mode={mode} next={next} boardName={boardName} alert={one(sp.alerta) === '1'}
          invitedEmail={one(sp.email)} notice={NOTICES[one(sp.aviso) || ''] ? t(NOTICES[one(sp.aviso) || '']) : null} />
      </main>
    </>
  );
}
