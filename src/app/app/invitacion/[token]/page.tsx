import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SimpleHeader } from '@/components/SimpleHeader';
import { AcceptInvite } from './AcceptInvite';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Invitación') + ' · Boxinger' };
}

type Inv = { kind: 'team' | 'guest' | 'client'; email: string; team_name: string | null; board_name: string | null; board_slug: string | null; inviter: string | null; expired: boolean; accepted: boolean; revoked: boolean };

export default async function Invitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getT();
  const sb = await createClient();
  const [{ data }, { data: { user } }] = await Promise.all([sb.rpc('get_invitation', { p_token: token }), sb.auth.getUser()]);
  const inv = data as Inv | null;
  const here = '/app/invitacion/' + token;

  let title = t('La invitación no es válida'), text = t('Pedile a quien te invitó que te envíe una nueva.'), body: React.ReactNode = null;
  if (inv && !inv.revoked) {
    if (inv.kind === 'team') {
      title = t('Sumate al equipo {team}', { team: inv.team_name || '' });
      text = inv.board_name
        ? t('{inviter} te invitó como Miembro del buzón {board}. Vas a poder cargar ideas del equipo, cambiar estados y sumar invitados.', { inviter: inv.inviter || t('El Admin'), board: inv.board_name })
        : t('{inviter} te invitó como Miembro. Vas a poder cargar ideas del equipo, cambiar estados y sumar invitados.', { inviter: inv.inviter || t('El Admin') });
    } else if (inv.kind === 'guest') {
      title = t('Te invitaron a {board}', { board: inv.board_name || '' });
      text = t('{inviter} te invitó a la Comunidad del buzón. Vas a poder proponer ideas, votar y comentar.', { inviter: inv.inviter || t('El Equipo') });
    }
    if (inv.expired) { text = t('La invitación venció. Pedile a quien te invitó que te envíe una nueva.'); }
    else if (!user) {
      body = (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="bx-btn-primary" style={{ display: 'inline-flex', alignItems: 'center' }} href={`/app/registro?next=${encodeURIComponent(here)}&email=${encodeURIComponent(inv.email)}`}>{t('Crear cuenta')}</Link>
          <Link className="bx-btn" style={{ display: 'inline-flex', alignItems: 'center' }} href={`/app/ingresar?next=${encodeURIComponent(here)}&email=${encodeURIComponent(inv.email)}`}>{t('Ya tengo cuenta')}</Link>
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
          {inv?.kind === 'team' && !inv.expired && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{t('La invitación es para {email}.', { email: inv.email })}</span>}
          {body}
        </div>
      </main>
    </>
  );
}
