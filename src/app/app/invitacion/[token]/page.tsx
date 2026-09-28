import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SimpleHeader } from '@/components/SimpleHeader';
import { AcceptInvite } from './AcceptInvite';

export const metadata = { title: 'Invitación · Boxinger' };

type Inv = { kind: 'team' | 'guest' | 'client'; email: string; team_name: string | null; board_name: string | null; board_slug: string | null; inviter: string | null; expired: boolean; accepted: boolean; revoked: boolean };

export default async function Invitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const [{ data }, { data: { user } }] = await Promise.all([sb.rpc('get_invitation', { p_token: token }), sb.auth.getUser()]);
  const inv = data as Inv | null;
  const here = '/app/invitacion/' + token;

  let title = 'La invitación no es válida', text = 'Pedile a quien te invitó que te envíe una nueva.', body: React.ReactNode = null;
  if (inv && !inv.revoked) {
    if (inv.kind === 'team') {
      title = `Sumate al equipo ${inv.team_name}`;
      text = `${inv.inviter || 'El Admin'} te invitó como Miembro${inv.board_name ? ' del buzón ' + inv.board_name : ''}. Vas a poder cargar ideas del equipo, cambiar estados y sumar invitados.`;
    } else if (inv.kind === 'guest') {
      title = `Te invitaron a ${inv.board_name}`;
      text = `${inv.inviter || 'El Equipo'} te invitó a la Comunidad del buzón. Vas a poder proponer ideas, votar y comentar.`;
    }
    if (inv.expired) { text = 'La invitación venció. Pedile a quien te invitó que te envíe una nueva.'; }
    else if (!user) {
      body = (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="bx-btn-primary" style={{ display: 'inline-flex', alignItems: 'center' }} href={`/app/registro?next=${encodeURIComponent(here)}&email=${encodeURIComponent(inv.email)}`}>Crear cuenta</Link>
          <Link className="bx-btn" style={{ display: 'inline-flex', alignItems: 'center' }} href={`/app/ingresar?next=${encodeURIComponent(here)}&email=${encodeURIComponent(inv.email)}`}>Ya tengo cuenta</Link>
        </div>
      );
    } else body = <AcceptInvite token={token} />;
  }
  return (
    <>
      <SimpleHeader />
      <main className="bx-main">
        <div style={{ maxWidth: 440, width: '100%', margin: '24px auto', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{title}</h1>
          <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textWrap: 'pretty' }}>{text}</span>
          {inv?.kind === 'team' && !inv.expired && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>La invitación es para {inv.email}.</span>}
          {body}
        </div>
      </main>
    </>
  );
}
