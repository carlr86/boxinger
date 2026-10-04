import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BoardApp } from '@/components/board/BoardApp';
import { SimpleHeader } from '@/components/SimpleHeader';
import type { BoardData } from '@/lib/types';
import { RequestAccess } from './RequestAccess';
import { getT } from '@/lib/i18n/server';

type Props = {
  params: Promise<{ slug: string; path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(slug: string) {
  const sb = await createClient();
  const { data } = await sb.rpc('get_board', { p_slug: slug });
  return data as BoardData | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  const { t } = await getT();
  // Boards are never indexed by search engines, whatever their visibility.
  if (!d || d.forbidden) return { title: t('Buzón') + ' · Boxinger', robots: { index: false, follow: false } };
  return {
    title: d.board.name + ' · Boxinger',
    robots: { index: false, follow: false },
    description: d.board.description || t('Proponé, votá y seguí qué ideas entran al Backlog.'),
    openGraph: { title: d.board.name, description: d.board.description, images: d.board.logo_url ? [d.board.logo_url] : undefined },
  };
}

export default async function BoardPage({ params, searchParams }: Props) {
  const { slug, path } = await params;
  const sp = await searchParams;
  const d = await load(slug);
  if (!d) notFound();
  const here = '/app/b/' + slug + (path?.length ? '/' + path.join('/') : '');

  if (d.forbidden) {
    const { t } = await getT();
    // Nothing about the board (not even its name) is shown to people without access.
    const invite = d.visibility === 'invite';
    let email = '';
    if (d.signed_in) email = (await (await createClient()).auth.getUser()).data.user?.email || '';
    const login = '/app/ingresar?next=' + encodeURIComponent(here);
    return (
      <>
        <SimpleHeader />
        <main className="bx-main" style={{ alignItems: 'center' }}>
          <div style={{ maxWidth: 460, width: '100%', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{invite ? t('Este buzón es solo para invitados') : t('Este buzón es privado')}</h1>
            <span style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(0,0,0,0.65)' }}>
              {invite
                ? d.signed_in
                  ? <>{t('Ingresaste como {email}, que no está invitado a este buzón. Si te invitaron con otro email, ingresá con ese.', { email })} {d.can_request ? t('Si no, podés pedirle acceso al equipo.') : t('Si no, pedile al equipo que te invite.')}</>
                  : d.can_request ? t('Ingresá con el email con el que te invitaron, o ingresá para solicitar acceso al equipo.') : t('Ingresá con el email con el que te invitaron para ver las ideas.')
                : d.signed_in
                  ? t('Ingresaste como {email}. Solo el Equipo con acceso puede ver este buzón.', { email })
                  : t('Solo el Equipo con acceso puede verlo. Si sos parte del equipo, ingresá.')}
            </span>
            {invite && d.can_request && d.signed_in && <RequestAccess slug={slug} initial={d.request ?? null} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {d.signed_in
                ? <Link href={login} className="bx-btn" style={{ height: 36, display: 'flex', alignItems: 'center' }}>{t('Ingresar con otra cuenta')}</Link>
                : <Link href={login} className="bx-btn-primary" style={{ height: 36, display: 'flex', alignItems: 'center' }}>{invite && d.can_request ? t('Ingresar para solicitar acceso') : t('Ingresar')}</Link>}
              {invite && !d.signed_in && <Link href={'/app/registro?next=' + encodeURIComponent(here)} className="bx-btn" style={{ height: 36, display: 'flex', alignItems: 'center' }}>{t('Crear cuenta')}</Link>}
            </div>
          </div>
        </main>
      </>
    );
  }
  const join = sp.unirme === '1' || typeof sp.invitacion === 'string';
  return <BoardApp initial={d} path={here} join={join} />;
}
