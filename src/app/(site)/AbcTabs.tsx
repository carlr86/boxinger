'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import s from './landing.module.css';

// "The ABC of Boxinger": four steps on the left, an illustration of each on the right (like Trello's slider).
// It moves on by itself until someone picks a step; with reduced motion it stays still.

const STEPS = [
  { k: 'in', t: 'Recibí ideas', d: 'Invitá a tus clientes y a tu equipo. Cargan propuestas con título, descripción y categoría, y solo ven el buzón quienes invitás.' },
  { k: 'vote', t: 'La comunidad vota', d: 'Cada idea se vota como Importante, Interesante o No importante. El Ranking muestra las que más interesan.' },
  { k: 'review', t: 'El equipo revisa', d: 'El equipo aprueba o rechaza cada idea con un motivo visible. Las aprobadas pasan al Backlog.' },
  { k: 'ship', t: 'Priorizá y lanzá', d: 'Calificá esfuerzo e impacto, ordená el Roadmap y avisá a quienes la pidieron cuando se lanza.' },
] as const;

const Arrow = ({ d, className }: { d: string; className?: string }) => (
  <svg className={className} viewBox="0 0 120 80" fill="none" aria-hidden>
    <path d={d} stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function AbcTabs() {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setTimeout(() => setI((x) => (x + 1) % STEPS.length), 6500);
    return () => clearTimeout(id);
  }, [i, auto]);
  const pick = (n: number) => { setI(n); setAuto(false); };
  const k = STEPS[i].k;

  return (
    <div className={s.abc}>
      <div className={s.abcList} role="tablist" aria-label={t('Cómo funciona')}>
        {STEPS.map((st, n) => (
          <button key={st.k} type="button" role="tab" aria-selected={n === i} className={n === i ? s.abcItemOn : s.abcItem} onClick={() => pick(n)}>
            <span className={s.abcN}>0{n + 1}</span>
            <span className={s.abcT}>{t(st.t)}</span>
            <span className={s.abcD}>{t(st.d)}</span>
            {n === i && auto && <span key={i} className={s.abcBar} />}
          </button>
        ))}
      </div>

      <div className={`${s.stage} ${k === 'vote' ? s.stageViolet : k === 'review' ? s.stageTeal : k === 'ship' ? s.stageDeep : ''}`} role="tabpanel" aria-live="polite">
        {k === 'in' && (
          <div className={s.scene} key="in">
            <div className={`${s.chip} ${s.chipMail}`}><b>✉️ Email</b><span>“{t('¿Pueden agregar exportar a Excel?')}”</span></div>
            <div className={`${s.chip} ${s.chipChat}`}><b>💬 WhatsApp</b><span>“{t('Estaría bueno un aviso de pago')}”</span></div>
            <div className={`${s.chip} ${s.chipSheet}`}><b>📊 Planilla</b><span>{t('124 ideas para importar')}</span></div>
            <Arrow className={s.arrowIn} d="M8 14 C 40 4, 78 18, 96 54 M84 50 l12 6 l2 -13" />
            <div className={`${s.paper} ${s.formCard}`}>
              <span className={s.paperHead}>{t('Nueva idea')}</span>
              <span className={s.field}>{t('Exportar movimientos a Excel')}</span>
              <span className={`${s.field} ${s.fieldTall}`}>{t('Necesito bajar los reportes para compartirlos con mi equipo.')}</span>
              <div className={s.pills}><span className={s.pillOn}>Feature</span><span className={s.pillOff}>{t('Mejora')}</span><span className={s.pillOff}>{t('Error')}</span></div>
              <span className={s.btnFake}>{t('Publicar idea')}</span>
            </div>
          </div>
        )}
        {k === 'vote' && (
          <div className={s.scene} key="vote">
            <div className={`${s.paper} ${s.voteCard}`}>
              <div className={s.tagsRow}><span className={s.tagCom}>{t('Comunidad')}</span><span className={s.tagN}>Feature</span></div>
              <span className={s.paperTitle}>{t('Notificación cuando se acredita un pago')}</span>
              <div className={s.voteMenu}>
                <span className={s.voteOpt}><i style={{ background: '#059669' }} />{t('Importante')}</span>
                <span className={`${s.voteOpt} ${s.voteOptOn}`}><i style={{ background: '#d97706' }} />{t('Interesante')}</span>
                <span className={s.voteOpt}><i style={{ background: '#bfbfbf' }} />{t('No importante')}</span>
              </div>
              <svg className={s.cursor} width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M4 3l7 17 2.5-7.5L21 10z" fill="#1f2a27" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            </div>
            <div className={`${s.paper} ${s.rankCard}`}>
              <span className={s.paperHead}>Ranking</span>
              {[['Exportar movimientos a Excel', 96], ['Notificación cuando se acredita un pago', 71], ['Modo oscuro', 40]].map(([ti, n], x) => (
                <div key={ti as string} className={s.rankRow}><span className={s.rankN}>{x + 1}</span><span className={s.rankT}>{t(ti as string)}</span><span className={s.rankBar}><i style={{ width: `${n}%` }} /></span></div>
              ))}
            </div>
            <div className={`${s.sticker} ${s.stickerVote}`}>+1 {t('Importante')}</div>
          </div>
        )}
        {k === 'review' && (
          <div className={s.scene} key="review">
            <div className={`${s.paper} ${s.reviewCard}`}>
              <div className={s.tagsRow}><span className={s.tagCom}>{t('Comunidad')}</span><span className={s.tagRev}>{t('En revisión')}</span></div>
              <span className={s.paperTitle}>{t('Exportar movimientos a Excel')}</span>
              <span className={s.paperText}>{t('48 votos · 12 comentarios')}</span>
              <div className={s.reviewBtns}><span className={s.btnFake}>{t('Aprobar')}</span><span className={s.btnGhost}>{t('Rechazar')}</span></div>
            </div>
            <Arrow className={s.arrowReview} d="M10 20 C 44 60, 80 64, 106 40 M94 36 l12 4 l-4 12" />
            <div className={`${s.paper} ${s.backlogCard}`}>
              <span className={s.paperHead}>Backlog</span>
              <div className={s.miniIdea}><span className={s.tagOk}>{t('Aprobada')}</span>{t('Exportar movimientos a Excel')}</div>
              <div className={s.miniIdea}><span className={s.tagOk}>{t('Aprobada')}</span>{t('Pagar con QR')}</div>
            </div>
            <div className={`${s.sticker} ${s.stickerOk}`}>✓ {t('Pasó al Backlog')}</div>
          </div>
        )}
        {k === 'ship' && (
          <div className={s.scene} key="ship">
            <div className={`${s.paper} ${s.roadmap}`}>
              {[['Ahora', ['Exportar a Excel', 'Pagar con QR']], ['Siguiente', ['Aviso de pago']], ['Después', ['Modo oscuro', 'Reportes en PDF']]].map(([col, cards]) => (
                <div key={col as string} className={s.rmCol}>
                  <span className={s.rmHead}>{t(col as string)}</span>
                  {(cards as string[]).map((c) => <span key={c} className={s.rmCard}>{t(c)}</span>)}
                </div>
              ))}
            </div>
            <Arrow className={s.arrowShip} d="M10 8 C 14 40, 40 66, 100 66 M88 58 l12 8 l-12 8" />
            <div className={`${s.sticker} ${s.stickerShip}`}>🚀 {t('Lanzada')}</div>
            <div className={`${s.paper} ${s.notice}`}>
              <span className={s.noticeIcon}>🎉</span>
              <div><b>{t('¡Se lanzó «Exportar a Excel»!')}</b><span>{t('Le avisamos a las 48 personas que la votaron.')}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
