import Link from 'next/link';
import s from './landing.module.css';
import { getPublicEnterprisePrice, getPublicProPrice } from '@/lib/pricing';
import { fmtPrice } from '@/lib/format';
import ContactForm from '@/components/ContactForm';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { getT } from '@/lib/i18n/server';

// Texts below are the Spanish source; the page shows them through t() (src/lib/i18n).

// Same colors as the app (src/lib/constants.ts: IDEA_STATUS and ORIGIN).
const ST = {
  ok: { bd: '#b7eb8f', bg: '#f6ffed', fg: '#389e0d' },
  rev: { bd: '#ffd591', bg: '#fff7e6', fg: '#d46b08' },
  pend: { bd: '#d9d9d9', bg: '#fafafa', fg: 'rgba(0,0,0,0.65)' },
} as const;
const ORI = {
  Comunidad: { bd: '#d3adf7', bg: '#f9f0ff', fg: '#531dab' },
  Equipo: { bd: '#93c5fd', bg: '#eff6ff', fg: '#3b82f6' },
} as const;

const DEMO = [
  { title: 'Exportar movimientos a Excel', origin: 'Comunidad' as const, cat: 'Feature', st: ST.ok, status: 'Aprobada', votes: 48, comments: 12, author: 'Lucía Fernández', ini: 'LF', color: '#a8487a' },
  { title: 'Notificación cuando se acredita un pago', origin: 'Comunidad' as const, cat: 'Mejora', st: ST.rev, status: 'En revisión', votes: 31, comments: 7, author: 'Martín Gómez', ini: 'MG', color: '#3a78b5' },
  { title: 'Conciliación automática con el banco', origin: 'Equipo' as const, cat: 'Propuesta', st: ST.pend, status: 'Pendiente de revisión', votes: 19, comments: 4, author: 'Sofía Ruiz', ini: 'SR', color: '#5b8a3a' },
];

function Sparkle({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ flex: 'none' }}>
      <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="currentColor" />
      <path d="M13 11l.6 1.4 1.4.6-1.4.6L13 15l-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" />
    </svg>
  );
}

const STEPS = [
  { n: '01', t: 'Recibí ideas', d: 'Invitá a tus clientes y a tu equipo. Cargan propuestas con título, descripción y categoría, y solo ven el buzón quienes invitás.' },
  { n: '02', t: 'La comunidad vota', d: 'Cada idea se vota como Importante, Interesante o No importante. El Ranking muestra las que más interesan.' },
  { n: '03', t: 'El equipo revisa', d: 'El equipo aprueba o rechaza cada idea con un motivo visible. Las aprobadas pasan al Backlog.' },
  { n: '04', t: 'Priorizá y lanzá', d: 'Calificá esfuerzo e impacto, ordená el Roadmap y seguí en Status cuántas ideas terminan lanzadas.' },
];

const FEATURES = [
  { t: 'Buzón', d: 'Todas las ideas del buzón, con filtros por categoría y estado, votos y comentarios.', pro: false },
  { t: 'Ranking', d: 'Las 10 ideas con mayor puntaje entre las que están pendientes o en revisión.', pro: false },
  { t: 'Backlog', d: 'Las ideas aprobadas por el equipo, candidatas para el roadmap.', pro: false },
  { t: 'Matriz', d: 'Esfuerzo contra impacto para detectar victorias rápidas y grandes apuestas.', pro: true },
  { t: 'Roadmap', d: 'Columnas propias, prioridad Alta, Media o Baja y estado de diseño y PRD por tarjeta.', pro: true },
  { t: 'Status', d: 'Cuántas ideas se aprobaron, cuántas están en desarrollo y cuáles ya se lanzaron.', pro: true },
];

function Check() {
  return (
    <svg className={s.check} width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Landing() {
  const [usd, entUsd, { t, locale }] = await Promise.all([getPublicProPrice(), getPublicEnterprisePrice(), getT()]);
  const plans = [
    {
      name: 'Free', price: 'USD 0', per: 'para siempre', bd: '#f0f0f0',
      items: ['1 equipo con 1 buzón', 'Solo vos, sin miembros', 'Buzón solo para invitados o público', 'Ideas ilimitadas', 'Votos, comentarios, Ranking y Backlog'],
      cta: 'Empezar gratis', ctaBg: '#fff', ctaFg: 'rgba(0,0,0,0.88)', ctaBd: '#d9d9d9',
    },
    {
      name: 'Pro', price: 'USD ' + fmtPrice(usd, locale), per: '/ mes', bd: '#059669',
      items: ['Todo lo de Free', 'Equipos y buzones ilimitados', 'Hasta 4 miembros por equipo', 'Buzones privados y acceso por miembro', 'Acceso por dominio de email', 'Matriz, Roadmap y Status', 'Importá ideas desde CSV o Excel'],
      cta: 'Crear cuenta', ctaBg: '#059669', ctaFg: '#fff', ctaBd: '#059669',
    },
    {
      name: 'Enterprise', price: 'USD ' + fmtPrice(entUsd, locale), per: '/ mes', bd: '#c7d2fe', badge: 'Con IA',
      items: ['Todo lo de Pro', 'Hasta 20 miembros por equipo', 'Invitados y buzones ilimitados', 'Asistente IA: 30 análisis y 20 sugerencias de ideas por mes, para usar entre todos tus buzones'],
      note: '¿Necesitás más miembros o más uso de IA? Te armamos un precio a medida.', noteHref: '#contacto-enterprise',
      cta: 'Contratar Enterprise', ctaBg: '#4338ca', ctaFg: '#fff', ctaBd: '#4338ca', href: '/app/perfil?tab=sub&contratar=enterprise',
    },
  ];

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerIn}>
          <a href="#top" className={s.brand}>
            <img src="/logo.svg" alt="" width={30} height={30} className={s.logo} />
            <span className={s.brandName}>Boxinger</span>
          </a>
          <nav className={s.nav}>
            <a href="#como" className={s.navLink}>{t('Cómo funciona')}</a>
            <a href="#funciones" className={s.navLink}>{t('Funciones')}</a>
            <a href="#planes" className={s.navLink}>{t('Planes')}</a>
            <a href="#contacto" className={s.navLink}>{t('Contacto')}</a>
          </nav>
          <div className={s.headerCtas}>
            <Link href="/app/ingresar" className={s.btnSm}>{t('Ingresar')}</Link>
            <Link href="/app/registro" className={s.btnSmPrimary}>{t('Crear cuenta')}</Link>
          </div>
        </div>
      </header>

      <section id="top" className={s.hero}>
        <div className={s.heroIn}>
          <div className={s.heroText}>
            <span className={s.eyebrow}>PRODUCT DISCOVERY</span>
            <h1 className={s.h1}>{t('Las ideas de tus usuarios, ordenadas en un solo buzón.')}</h1>
            <p className={s.lead}>
              {t('Boxinger reúne las propuestas de tu comunidad y de tu equipo. La comunidad vota, el equipo revisa y las ideas aprobadas pasan al backlog, la matriz de esfuerzo e impacto y el roadmap.')}
            </p>
            <div className={s.ctaRow}>
              <Link href="/app/registro" className={s.btnLgPrimary}>{t('Crear cuenta gratis')}</Link>
              <Link href="/app/ingresar" className={s.btnLg}>{t('Ya tengo cuenta')}</Link>
            </div>
            <div className={s.heroFoot}>
              <span className={s.note}>{t('Plan Free sin tarjeta de crédito.')}</span>
              <a href="#video" className={s.videoLink}>
                <span className={s.playDot} aria-hidden><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 1.5v7l6-3.5z" fill="currentColor" /></svg></span>
                {t('Mirá cómo funciona en 1:40')}
              </a>
            </div>
          </div>

          <div className={s.mockWrap} aria-hidden>
            <div className={s.mock}>
              <div className={s.mockHead}>
                <span className={s.mockLogo}>PP</span>
                <span className={s.mockName}>Pampa Pagos</span>
                <div className={s.mockTabs}>
                  <span className={s.mockTabActive}>{t('Buzón')}</span><span>{t('Ranking')}</span><span>{t('Backlog')}</span><span>{t('Roadmap')}</span>
                </div>
              </div>
              <div className={s.mockList}>
                {DEMO.map((d) => (
                  <div key={d.title} className={s.mockCard}>
                    <div className={s.voteBox}>
                      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2l4 5H2z" fill="#059669" /></svg>
                      <span className={s.voteN}>{d.votes}</span>
                    </div>
                    <div className={s.mockBody}>
                      <div className={s.tags}>
                        <span className={s.tag} style={{ borderColor: ORI[d.origin].bd, background: ORI[d.origin].bg, color: ORI[d.origin].fg }}>{t(d.origin)}</span>
                        <span className={s.tag}>{t(d.cat)}</span>
                        <span className={s.tag} style={{ borderColor: d.st.bd, background: d.st.bg, color: d.st.fg }}>{t(d.status)}</span>
                      </div>
                      <span className={s.mockTitle}>{t(d.title)}</span>
                      <div className={s.mockMeta}>
                        <span className={s.mockAvatar} style={{ background: d.color }}>{d.ini}</span>
                        <span>{d.author}</span>
                        <span className={s.mockDot}>·</span>
                        <span className={s.mockComments}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                          {d.comments}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Enterprise AI assistant: what the team sees when it asks for the best candidate. */}
            <div className={s.aiCard}>
              <span className={s.aiHead}><Sparkle />{t('Asistente IA')}<span className={s.aiPill}>Enterprise</span></span>
              <span className={s.aiLabel}>{t('Mejor candidata para el Backlog')}</span>
              <span className={s.aiTitle}>{t('Notificación cuando se acredita un pago')}</span>
              <span className={s.aiWhy}>{t('31 votos y 7 comentarios: es lo que más piden y baja las consultas al soporte, el objetivo del trimestre.')}</span>
              <div className={s.aiFoot}>
                <span className={s.tag} style={{ borderColor: '#b7eb8f', background: '#f6ffed', color: '#389e0d' }}>{t('Confianza alta')}</span>
                <span className={s.aiBtn}>{t('Aprobar')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="como" className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.h2}>{t('Cómo funciona')}</h2>
          <p className={s.sub}>{t('Cada idea sigue el mismo recorrido, desde que alguien la propone hasta que se lanza.')}</p>
        </div>
        <figure id="video" className={s.video}>
          {/* preload="none": the 7 MB file only downloads when someone presses play */}
          <video controls playsInline preload="none" poster="/video/boxinger-como-funciona.jpg" width={1920} height={1080}
            aria-label={t('Video: cómo funciona Boxinger')}>
            <source src="/video/boxinger-como-funciona.mp4" type="video/mp4" />
          </video>
          {locale === 'en' && <figcaption className={s.note}>Video in Spanish, with on-screen captions.</figcaption>}
        </figure>
        <div className={s.steps}>
          {STEPS.map((st) => (
            <div key={st.n} className={s.step}>
              <span className={s.stepN}>{st.n}</span>
              <span className={s.stepT}>{t(st.t)}</span>
              <p className={s.stepD}>{t(st.d)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="funciones" className={s.dark}>
        <div className={s.section} style={{ maxWidth: 1120 }}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>{t('Todo el recorrido en un lugar')}</h2>
            <p className={s.subDark}>{t('Cada buzón tiene seis secciones. La comunidad participa en las tres primeras y el equipo gestiona el resto.')}</p>
          </div>
          <div className={s.features}>
            {FEATURES.map((f) => (
              <div key={f.t} className={s.feature}>
                <div className={s.featureHead}>
                  <span className={s.featureT}>{t(f.t)}</span>
                  {f.pro && <span className={s.pro}>PRO</span>}
                </div>
                <p className={s.featureD}>{t(f.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="planes" className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.h2}>{t('Planes')}</h2>
          <p className={s.sub}>{t('Empezá gratis con un buzón. Pasá a Pro cuando quieras sumar a tu equipo, o a Enterprise para equipos más grandes y el Asistente IA.')}</p>
        </div>
        <div className={s.plans}>
          {plans.map((p) => (
            <div key={p.name} className={s.plan} style={{ border: '1px solid ' + p.bd }}>
              <div className={s.planHead}>
                <span className={s.planName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{p.name}{'badge' in p && p.badge && <span className={s.enterpriseBadge}>{t(p.badge)}</span>}</span>
                <div className={s.priceRow}><span className={s.price}>{t(p.price)}</span><span className={s.per}>{p.per && t(p.per)}</span></div>
              </div>
              <div className={s.items}>
                {p.items.map((it) => (
                  <div key={it} className={s.item}><Check /><span>{t(it)}</span></div>
                ))}
              </div>
              {'note' in p && p.note && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', textWrap: 'pretty' }}>{t(p.note)} <a href={p.noteHref} style={{ color: '#4338ca' }}>{t('Contactanos')}</a></span>}
              {'href' in p && p.href
                ? <a href={p.href} className={s.planCta} style={{ background: p.ctaBg, color: p.ctaFg, border: '1px solid ' + p.ctaBd }}>{t(p.cta)}</a>
                : <Link href="/app/registro" className={s.planCta} style={{ background: p.ctaBg, color: p.ctaFg, border: '1px solid ' + p.ctaBd }}>{t(p.cta)}</Link>}
            </div>
          ))}
        </div>
        {/* How Pro and Enterprise are paid. */}
        <div className={s.payInfo}>
          <div className={s.payWays}>
            {[
              ['Mercado Pago', 'Para pagos en Argentina, en pesos.', 'Todas las tarjetas de crédito.'],
              ['Creem', 'Para pagos internacionales, en dólares, desde cualquier país.', 'Todas las tarjetas de crédito, Apple Pay y Google Pay.'],
            ].map(([n, d, c]) => (
              <div key={n} className={s.payWay}>
                {n === 'Creem'
                  ? <img src="/pay/creem.svg" alt="Creem" className={s.payLogo} width={93} height={20} />
                  : <span className={s.payName}><img src="/pay/mercadopago.svg" alt="" width={24} height={24} />{n}</span>}
                <span>{t(d)}</span>
                <span className={s.payCards}>{t(c)}</span>
              </div>
            ))}
          </div>
          <p className={s.payNote}><Check />{t('Pago mensual recurrente: se cobra solo cada mes y podés cancelar cuando quieras desde Mi perfil, sin costo.')}</p>
        </div>
      </section>

      <section id="contacto" className={s.contact}>
        <div className={s.contactIn}>
          <div className={s.contactText}>
            <span id="contacto-enterprise" className={s.anchor} />
            <h2 className={s.h2}>{t('Hablemos')}</h2>
            <p className={s.sub}>{t('¿Tenés una duda, necesitás ayuda o querés conocer el plan Enterprise para tu empresa? Escribinos y te respondemos por email.')}</p>
            <div className={s.contactAlt}>
              <span>{t('También podés escribirnos a')}</span>
              <a href="mailto:hola@boxinger.com">hola@boxinger.com</a>
            </div>
          </div>
          <div className={s.contactCard}>
            <ContactForm hashTopic />
          </div>
        </div>
      </section>

      <section className={s.band}>
        <div className={s.bandIn}>
          <h2 className={s.bandH}>{t('Abrí tu primer buzón hoy.')}</h2>
          <div className={s.ctaRow}>
            <Link href="/app/registro" className={s.btnLgPrimary}>{t('Crear cuenta gratis')}</Link>
            <Link href="/app/ingresar" className={s.btnLg}>{t('Ingresar')}</Link>
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.footerIn}>
          <span style={{ flex: 1 }}>© 2026 Boxinger · www.boxinger.com</span>
          <div className={s.footerLinks}>
            <Link href="/terminos" className={s.footerLink}>{t('Términos')}</Link>
            <Link href="/privacidad" className={s.footerLink}>{t('Privacidad')}</Link>
            <Link href="/seguridad" className={s.footerLink}>{t('Seguridad')}</Link>
            <a href="#contacto" className={s.footerLink}>{t('Contacto')}</a>
            <Link href="/arrepentimiento" className={s.footerLink}>{t('Botón de arrepentimiento')}</Link>
            <LanguageSwitch />
          </div>
        </div>
      </footer>
    </div>
  );
}
