'use client';
import { useMemo, useState } from 'react';
import { Dropdown } from 'antd';
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { Avatar, Empty, Help, PageHead, ProLock, Tag } from '@/components/ui';
import { LAUNCHED } from '@/lib/constants';
import { useI18n } from '@/lib/i18n/client';
import type { Idea } from '@/lib/types';
import type { BoardApi } from './shared';
import { AnonAvatar, OriginTag } from './IdeaGrid';
import { downloadChangelogCsv, downloadChangelogPdf, type ChangelogCtx } from '@/lib/changelog-export';
import { useToast } from '@/components/Providers';

// Novedades (changelog): the board's launched ideas, newest first and grouped by month. It builds itself from the
// ideas marked as launched (no editing). Visible to everyone who can see the board, on Pro, Team and Enterprise.

const TZ = 'America/Argentina/Buenos_Aires';

export function Novedades({ api }: { api: BoardApi }) {
  const { t, locale, plural } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const tag = locale === 'en' ? 'en-US' : 'es-AR';

  const months = useMemo(() => {
    const launched = api.data.ideas.filter((i) => i.launched_at && !i.hidden).sort((a, b) => +new Date(b.launched_at!) - +new Date(a.launched_at!));
    const out: { key: string; label: string; ideas: Idea[] }[] = [];
    for (const i of launched) {
      const d = new Date(i.launched_at!);
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(d);
      const label = new Intl.DateTimeFormat(tag, { timeZone: TZ, month: 'long', year: 'numeric' }).format(d);
      if (out[out.length - 1]?.key !== key) out.push({ key, label: label[0].toUpperCase() + label.slice(1), ideas: [] });
      out[out.length - 1].ideas.push(i);
    }
    return out;
  }, [api.data.ideas, tag]);
  const total = months.reduce((n, m) => n + m.ideas.length, 0);

  // Anyone who sees Novedades can download it: only what the page shows, no emails.
  async function download(kind: 'csv' | 'pdf') {
    const b = api.data.board;
    const ctx: ChangelogCtx = { board: { name: b.name, slug: b.slug, logo_url: b.logo_url }, ideas: months.flatMap((m) => m.ideas), catL: api.catL, t, locale, origin: window.location.origin };
    if (kind === 'csv') return downloadChangelogCsv(ctx);
    setBusy(true);
    try { await downloadChangelogPdf(ctx); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }

  const head = (
    <PageHead title={t('Novedades')} sub={t('Lo que el equipo ya lanzó, a partir de las ideas de la comunidad.')}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {api.pro && total > 0 && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{plural(total, 'lanzamiento', 'lanzamientos')}</span>}
          {api.pro && total > 0 && (
            <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: [
              { key: 'csv', icon: <FileExcelOutlined />, label: t('Excel (CSV)'), onClick: () => download('csv') },
              { key: 'pdf', icon: <FilePdfOutlined />, label: t('PDF para compartir'), onClick: () => download('pdf') },
            ] }}>
              <button type="button" className="bx-btn" disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <DownloadOutlined />{busy ? t('Armando el PDF…') : t('Descargar')}
              </button>
            </Dropdown>
          )}
          {api.isTeam && <Help label={t('Cómo funciona')}>{t('Aparece acá, sola, cada idea que el equipo marca como lanzada (desde el Roadmap o el detalle de la idea). Al lanzarla avisamos en la campanita a toda la comunidad del buzón, y por email a quien la propuso o votó. Las ideas ocultas no se muestran.')}</Help>}
        </div>
      } />
  );

  if (!api.pro) {
    return (
      <>
        {head}
        <ProLock title={t('Mostrá lo que lanzaste con Novedades')} text={t('Una página para toda la comunidad del buzón con las ideas que ya salieron, quién las propuso y cuándo. Se arma sola al marcar una idea como lanzada.')} onGo={api.goPro} />
      </>
    );
  }

  return (
    <>
      {head}
      {total === 0 && <Empty text={api.isTeam ? t('Todavía no hay novedades. Cuando marques una idea como lanzada, aparece acá y le avisamos a la comunidad.') : t('Todavía no hay novedades. Cuando el equipo lance una idea, la vas a ver acá.')} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 760 }}>
        {months.map((m) => (
          <section key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.65)' }}>{m.label}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '2px solid #d1fae5', marginLeft: 6, paddingLeft: 20 }}>
              {m.ideas.map((i) => <Entry key={i.id} api={api} i={i} tag={tag} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function Entry({ api, i, tag }: { api: BoardApi; i: Idea; tag: string }) {
  const { t, plural } = useI18n();
  const [more, setMore] = useState(false);
  const long = i.description.length > 280;
  const day = new Intl.DateTimeFormat(tag, { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(i.launched_at!));
  return (
    <article style={{ position: 'relative', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span aria-hidden style={{ position: 'absolute', left: -28, top: 20, width: 12, height: 12, borderRadius: '50%', background: '#059669', boxShadow: '0 0 0 3px #fff' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Tag tone={LAUNCHED}>🚀 {t('Lanzada')}</Tag>
        <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{day}</span>
      </div>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{i.title}</h3>
      {i.description && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'rgba(0,0,0,0.72)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {long && !more ? i.description.slice(0, 280).trimEnd() + '…' : i.description}
          {long && <> <a onClick={() => setMore(!more)}>{more ? t('Ver menos') : t('Ver más')}</a></>}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>
        <Tag>{api.catL(i.category_id)}</Tag>
        <OriginTag origin={i.origin} imported={i.imported} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {/* Novedades is for everyone (and gets downloaded): an anonymous idea stays «Anónimo» even for the Admin. */}
          {i.anonymous ? <AnonAvatar size={18} /> : <Avatar name={i.author_name} id={i.author_id || ''} url={i.author_avatar} size={18} color={i.author_id ? undefined : '#d9d9d9'} />}
          {t('Propuesta por {name}', { name: i.anonymous ? t('Anónimo') : i.author_id ? i.author_name : t(i.author_name) })}
        </span>
        <span>· {plural(i.votes, 'voto', 'votos')}</span>
        <a style={{ marginLeft: 'auto' }} onClick={() => api.openIdea(i.id)}>{t('Ver idea')} →</a>
      </div>
    </article>
  );
}
