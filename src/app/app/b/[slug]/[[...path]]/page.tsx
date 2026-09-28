import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BoardApp } from '@/components/board/BoardApp';
import { SimpleHeader } from '@/components/SimpleHeader';
import type { BoardData } from '@/lib/types';

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
  if (!d || d.forbidden) return { title: 'Buzón · Boxinger', robots: { index: false } };
  return {
    title: d.board.name + ' · Boxinger',
    description: d.board.description || 'Proponé, votá y seguí qué ideas entran al Backlog.',
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
    return (
      <>
        <SimpleHeader />
        <main className="bx-main" style={{ alignItems: 'center' }}>
          <div style={{ maxWidth: 440, background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{d.name}</h1>
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>Este buzón es privado. Solo el Equipo con acceso puede verlo.</span>
            <Link href={'/app/ingresar?next=' + encodeURIComponent(here)}>Ingresar con otra cuenta</Link>
          </div>
        </main>
      </>
    );
  }
  const join = sp.unirme === '1' || typeof sp.invitacion === 'string';
  return <BoardApp initial={d} path={here} join={join} />;
}
