import Link from 'next/link';
import { Plus_Jakarta_Sans } from 'next/font/google';
import s from './landing.module.css';
import { AbcTabs } from './AbcTabs';
import { getPublicEnterprisePrice, getPublicProPrice } from '@/lib/pricing';
import { fmtPrice } from '@/lib/format';
import ContactForm from '@/components/ContactForm';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { getT } from '@/lib/i18n/server';
import { SlackLogo } from '@/components/SlackLogo';

// Landing: Trello-style layout and creatives with Boxinger's colors. Texts are the Spanish source, shown through t() (src/lib/i18n).

// Headings in a display font, self-hosted by Next (the CSP only allows fonts from this site).
const display = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--display' });

const ORI = { Comunidad: s.tagCom, Equipo: s.tagTeam } as const;
const DEMO = [
  { title: 'Exportar movimientos a Excel', origin: 'Comunidad' as const, cat: 'Feature', st: s.tagOk, status: 'Aprobada', votes: 48, comments: 12, author: 'Lucía Fernández', ini: 'LF', color: '#a8487a' },
  { title: 'Notificación cuando se acredita un pago', origin: 'Comunidad' as const, cat: 'Mejora', st: s.tagRev, status: 'En revisión', votes: 31, comments: 7, author: 'Martín Gómez', ini: 'MG', color: '#3a78b5' },
  { title: 'Conciliación automática con el banco', origin: 'Equipo' as const, cat: 'Propuesta', st: s.tagN, status: 'Pendiente de revisión', votes: 19, comments: 4, author: 'Sofía Ruiz', ini: 'SR', color: '#5b8a3a' },
];

// The public sample board (account hola@boxinger.com), filled by scripts/demo-vitrina. The scene shows some of its ideas.
const SAMPLE_BOARD = '/app/b/demo-boxinger';
const SAMPLE = [
  { title: 'Integración con Mercado Libre para sincronizar stock', cat: 'Feature', st: s.tagOk, status: 'En desarrollo', votes: 20, comments: 4, author: 'Lucía Ferreyra', ini: 'LF', color: '#a8487a' },
  { title: 'Recuperar carritos abandonados por WhatsApp', cat: 'Feature', st: s.tagOk, status: 'En desarrollo', votes: 19, comments: 3, author: 'Martín Sosa', ini: 'MS', color: '#3a78b5' },
  { title: 'Avisar al cliente cuando vuelve a haber stock', cat: 'Feature', st: s.tagN, status: 'Por empezar', votes: 15, comments: 2, author: 'Lucía Ferreyra', ini: 'LF', color: '#a8487a' },
];

const I = {
  inbox: <path d="M4 13l2.5-7h11L20 13v5a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 13h4.5l1 2h5l1-2H20" />,
  rank: <path d="M6 20v-6M12 20V6M18 20v-9" />,
  backlog: <path d="M5 6h14M5 12h14M5 18h9" />,
  matrix: <path d="M4 4v16h16M8 14l3-3 3 2 5-6" />,
  roadmap: <path d="M4 6h7M4 12h11M4 18h5M15 4v4M19 10v4M13 16v4" />,
  status: <path d="M12 3a9 9 0 109 9h-9z M14 3.2A9 9 0 0120.8 10H14z" />,
  news: <path d="M4 10v4h3l7 4.5v-13L7 10H4zM17.5 9a4.5 4.5 0 010 6" />,
  merge: <path d="M6 4v4a5 5 0 005 5h1M18 4v4a5 5 0 01-5 5h-1M12 13v7" />,
  sheet: <path d="M8 4v12m0 0l-3-3m3 3l3-3M16 20V8m0 0l-3 3m3-3l3 3" />,
  image: <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18M15.5 8.5h.01" />,
  chat: <path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-8l-4 3.5V16H5a1 1 0 01-1-1V6a1 1 0 011-1zM8 9.5h8M8 12.5h5" />,
  plug: <path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 01-11 0zM12 16.5V21" />,
};
const FEATURES = [
  { t: 'Buzón', d: 'Todas las ideas del buzón, con filtros por categoría y estado, votos y comentarios.', pro: false, icon: I.inbox, tone: s.icoGreen },
  { t: 'Ranking', d: 'Las 10 ideas con mayor puntaje entre las que están pendientes o en revisión.', pro: false, icon: I.rank, tone: s.icoViolet },
  { t: 'Backlog', d: 'Las ideas aprobadas por el equipo, candidatas para el roadmap.', pro: false, icon: I.backlog, tone: s.icoBlue },
  { t: 'Matriz', d: 'Esfuerzo contra impacto para detectar victorias rápidas y grandes apuestas.', pro: true, icon: I.matrix, tone: s.icoAmber },
  { t: 'Roadmap', d: 'Columnas propias, prioridad Alta, Media o Baja y estado de diseño y PRD por tarjeta.', pro: true, icon: I.roadmap, tone: s.icoTeal },
  { t: 'Status', d: 'Cuántas ideas se aprobaron, cuántas están en desarrollo y cuáles ya se lanzaron.', pro: true, icon: I.status, tone: s.icoPink },
  { t: 'Novedades', d: 'La página de lanzamientos del buzón: cada idea lanzada aparece sola, con quién la propuso, y avisamos a toda la comunidad.', pro: true, icon: I.news, tone: s.icoGreen },
  { t: 'Unir ideas', d: 'Juntá las ideas repetidas en una sola: pasan los votos y comentarios, y nadie pierde su lugar.', pro: true, icon: I.merge, tone: s.icoViolet },
  { t: 'Importar y exportar', d: 'Exportá todas tus ideas a Excel cuando quieras. Con Pro, importá las que ya tenés en planillas o encuestas.', pro: false, icon: I.sheet, tone: s.icoBlue },
  { t: 'Imagen en cada idea', d: 'Una captura o una foto vale más que mil palabras: quien carga la idea puede adjuntar una imagen.', pro: true, icon: I.image, tone: s.icoAmber },
  { t: 'Avisos en Slack', d: 'Las ideas nuevas, las que pasan al Roadmap y las lanzadas llegan al canal de Slack que elijas, con un resumen cada lunes.', pro: true, icon: I.chat, tone: s.icoTeal },
  { t: 'Integraciones', d: 'Conectá Zapier, Make, Google Forms o tu propio sistema y las ideas llegan solas al buzón, listas para revisar.', pro: true, icon: I.plug, tone: s.icoPink },
];

function Sparkle({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ flex: 'none' }}>
      <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="currentColor" />
      <path d="M13 11l.6 1.4 1.4.6-1.4.6L13 15l-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" />
    </svg>
  );
}
function Check() {
  return (
    <svg className={s.check} width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const Scribble = ({ d, className }: { d: string; className: string }) => (
  <svg className={className} viewBox="0 0 120 80" fill="none" aria-hidden><path d={d} stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default async function Landing() {
  const [usd, entUsd, { t, locale }] = await Promise.all([getPublicProPrice(), getPublicEnterprisePrice(), getT()]);
  const plans = [
    { name: 'Free', price: 'USD 0', per: 'para siempre', cls: '', items: ['1 equipo con 1 buzón', 'Solo vos, sin miembros', 'Buzón solo para invitados o público', 'Ideas ilimitadas', 'Votos, comentarios, Ranking y Backlog', 'Exportá tus ideas a Excel'], cta: 'Empezar gratis', ctaCls: s.ctaGhost },
    { name: 'Pro', price: 'USD ' + fmtPrice(usd, locale), per: '/ mes', cls: s.planPro, items: ['Todo lo de Free', 'Equipos y buzones ilimitados', 'Hasta 4 miembros por equipo', 'Buzones privados y acceso por miembro', 'Acceso por dominio de email', 'Matriz, Roadmap y Status', 'Importá ideas desde CSV o Excel', 'Uní ideas repetidas sin perder votos', 'Adjuntá una imagen a cada idea', 'Novedades: lo que lanzaste, para toda tu comunidad', 'Avisos en Slack', 'Ideas desde Zapier, Make y Google Forms'], cta: 'Crear cuenta', ctaCls: s.ctaGreen },
    { name: 'Team', price: 'USD ' + fmtPrice(entUsd, locale), per: '/ mes', cls: s.planEnt, badge: 'Con IA', items: ['Todo lo de Pro', 'Hasta 20 miembros por equipo', 'Invitados y buzones ilimitados', 'Asistente IA: 30 análisis y 20 sugerencias de ideas por mes, para usar entre todos tus buzones'], cta: 'Contratar Team', ctaCls: s.ctaViolet, href: '/app/perfil?tab=sub&contratar=team' },
    { name: 'Enterprise', price: 'A medida', per: '', cls: '', items: ['Todo lo de Team', 'Más miembros por equipo', 'Más uso del Asistente IA', 'Precio y facturación a medida', 'Atención directa con el equipo de Boxinger'], note: '¿Necesitás más miembros o más uso de IA? Te armamos un plan para tu empresa.', cta: 'Contactanos', ctaCls: s.ctaGhost, href: '#contacto-enterprise' },
  ];

  return (
    <div className={`${s.page} ${display.variable}`}>
      <header className={s.header}>
        <div className={s.headerIn}>
          <a href="#top" className={s.brand}><img src="/logo.svg" alt="" width={30} height={30} /><span>Boxinger</span></a>
          <nav className={s.nav}>
            <a href="#como">{t('Cómo funciona')}</a>
            <a href="#funciones">{t('Funciones')}</a>
            <a href="#ejemplo">{t('Ejemplo')}</a>
            <a href="#planes">{t('Planes')}</a>
            <a href="#contacto">{t('Contacto')}</a>
          </nav>
          <div className={s.headerCtas}>
            <Link href="/app/ingresar" className={s.login}>{t('Ingresar')}</Link>
            <Link href="/app/registro" className={s.headerCta}>{t('Crear cuenta gratis')}</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section id="top" className={s.hero}>
        <div className={s.heroIn}>
          <div className={s.heroText}>
            <h1 className={s.h1}>{t('Las ideas de tus usuarios, ordenadas en un solo buzón.')}</h1>
            <p className={s.lead}>{t('Tu comunidad propone y vota, tu equipo decide. Sin planillas sueltas ni pedidos perdidos en el chat.')}</p>
            <div className={s.ctaRow}>
              <Link href="/app/registro" className={s.btnPrimary}>{t('Crear cuenta gratis')}</Link>
              <a href="#video" className={s.videoLink}>
                {t('Ver el video')}
                <span className={s.playDot} aria-hidden><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 1.5v7l6-3.5z" fill="currentColor" /></svg></span>
              </a>
            </div>
            <span className={s.note}>{t('Plan Free sin tarjeta de crédito.')}</span>
          </div>

          <div className={s.heroArt} aria-hidden>
            <div className={s.blob} />
            <div className={`${s.chip} ${s.heroChipA}`}><b>✉️ Email</b><span>“{t('¿Pueden agregar exportar a Excel?')}”</span></div>
            <div className={`${s.chip} ${s.heroChipB}`}><b>💬 WhatsApp</b><span>“{t('Estaría bueno un aviso de pago')}”</span></div>
            <Scribble className={s.heroArrow} d="M10 10 C 30 50, 70 70, 104 58 M92 50 l12 8 l-10 10" />
            <div className={s.board}>
              <div className={s.boardHead}>
                <span className={s.boardLogo}>PP</span><span className={s.boardName}>Pampa Pagos</span>
                <div className={s.boardTabs}><span className={s.boardTabOn}>{t('Buzón')}</span><span>{t('Ranking')}</span><span>{t('Backlog')}</span></div>
              </div>
              <div className={s.boardList}>
                {DEMO.map((d) => (
                  <div key={d.title} className={s.idea}>
                    <div className={s.voteBox}><svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2l4 5H2z" fill="#059669" /></svg><span>{d.votes}</span></div>
                    <div className={s.ideaBody}>
                      <div className={s.tagsRow}><span className={ORI[d.origin]}>{t(d.origin)}</span><span className={s.tagN}>{t(d.cat)}</span><span className={d.st}>{t(d.status)}</span></div>
                      <span className={s.ideaTitle}>{t(d.title)}</span>
                      <div className={s.ideaMeta}><span className={s.avatar} style={{ background: d.color }}>{d.ini}</span>{d.author}<span>·</span>💬 {d.comments}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${s.sticker} ${s.heroSticker}`}>+1 {t('Importante')}</div>
            <div className={s.aiCard}>
              <span className={s.aiHead}><Sparkle />{t('Asistente IA')}<span className={s.aiPill}>Team</span></span>
              <span className={s.aiLabel}>{t('Mejor candidata para el Backlog')}</span>
              <span className={s.aiTitle}>{t('Notificación cuando se acredita un pago')}</span>
              <span className={s.aiWhy}>{t('31 votos y 7 comentarios: es lo que más piden y baja las consultas al soporte, el objetivo del trimestre.')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── ABC (tabs) ── */}
      <section id="como" className={s.section}>
        <div className={s.head}>
          <span className={s.kicker}>{t('El ABC de Boxinger')}</span>
          <h2 className={s.h2}>{t('Cada idea sigue el mismo recorrido, desde que alguien la propone hasta que se lanza.')}</h2>
        </div>
        <AbcTabs />
      </section>

      {/* ── Video ── */}
      <section className={s.videoSec}>
        <div className={s.videoIn}>
          <div className={s.head} style={{ alignItems: 'center', textAlign: 'center', margin: '0 auto' }}>
            <h2 className={s.h2}>{t('Conocé Boxinger')}</h2>
            <p className={s.sub}>{t('Un recorrido rápido por el buzón, los votos, el Backlog y el Roadmap.')}</p>
          </div>
          <figure id="video" className={s.videoFrame}>
            <div className={s.videoDeco} aria-hidden />
            <video controls playsInline preload="none" poster="/video/boxinger-como-funciona-v2.jpg" width={1920} height={1080} aria-label={t('Video: cómo funciona Boxinger')}>
              <source src="/video/boxinger-como-funciona-v2.mp4" type="video/mp4" />
            </video>
            {locale === 'en' && <figcaption className={s.note}>Video in Spanish, with on-screen captions.</figcaption>}
          </figure>
        </div>
      </section>

      {/* ── Sample board ── */}
      <section id="ejemplo" className={s.sample}>
        <div className={s.sampleIn}>
          <div className={s.sampleText}>
            <span className={s.kicker}>{t('Buzón de ejemplo')}</span>
            <h2 className={s.h2}>{t('Mirá un buzón funcionando')}</h2>
            <p className={s.sub}>{t('Recorré el buzón de Vitrina, una tienda online inventada para este ejemplo: ideas con votos y comentarios, el Ranking, el Backlog, el Roadmap y las Novedades. No hace falta crear una cuenta.')}</p>
            <div className={s.ctaRow}>
              <a href={SAMPLE_BOARD} target="_blank" rel="noopener" className={s.btnPrimary}>{t('Abrir el buzón de ejemplo')}<span className={s.ext} aria-hidden>↗</span></a>
            </div>
            <span className={s.note}>{t('Las ideas y las personas son ficticias.')}</span>
          </div>
          <a href={SAMPLE_BOARD} target="_blank" rel="noopener" className={s.sampleArt} aria-label={t('Abrir el buzón de ejemplo')}>
            <div className={s.sampleBoard}>
              <div className={s.boardHead}>
                <span className={`${s.boardLogo} ${s.sampleLogo}`}>V</span><span className={s.boardName}>{t('Ideas para Vitrina')}</span>
                <div className={s.boardTabs}><span>{t('Buzón')}</span><span className={s.boardTabOn}>{t('Roadmap')}</span><span>{t('Novedades')}</span></div>
              </div>
              <div className={s.boardList}>
                {SAMPLE.map((d) => (
                  <div key={d.title} className={s.idea}>
                    <div className={s.voteBox}><svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2l4 5H2z" fill="#059669" /></svg><span>{d.votes}</span></div>
                    <div className={s.ideaBody}>
                      <div className={s.tagsRow}><span className={s.tagCom}>{t('Comunidad')}</span><span className={s.tagN}>{t(d.cat)}</span><span className={d.st}>{t(d.status)}</span></div>
                      <span className={s.ideaTitle}>{t(d.title)}</span>
                      <div className={s.ideaMeta}><span className={s.avatar} style={{ background: d.color }}>{d.ini}</span>{d.author}<span>·</span>💬 {d.comments}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${s.sticker} ${s.sampleSticker}`} aria-hidden>🚀 {t('Lanzada')}</div>
          </a>
        </div>
      </section>

      {/* ── Green band with cards ── */}
      <section className={s.band}>
        <div className={s.bandIn}>
          <div className={s.head} style={{ alignItems: 'center', textAlign: 'center', margin: '0 auto' }}>
            <h2 className={s.h2Light}>{t('De la sugerencia suelta a la decisión')}</h2>
            <p className={s.subLight}>{t('Traé lo que ya tenés, conectá tus herramientas, dejá que la IA te ayude a elegir y avisale a tu comunidad cuando sus ideas avanzan.')}</p>
          </div>

          <div className={s.card}>
            <div className={`${s.cardArt} ${s.artMint}`} aria-hidden>
              <div className={`${s.paper} ${s.sheet}`}>
                <div className={s.sheetHead}><span>A</span><span>B</span><span>C</span></div>
                {['Exportar a Excel', 'Aviso de pago', 'Modo oscuro', 'Pagar con QR'].map((r, n) => (
                  <div key={r} className={s.sheetRow}><span>{n + 2}</span><span>{t(r)}</span><span>{['15/03', '02/05', '11/06', '20/07'][n]}</span></div>
                ))}
              </div>
              <Scribble className={s.cardArrow} d="M8 40 C 40 10, 76 10, 108 36 M96 30 l12 6 l-6 12" />
              <div className={`${s.paper} ${s.imported}`}>
                <div className={s.miniIdea}><span className={s.tagImp}>{t('Importada')}</span>{t('Exportar a Excel')}</div>
                <div className={s.miniIdea}><span className={s.tagImp}>{t('Importada')}</span>{t('Aviso de pago')}</div>
              </div>
              <div className={`${s.sticker} ${s.stickerExport}`}>⬇ {t('Exportar a Excel')}</div>
            </div>
            <div className={s.cardText}>
              <span className={s.cardKicker}><span className={s.kickIco}>⇅</span>{t('Importar y exportar')}</span>
              <p className={s.cardP}>{t('¿Tenés opiniones en planillas, encuestas o tu sistema de soporte? Subí un CSV o Excel y entran al buzón con su fecha original, listas para votar. Y cuando quieras, exportá todas tus ideas a Excel.')}</p>
              <span className={s.planHint}>{t('Exportar: todos los planes · Importar: Pro, Team y Enterprise')}</span>
            </div>
          </div>

          <div className={`${s.card} ${s.cardFlip}`}>
            <div className={`${s.cardArt} ${s.artViolet}`} aria-hidden>
              <div className={`${s.paper} ${s.aiPanel}`}>
                <span className={s.aiHead}><Sparkle />{t('Asistente IA')}</span>
                {[['Recordatorio de vencimientos', 'Lo piden clientes de cobranzas'], ['Exportar a contabilidad', 'Ahorra tiempo al cierre de mes'], ['Pagos recurrentes', 'Alineado con retener clientes']].map(([ti, why]) => (
                  <div key={ti} className={s.aiSug}><b>{t(ti)}</b><span>{t(why)}</span><i>{t('Agregar al buzón')}</i></div>
                ))}
              </div>
              <div className={`${s.sticker} ${s.stickerAi}`}><Sparkle size={14} /> {t('Sugerencias según tu producto')}</div>
            </div>
            <div className={s.cardText}>
              <span className={s.cardKicker}><span className={`${s.kickIco} ${s.kickViolet}`}><Sparkle size={12} /></span>{t('Asistente IA')}</span>
              <p className={s.cardP}>{t('Contale de qué se trata tu producto y te sugiere ideas nuevas, o analiza el buzón y te dice cuáles conviene pasar al Backlog y por qué.')}</p>
              <span className={`${s.planHint} ${s.planHintViolet}`}>Team · Enterprise</span>
            </div>
          </div>

          <div className={s.card}>
            <div className={`${s.cardArt} ${s.artAmber}`} aria-hidden>
              <div className={`${s.paper} ${s.mail}`}>
                <span className={s.mailFrom}><img src="/logo.svg" alt="" width={18} height={18} />Boxinger</span>
                <b>{t('Tu idea está en el Roadmap')}</b>
                <span>{t('El Equipo de Pampa Pagos sumó «Exportar a Excel» a su Roadmap. Te avisamos cuando se lance.')}</span>
                <i>{t('Ver la idea')}</i>
              </div>
              <div className={`${s.paper} ${s.bell}`}>🔔 <span>{t('¡Se lanzó «Exportar a Excel»!')}</span></div>
            </div>
            <div className={s.cardText}>
              <span className={s.cardKicker}><span className={`${s.kickIco} ${s.kickAmber}`}>🔔</span>{t('Reconocimiento y Novedades')}</span>
              <p className={s.cardP}>{t('Cuando una idea entra al Roadmap y cuando se lanza, Boxinger le avisa a quien la propuso y a quienes la votaron, y la suma a Novedades, la página de lanzamientos de tu buzón. Tu comunidad ve que la escuchás.')}</p>
              <span className={s.planHint}>Pro · Team · Enterprise</span>
            </div>
          </div>

          <div className={`${s.card} ${s.cardFlip}`}>
            <div className={`${s.cardArt} ${s.artBlue}`} aria-hidden>
              <div className={`${s.paper} ${s.slackMsg}`}>
                <span className={s.slackChan}><SlackLogo size={14} />#ideas-clientes</span>
                <div className={s.slackRow}>
                  <img src="/logo.svg" alt="" width={30} height={30} />
                  <div>
                    <span className={s.slackWho}>Boxinger <i>APP</i></span>
                    <span>💡 <b>{t('Nueva idea')}</b> {t('en Pampa Pagos')}</span>
                    <span className={s.slackLink}>{t('Exportar movimientos a Excel')}</span>
                    <span className={s.slackMeta}>{t('Comunidad · por Lucía Fernández')}</span>
                  </div>
                </div>
              </div>
              <div className={`${s.sticker} ${s.stickerTools}`}>Zapier · Make · Google Forms</div>
            </div>
            <div className={s.cardText}>
              <span className={s.cardKicker}><span className={`${s.kickIco} ${s.kickBlue}`}>⚡</span>{t('Integraciones')}</span>
              <p className={s.cardP}>{t('Tu equipo se entera en Slack cuando llega una idea, pasa al Roadmap o se lanza. Y con Zapier, Make o Google Forms, las ideas de otras herramientas llegan solas al buzón, listas para revisar.')}</p>
              <span className={s.planHint}>Pro · Team · Enterprise</span>
              <Link href="/slack" className={s.cardLink}>{t('Cómo funciona con Slack')} →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="funciones" className={s.section}>
        <div className={s.head}>
          <span className={s.kicker}>{t('Funciones')}</span>
          <h2 className={s.h2}>{t('Todo el recorrido en un lugar')}</h2>
          <p className={s.sub}>{t('Todo lo que necesitás para escuchar a tu comunidad, decidir qué construir y mostrar lo que lanzaste.')}</p>
        </div>
        <div className={s.features}>
          {FEATURES.map((f) => (
            <div key={f.t} className={s.feature}>
              <span className={`${s.ico} ${f.tone}`}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{f.icon}</svg></span>
              <div className={s.featureHead}><span className={s.featureT}>{t(f.t)}</span>{f.pro && <span className={s.pro}>PRO</span>}</div>
              <p className={s.featureD}>{t(f.d)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="planes" className={s.plansSec}>
        <div className={s.section}>
          <div className={s.head} style={{ alignItems: 'center', textAlign: 'center', margin: '0 auto' }}>
            <h2 className={s.h2}>{t('Planes')}</h2>
            <p className={s.sub}>{t('Empezá gratis con un buzón. Pasá a Pro para sumar a tu equipo, a Team para equipos más grandes y el Asistente IA, o hablemos de Enterprise si necesitás algo a medida.')}</p>
          </div>
          <div className={s.plans}>
            {plans.map((p) => (
              <div key={p.name} className={`${s.plan} ${p.cls}`}>
                <div className={s.planHead}>
                  <span className={s.planName}>{p.name}{'badge' in p && p.badge && <span className={s.entBadge}><Sparkle size={11} />{t(p.badge)}</span>}</span>
                  <div className={s.priceRow}><span className={s.price}>{t(p.price)}</span>{p.per && <span className={s.per}>{t(p.per)}</span>}</div>
                </div>
                <div className={s.items}>{p.items.map((it) => <div key={it} className={s.item}><Check /><span>{t(it)}</span></div>)}</div>
                {'note' in p && p.note && <span className={s.planNote}>{t(p.note)}</span>}
                {'href' in p && p.href
                  ? <a href={p.href} className={`${s.planCta} ${p.ctaCls}`}>{t(p.cta)}</a>
                  : <Link href="/app/registro" className={`${s.planCta} ${p.ctaCls}`}>{t(p.cta)}</Link>}
              </div>
            ))}
          </div>
          <div className={s.payWays}>
            <div className={s.payWay}><span className={s.payName}><img src="/pay/mercadopago.svg" alt="" width={24} height={24} />Mercado Pago</span><span>{t('Para pagos en Argentina, en pesos.')}</span><span className={s.payCards}>{t('Todas las tarjetas de crédito.')}</span></div>
            <div className={s.payWay}><img src="/pay/creem.svg" alt="Creem" className={s.payLogo} width={93} height={20} /><span>{t('Para pagos internacionales, en dólares, desde cualquier país.')}</span><span className={s.payCards}>{t('Todas las tarjetas de crédito, Apple Pay y Google Pay.')}</span></div>
          </div>
          <p className={s.payNote}><Check />{t('Pago mensual recurrente: se cobra solo cada mes y podés cancelar cuando quieras desde Mi perfil, sin costo.')}</p>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contacto" className={s.contact}>
        <div className={s.contactIn}>
          <div className={s.contactText}>
            <span id="contacto-enterprise" className={s.anchor} />
            <h2 className={s.h2}>{t('Hablemos')}</h2>
            <p className={s.sub}>{t('¿Tenés una duda, necesitás ayuda o querés conocer el plan Enterprise para tu empresa? Escribinos y te respondemos por email.')}</p>
            <div className={s.contactAlt}><span>{t('También podés escribirnos a')}</span><a href="mailto:hola@boxinger.com">hola@boxinger.com</a></div>
          </div>
          <div className={s.contactCard}><ContactForm hashTopic /></div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className={s.final}>
        <div className={`${s.chip} ${s.finalChipA}`} aria-hidden><b>💡 {t('Idea')}</b><span>“{t('Pagar con QR sería ideal')}”</span></div>
        <div className={`${s.sticker} ${s.finalSticker}`} aria-hidden>✓ {t('Aprobada')}</div>
        <h2 className={s.finalH}>{t('Abrí tu primer buzón hoy.')}</h2>
        <p className={s.sub}>{t('Plan Free sin tarjeta de crédito.')}</p>
        <div className={s.ctaRow} style={{ justifyContent: 'center' }}>
          <Link href="/app/registro" className={s.btnPrimary}>{t('Crear cuenta gratis')}</Link>
          <Link href="/app/ingresar" className={s.btnGhostLg}>{t('Ingresar')}</Link>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.footerIn}>
          <div className={s.footBrand}>
            <span className={s.brand}><img src="/logo.svg" alt="" width={28} height={28} /><span>Boxinger</span></span>
            <span className={s.footTag}>{t('Buzón de ideas para equipos de producto.')}</span>
          </div>
          <div className={s.footCol}><b>{t('Producto')}</b><a href="#como">{t('Cómo funciona')}</a><a href="#funciones">{t('Funciones')}</a><a href={SAMPLE_BOARD} target="_blank" rel="noopener">{t('Buzón de ejemplo')}</a><a href="#planes">{t('Planes')}</a><Link href="/slack">{t('Boxinger para Slack')}</Link></div>
          <div className={s.footCol}><b>{t('Legales')}</b><Link href="/terminos">{t('Términos')}</Link><Link href="/privacidad">{t('Privacidad')}</Link><Link href="/seguridad">{t('Seguridad')}</Link><Link href="/arrepentimiento">{t('Botón de arrepentimiento')}</Link></div>
          <div className={s.footCol}><b>{t('Contacto')}</b><a href="mailto:hola@boxinger.com">hola@boxinger.com</a><a href="#contacto">{t('Escribinos')}</a></div>
        </div>
        <div className={s.footBottom}>
          <span>© 2026 Boxinger · www.boxinger.com</span>
          <LanguageSwitch style={{ color: 'rgba(255,255,255,0.7)' }} />
        </div>
      </footer>
    </div>
  );
}
