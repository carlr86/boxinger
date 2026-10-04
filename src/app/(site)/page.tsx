import Link from 'next/link';
import s from './landing.module.css';
import { getPublicProPrice } from '@/lib/pricing';
import { fmtPrice } from '@/lib/format';
import ContactForm from '@/components/ContactForm';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { getT } from '@/lib/i18n/server';

// Texts below are the Spanish source; the page shows them through t() (src/lib/i18n).

const ST = {
  ok: { bd: '#b7eb8f', bg: '#f6ffed', fg: '#389e0d' },
  rev: { bd: '#91caff', bg: '#e6f4ff', fg: '#0958d9' },
  pend: { bd: '#d9d9d9', bg: '#fafafa', fg: 'rgba(0,0,0,0.65)' },
} as const;

const DEMO = [
  { title: 'Exportar movimientos a Excel', cat: 'Feature', st: ST.ok, status: 'Aprobada', votes: 48, comments: 12 },
  { title: 'Notificación cuando se acredita un pago', cat: 'Mejoras Funcionales', st: ST.rev, status: 'En revisión', votes: 31, comments: 7 },
  { title: 'Modo oscuro en la app', cat: 'Propuestas', st: ST.pend, status: 'Pendiente de revisión', votes: 19, comments: 4 },
];

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
  const [usd, { t, locale }] = await Promise.all([getPublicProPrice(), getT()]);
  const plans = [
    {
      name: 'Free', price: 'USD 0', per: 'para siempre', bd: '#f0f0f0',
      items: ['1 equipo con 1 buzón', 'Solo vos, sin miembros', 'Buzón solo para invitados o público', 'Ideas ilimitadas', 'Votos, comentarios, Ranking y Backlog'],
      cta: 'Empezar gratis', ctaBg: '#fff', ctaFg: 'rgba(0,0,0,0.88)', ctaBd: '#d9d9d9',
    },
    {
      name: 'Pro', price: 'USD ' + fmtPrice(usd, locale), per: '/ mes', bd: '#059669',
      items: ['Todo lo de Free', 'Equipos y buzones ilimitados', 'Hasta 4 miembros por equipo', 'Buzones privados y acceso por miembro', 'Acceso por dominio de email', 'Matriz, Roadmap y Status'],
      cta: 'Crear cuenta', ctaBg: '#059669', ctaFg: '#fff', ctaBd: '#059669',
    },
    {
      name: 'Enterprise', price: 'A medida', per: '', bd: '#c7d2fe', badge: 'Exclusivo',
      items: ['Todo lo de Pro', 'Miembros ilimitados por equipo', 'Asistente IA: sugiere ideas y cuáles aprobar', 'Alta y acompañamiento dedicados'],
      cta: 'Contactanos', ctaBg: '#fff', ctaFg: '#4338ca', ctaBd: '#4338ca', href: '#contacto-enterprise',
    },
  ];

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerIn}>
          <a href="#top" className={s.brand}>
            <span className={s.logo}>B</span>
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
            <span className={s.note}>{t('Plan Free sin tarjeta de crédito.')}</span>
          </div>

          <div className={s.mock} aria-hidden>
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
                    <span className={s.mockTitle}>{t(d.title)}</span>
                    <div className={s.tags}>
                      <span className={s.tag}>{t(d.cat)}</span>
                      <span className={s.tag} style={{ borderColor: d.st.bd, background: d.st.bg, color: d.st.fg }}>{t(d.status)}</span>
                    </div>
                  </div>
                  <span className={s.mockComments}>{t('{n} comentarios', { n: d.comments })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="como" className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.h2}>{t('Cómo funciona')}</h2>
          <p className={s.sub}>{t('Cada idea sigue el mismo recorrido, desde que alguien la propone hasta que se lanza.')}</p>
        </div>
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
          <p className={s.sub}>{t('Empezá gratis con un buzón. Pasá a Pro cuando quieras sumar a tu equipo, o hablemos de Enterprise si necesitás más.')}</p>
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
              {'href' in p && p.href
                ? <a href={p.href} className={s.planCta} style={{ background: p.ctaBg, color: p.ctaFg, border: '1px solid ' + p.ctaBd }}>{t(p.cta)}</a>
                : <Link href="/app/registro" className={s.planCta} style={{ background: p.ctaBg, color: p.ctaFg, border: '1px solid ' + p.ctaBd }}>{t(p.cta)}</Link>}
            </div>
          ))}
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
            <a href="#contacto" className={s.footerLink}>{t('Contacto')}</a>
            <Link href="/arrepentimiento" className={s.footerLink}>{t('Botón de arrepentimiento')}</Link>
            <LanguageSwitch />
          </div>
        </div>
      </footer>
    </div>
  );
}
