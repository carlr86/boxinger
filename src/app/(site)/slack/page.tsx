import Link from 'next/link';
import { Plus_Jakarta_Sans } from 'next/font/google';
import s from '../landing.module.css';
import k from './slack.module.css';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { SlackLogo } from '@/components/SlackLogo';
import { getT } from '@/lib/i18n/server';
import { LEGAL } from '@/lib/legal';
import type { T } from '@/lib/i18n';

// /slack: the public page about the Slack integration (what it posts, how to connect it, what data it uses).
// Slack Marketplace asks for one like this; it also answers customers before they connect.

const display = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--display' });

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Boxinger para Slack'), description: t('Las ideas de tus usuarios, en el canal de Slack de tu equipo.') };
}

export default async function SlackPage() {
  const { t } = await getT();
  const notices = [
    ['💡', t('Idea nueva'), t('Cuando alguien carga una idea en el buzón, o el Equipo publica una que estaba oculta.')],
    ['📥', t('Idea para revisar'), t('Cuando llega una idea desde Zapier, Make, Google Forms u otra herramienta y espera en «Por revisar».')],
    ['🗺️', t('Pasa al Roadmap'), t('La primera vez que una idea entra al Roadmap, con sus votos.')],
    ['🚀', t('Idea lanzada'), t('Cuando una idea se marca como lanzada. Boxinger también les avisa a quienes la propusieron o votaron.')],
    ['📊', t('Resumen semanal'), t('Los lunes: ideas nuevas, votos, comentarios y las más votadas de la semana.')],
  ];
  const steps = [
    [t('Entrá a tu buzón'), t('En Boxinger, abrí el buzón y andá a Configuración › Integraciones.')],
    [t('Tocá «Conectar con Slack»'), t('Se abre Slack: elegí tu espacio de trabajo y el canal, y tocá «Permitir».')],
    [t('Listo'), t('Llega un primer mensaje al canal. Desde ahí elegís qué avisos recibir y podés mandar un mensaje de prueba.')],
  ];
  const faq = [
    [t('¿Qué datos lee Boxinger de mi Slack?'), t('Ninguno. Boxinger solo tiene permiso para escribir en el canal que elegiste: no lee mensajes, ni personas, ni otros canales.')],
    [t('¿Qué se manda al canal?'), t('El título de la idea, el comienzo de la descripción, la categoría, si es de la Comunidad o del Equipo, el nombre de quien la cargó, los votos y el link a la idea. Para abrir la idea hay que tener acceso al buzón en Boxinger.')],
    [t('Mi espacio de trabajo pide aprobación para apps nuevas'), t('Desde la misma pantalla de Slack podés mandarle la solicitud al administrador. Cuando la aprueba, volvé a tocar «Conectar con Slack».')],
    [t('¿Cómo la desconecto?'), t('En Boxinger, Configuración › Integraciones › Desconectar. Borramos la dirección del canal y dejan de llegar avisos. Para sacar la app del todo, quitala también desde la configuración de apps de Slack.')],
    [t('¿En qué plan está?'), t('En los planes Pro y Enterprise. Cada buzón puede conectar un canal.')],
  ];

  return (
    <div className={`${s.page} ${display.variable}`}>
      <header className={s.header}>
        <div className={s.headerIn}>
          <Link href="/" className={s.brand}><img src="/logo.svg" alt="" width={30} height={30} /><span>Boxinger</span></Link>
          <nav className={s.nav}>
            <a href="#avisos">{t('Qué avisa')}</a>
            <a href="#conectar">{t('Cómo se conecta')}</a>
            <a href="#datos">{t('Privacidad')}</a>
          </nav>
          <div className={s.headerCtas}>
            <Link href="/app/ingresar" className={s.login}>{t('Ingresar')}</Link>
            <Link href="/app/registro" className={s.headerCta}>{t('Crear cuenta gratis')}</Link>
          </div>
        </div>
      </header>

      <section className={s.hero}>
        <div className={s.heroIn}>
          <div className={s.heroText}>
            <span className={k.badge}><SlackLogo size={16} />{t('Boxinger para Slack')}</span>
            <h1 className={s.h1}>{t('Las ideas de tus usuarios, en el canal de tu equipo.')}</h1>
            <p className={s.lead}>{t('Boxinger avisa en Slack cuando llega una idea, cuando pasa al Roadmap y cuando se lanza. Tu equipo se entera sin salir del chat y abre cada idea con un clic.')}</p>
            <div className={s.ctaRow}>
              <Link href="/app/buzones" className={s.btnPrimary}>{t('Conectar desde mi buzón')}</Link>
              <a href="#conectar" className={s.videoLink}>{t('Cómo se conecta')} →</a>
            </div>
            <span className={s.note}>{t('Planes Pro y Enterprise.')}</span>
          </div>
          <div className={k.art} aria-hidden>
            <div className={k.window}>
              <div className={k.chan}><SlackLogo size={14} />#ideas-clientes</div>
              <Msg emoji="💡" title={t('Nueva idea')} board="Pampa Pagos" idea={t('Exportar movimientos a Excel')} meta={t('Comunidad · Reportes · por Lucía Fernández')} quote={t('Necesito bajar los movimientos del mes para pasárselos al contador.')} t={t} />
              <Msg emoji="🗺️" title={t('Pasó al Roadmap')} board="Pampa Pagos" idea={t('Notificación cuando se acredita un pago')} meta={t('31 votos')} t={t} />
              <Msg emoji="🚀" title={t('Se lanzó')} board="Pampa Pagos" idea={t('Conciliación automática con el banco')} meta={t('48 votos · Le avisamos a quienes la propusieron o votaron.')} t={t} />
            </div>
          </div>
        </div>
      </section>

      <section id="avisos" className={s.section}>
        <div className={s.head}>
          <span className={s.kicker}>{t('Qué avisa')}</span>
          <h2 className={s.h2}>{t('Elegís qué llega al canal')}</h2>
          <p className={s.sub}>{t('Cada aviso se prende o se apaga desde Boxinger. Todos traen el link a la idea.')}</p>
        </div>
        <div className={k.grid}>
          {notices.map(([e, ti, d]) => (
            <div key={ti} className={k.item}><span className={k.emoji}>{e}</span><b>{ti}</b><span>{d}</span></div>
          ))}
        </div>
      </section>

      <section id="conectar" className={k.band}>
        <div className={s.section}>
          <div className={s.head}>
            <span className={s.kicker}>{t('Cómo se conecta')}</span>
            <h2 className={s.h2}>{t('En un minuto, sin configurar nada')}</h2>
            <p className={s.sub}>{t('Lo conecta quien administra el buzón en Boxinger. Cada buzón puede avisar en un canal.')}</p>
          </div>
          <ol className={k.steps}>
            {steps.map(([ti, d], n) => (
              <li key={ti} className={k.step}><span className={k.num}>{n + 1}</span><b>{ti}</b><span>{d}</span></li>
            ))}
          </ol>
          <div className={s.ctaRow}>
            <Link href="/app/buzones" className={s.btnPrimary}>{t('Ir a mis buzones')}</Link>
            <Link href="/app/registro" className={s.btnGhostLg}>{t('Crear cuenta gratis')}</Link>
          </div>
        </div>
      </section>

      <section id="datos" className={s.section}>
        <div className={s.head}>
          <span className={s.kicker}>{t('Privacidad y preguntas')}</span>
          <h2 className={s.h2}>{t('Solo escribe en el canal que elegís')}</h2>
          <p className={s.sub}>
            {t('Boxinger pide un único permiso de Slack: publicar mensajes en un canal. La dirección del canal queda guardada solo en nuestro servidor y nunca se muestra en el navegador.')}{' '}
            <Link href="/privacidad">{t('Política de privacidad')}</Link>
          </p>
        </div>
        <div className={k.faq}>
          {faq.map(([q, a]) => (
            <details key={q} className={k.q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
        <p className={k.help}>
          {t('¿Necesitás ayuda?')} <a href={'mailto:' + LEGAL.email}>{LEGAL.email}</a> · <Link href="/#contacto">{t('Escribinos')}</Link>
        </p>
      </section>

      <footer className={s.footer}>
        <div className={s.footBottom}>
          <span>© 2026 Boxinger · <Link href="/" style={{ color: 'inherit' }}>www.boxinger.com</Link> · <Link href="/privacidad" style={{ color: 'inherit' }}>{t('Privacidad')}</Link> · <Link href="/terminos" style={{ color: 'inherit' }}>{t('Términos')}</Link></span>
          <LanguageSwitch style={{ color: 'rgba(255,255,255,0.7)' }} />
        </div>
      </footer>
    </div>
  );
}

function Msg({ emoji, title, board, idea, meta, quote, t }: { emoji: string; title: string; board: string; idea: string; meta: string; quote?: string; t: T }) {
  return (
    <div className={k.msg}>
      <img src="/logo.svg" alt="" width={34} height={34} />
      <div>
        <span className={k.who}>Boxinger <i>APP</i></span>
        <span>{emoji} <b>{title}</b> {t('en {board}', { board })}</span>
        <span className={k.link}>{idea}</span>
        {quote && <span className={k.quote}>{quote}</span>}
        <span className={k.meta}>{meta}</span>
      </div>
    </div>
  );
}
