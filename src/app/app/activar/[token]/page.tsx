import { createClient } from '@/lib/supabase/server';
import { SimpleHeader } from '@/components/SimpleHeader';
import { Activate } from './Activate';

export const metadata = { title: 'Activá tu cuenta · Boxinger' };

export default async function Activar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data } = await sb.rpc('get_invitation', { p_token: token });
  const inv = data as { kind: string; email: string; expired: boolean; accepted: boolean; revoked: boolean; team_name: string | null } | null;
  const valid = !!inv && inv.kind === 'client' && !inv.revoked && !inv.expired && !inv.accepted;
  return (
    <>
      <SimpleHeader />
      <main className="bx-main">
        <div style={{ maxWidth: 420, width: '100%', margin: '24px auto', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{valid ? 'Activá tu cuenta' : inv?.accepted ? 'Tu cuenta ya está activa' : 'El link no es válido'}</h1>
          {valid ? <Activate token={token} email={inv!.email} /> : (
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>
              {inv?.accepted ? <>Ingresá con tu email. <a href="/app/ingresar">Ingresar</a></> : 'El link venció o ya no es válido. Escribinos a hola@boxinger.com y te enviamos uno nuevo.'}
            </span>
          )}
        </div>
      </main>
    </>
  );
}
