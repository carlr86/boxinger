'use client';
import { useMemo, useState } from 'react';
import { Bar, Dots, PageHead, ProLock, Seg, Stat, Tag } from '@/components/ui';
import { DEV, GROWTH, NO_PRIO, PRIO, RATE_C, RATE_L } from '@/lib/constants';
import { ddmmyyyy, plural } from '@/lib/format';
import { rateOf, scoreOf, type BoardApi } from './shared';
import { useGridCols } from './IdeaGrid';

const DAY = 864e5;

// ───────────────────────── Matriz ─────────────────────────
function AxisDots({ v, k, vertical }: { v: number; k: 'impact' | 'effort'; vertical?: boolean }) {
  return (
    <span style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = vertical ? 6 - n <= v : n <= v;
        return <span key={n} style={{ width: 10, height: 10, display: 'grid', placeItems: 'center' }}><span style={{ width: on ? 10 : 4, height: on ? 10 : 4, borderRadius: '50%', background: on ? RATE_C[k] : '#d0d0d0' }} /></span>;
      })}
    </span>
  );
}

export function Matrix({ api }: { api: BoardApi }) {
  const { isMobile } = useGridCols();
  const [sel, setSel] = useState<number | null>(null);
  const appr = api.data.ideas.filter((i) => i.status === 'aprobada' && !i.hidden);
  const rated = appr.filter((i) => rateOf(i, 'impact') > 0 && rateOf(i, 'effort') > 0)
    .map((i) => ({ i, imp: rateOf(i, 'impact'), eff: rateOf(i, 'effort'), score: scoreOf(i) || 0 }))
    .sort((a, b) => b.score - a.score);
  const unrated = appr.filter((i) => !(rateOf(i, 'impact') > 0 && rateOf(i, 'effort') > 0));
  const prioN = (p?: string | null) => ({ alta: 3, media: 2, baja: 1 } as Record<string, number>)[p || ''] || 0;

  const head = <PageHead title="Matriz de esfuerzo e impacto" sub="Priorizar visualmente las ideas aprobadas y compara según la matriz de esfuerzo vs impacto." />;
  if (!api.pro) return <>{head}<ProLock title="Priorizá con la matriz" text="Calificá las ideas aprobadas por impacto y esfuerzo y visualizalas en una matriz para decidir qué hacer primero." onGo={api.goPro} /></>;

  const corner = (pos: React.CSSProperties, l: string) => (
    <span style={{ position: 'absolute', ...pos, fontSize: 11, color: 'rgba(0,0,0,0.5)', letterSpacing: '.04em', textTransform: 'uppercase', pointerEvents: 'none', zIndex: 2, background: 'rgba(250,251,252,0.9)', padding: '1px 5px', borderRadius: 3 }}>{l}</span>
  );

  return (
    <>
      {head}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: '20px 20px 12px 12px', position: isMobile ? 'static' : 'sticky', top: 80 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gridTemplateRows: 'auto auto', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(5,minmax(84px,1fr))', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, bottom: 6, fontSize: 11, color: 'rgba(0,0,0,0.45)', letterSpacing: '.06em', writingMode: 'vertical-rl', transform: 'rotate(180deg)', pointerEvents: 'none' }}>IMPACTO</span>
              {[5, 4, 3, 2, 1].map((v) => (
                <div key={v} title={'Impacto ' + RATE_L[v].toLowerCase()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '6px 0' }}>
                  <AxisDots v={v} k="impact" vertical />
                  <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: '#e4e4e4' }} />
                </div>
              ))}
            </div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gridTemplateRows: 'repeat(5,minmax(84px,1fr))', background: '#fafbfc', borderRadius: 6 }}>
              {corner({ left: 10, top: 8 }, 'Victorias rápidas')}
              {corner({ right: 10, top: 8 }, 'Grandes apuestas')}
              {corner({ left: 10, bottom: 8 }, 'Mejoras menores')}
              {corner({ right: 10, bottom: 8 }, 'Revisar')}
              <span style={{ position: 'absolute', left: '50%', top: '6%', bottom: '6%', width: 1, background: '#eceef1', pointerEvents: 'none' }} />
              <span style={{ position: 'absolute', top: '50%', left: '4%', right: '4%', height: 1, background: '#eceef1', pointerEvents: 'none' }} />
              {[5, 4, 3, 2, 1].flatMap((imp) => [1, 2, 3, 4, 5].map((eff) => {
                const inCell = rated.filter((x) => x.imp === imp && x.eff === eff);
                return (
                  <div key={imp + '-' + eff} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, position: 'relative' }}>
                    {inCell.map((x) => {
                      const sz = Math.round([0, 24, 34, 44, 54, 64][x.imp] * (inCell.length > 2 ? 0.6 : inCell.length > 1 ? 0.75 : 1));
                      const on = sel === x.i.id;
                      return (
                        <span key={x.i.id} onClick={() => api.openIdea(x.i.id)} onMouseEnter={() => setSel(x.i.id)} onMouseLeave={() => setSel(null)} title={x.i.title + ' · ' + plural(x.i.votes, 'voto', 'votos')}
                          style={{ width: sz, height: sz, borderRadius: '50%', background: on ? '#d6e4fb' : '#dcdde1', boxShadow: on ? '0 0 0 3px #7aa7f5' : 'none', cursor: 'pointer', transition: 'box-shadow .15s,background .15s' }} />
                      );
                    })}
                  </div>
                );
              }))}
            </div>
            <div />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <div key={v} title={'Esfuerzo ' + RATE_L[v].toLowerCase()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span style={{ height: 3, alignSelf: 'stretch', borderRadius: 2, background: '#e4e4e4' }} />
                    <AxisDots v={v} k="effort" />
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', letterSpacing: '.06em' }}>ESFUERZO</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rated.length === 0 && <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, fontSize: 14, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>Todavía no hay ideas aprobadas con impacto y esfuerzo calificados.</div>}
          {rated.slice().sort((a, b) => prioN(b.i.priority) - prioN(a.i.priority) || b.score - a.score).map((x) => {
            const P = x.i.priority ? PRIO[x.i.priority] : NO_PRIO, on = sel === x.i.id;
            return (
              <div key={x.i.id} onMouseEnter={() => setSel(x.i.id)} onMouseLeave={() => setSel(null)}
                style={{ background: '#fff', borderRadius: 8, border: '1px solid ' + (on ? '#7aa7f5' : '#f0f0f0'), boxShadow: on ? '0 0 0 1px #7aa7f5' : 'none', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'box-shadow .15s,border-color .15s' }}>
                <a onClick={() => api.openIdea(x.i.id)} className="bx-row-link" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{x.i.title}</a>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 8, alignItems: 'center', fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>
                  <span>Prioridad</span><span><Tag tone={P}>{P.l}</Tag></span>
                  <span>Esfuerzo</span><Dots v={x.eff} k="effort" />
                  <span>Impacto</span><Dots v={x.imp} k="impact" />
                  <span>Votos</span><span style={{ color: 'rgba(0,0,0,0.88)' }}>{x.i.votes}</span>
                  <span style={{ alignSelf: 'start', lineHeight: '20px' }}>Growth</span>
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {x.i.growth?.length
                      ? x.i.growth.map((k) => GROWTH[k] && <Tag key={k} tone={GROWTH[k]} style={{ borderRadius: 10 }}>{GROWTH[k].l}</Tag>)
                      : <Tag tone={NO_PRIO}>Sin definir</Tag>}
                  </span>
                </div>
              </div>
            );
          })}
          {unrated.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 8, border: '1px dashed #d9d9d9', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>{plural(unrated.length, 'idea aprobada sin calificar', 'ideas aprobadas sin calificar')}</span>
              {unrated.map((i) => <a key={i.id} onClick={() => api.openIdea(i.id)} style={{ fontSize: 14 }}>{i.title}</a>)}
            </div>
          )}
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>La prioridad se define desde el detalle de cada idea en el Roadmap. El tamaño de cada burbuja indica el impacto: de 1 (más chica) a 5 (más grande).</span>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── Status ─────────────────────────
export function Status({ api }: { api: BoardApi }) {
  const [f, setF] = useState<'all' | 'en_curso' | 'lanzada'>('all');
  const head = <PageHead title="Status" sub="Qué pasó con las ideas del buzón: cuántas se aprobaron, cuántas están en desarrollo y cuáles ya se lanzaron." />;
  const m = useMemo(() => {
    const all = api.data.ideas.filter((i) => !i.hidden), tot = Math.max(1, all.length);
    const appr = all.filter((i) => i.status === 'aprobada'), inRm = appr.filter((i) => i.rm_col || i.dev_status === 'lanzada');
    const dev = inRm.filter((i) => i.dev_status === 'en_curso' || i.dev_status === 'lanzada'), lau = appr.filter((i) => i.dev_status === 'lanzada');
    const days = (i: typeof all[number]) => Math.max(0, Math.round(((i.launched_at ? +new Date(i.launched_at) : Date.now()) - +new Date(i.created_at)) / DAY));
    const avg = lau.length ? Math.round(lau.reduce((a, i) => a + days(i), 0) / lau.length) : null;
    const pct = (n: number) => Math.round((n / tot) * 100) + '%';
    return { all, appr, inRm, dev, lau, days, avg, pct, tot };
  }, [api.data.ideas]);
  if (!api.pro) return <>{head}<ProLock title="Seguí el resultado de las ideas" text="Medí cuántas ideas terminan lanzadas y cuánto tardan desde que alguien las propone." onGo={api.goPro} /></>;

  const rows = m.dev.filter((i) => f === 'all' || i.dev_status === f).sort((a, b) => +new Date(b.dev_at || 0) - +new Date(a.dev_at || 0));
  const byO = (o: string) => { const p = m.all.filter((i) => i.origin === o).length, l = m.lau.filter((i) => i.origin === o).length; return { p, l, w: (p ? Math.round((l / p) * 100) : 0) + '%' }; };

  return (
    <>
      {head}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 16 }}>
        <Stat label="Ideas recibidas" value={m.all.length} note={m.all.filter((i) => i.origin === 'comunidad').length + ' de la Comunidad'} />
        <Stat label="Aprobadas" value={m.appr.length} note={m.pct(m.appr.length) + ' de las recibidas'} />
        <Stat label="Lanzadas" value={m.lau.length} note={m.pct(m.lau.length) + ' de las recibidas'} />
        <Stat label="Tiempo promedio" value={m.avg == null ? '—' : m.avg + ' días'} note="Desde que se propone hasta que se lanza" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>¿Hasta dónde llegan las ideas?</span>
            <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>De todas las ideas recibidas, cuántas lograron llegar a cada etapa.</span>
          </div>
          {([['Recibidas', m.all.length, '#d0d7e2'], ['Aprobadas', m.appr.length, '#b9c9e4'], ['Llegaron al Roadmap', m.inRm.length, '#9db6e6'], ['Se empezaron a desarrollar', m.dev.length, '#7aa7f5'], ['Se lanzaron', m.lau.length, '#73c48f']] as const).map(([l, n, c]) => (
            <div key={l} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 64px', gap: 12, alignItems: 'center', fontSize: 14 }}>
              <span style={{ color: 'rgba(0,0,0,0.65)' }}>{l}</span>
              <Bar pct={Math.max(2, Math.round((n / m.tot) * 100)) + '%'} color={c} h={22} />
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n} <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{m.pct(n)}</span></span>
            </div>
          ))}
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', textWrap: 'pretty' }}>Cada etapa cuenta también a las ideas que ya avanzaron a la siguiente. El porcentaje es sobre el total de ideas recibidas.</span>
        </div>
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Lanzadas por origen</span>
          {([['comunidad', 'Comunidad', '#b18ae0'], ['equipo', 'Equipo', '#7aa7f5']] as const).map(([k, l, c]) => {
            const o = byO(k);
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{l}</span><span style={{ color: 'rgba(0,0,0,0.65)' }}>{o.l} de {o.p} · {o.w}</span></div>
                <Bar pct={o.w} color={c} />
              </div>
            );
          })}
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Ideas lanzadas sobre las propuestas por cada origen.</span>
        </div>
      </div>
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', overflowX: 'auto' }}>
        <div style={{ minWidth: 760 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Ideas en curso y lanzadas</span>
            <Seg small options={[['all', 'Todas'], ['en_curso', 'En desarrollo'], ['lanzada', 'Lanzadas']]} value={f} onChange={setF} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 120px 110px 90px 130px 120px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontSize: 14, fontWeight: 600 }}>
            {['Idea', 'Origen', 'Estado', 'Votos', 'Fecha', 'Idea → hoy'].map((h) => <div key={h} style={{ padding: '12px 16px' }}>{h}</div>)}
          </div>
          {rows.map((i) => {
            const D = DEV[i.dev_status || 'por_empezar'];
            return (
              <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 120px 110px 90px 130px 120px', borderBottom: '1px solid #f0f0f0', fontSize: 14, alignItems: 'center' }}>
                <div style={{ padding: '12px 16px', minWidth: 0 }}><a onClick={() => api.openIdea(i.id)} className="bx-row-link">{i.title}</a></div>
                <div style={{ padding: '12px 16px', color: 'rgba(0,0,0,0.65)' }}>{i.origin === 'equipo' ? 'Equipo' : 'Comunidad'}</div>
                <div style={{ padding: '12px 16px' }}><Tag tone={D}>{D.l}</Tag></div>
                <div style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums' }}>{i.votes}</div>
                <div style={{ padding: '12px 16px', color: 'rgba(0,0,0,0.65)' }}>{i.dev_status === 'lanzada' ? 'Lanzada ' + ddmmyyyy(i.launched_at!) : 'Desde ' + ddmmyyyy(i.dev_at || Date.now())}</div>
                <div style={{ padding: '12px 16px', color: 'rgba(0,0,0,0.65)' }}>{m.days(i)} días</div>
              </div>
            );
          })}
          {rows.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>No hay ideas en este estado.</div>}
        </div>
      </div>
    </>
  );
}
