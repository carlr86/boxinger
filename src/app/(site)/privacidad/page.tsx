import Link from 'next/link';
import { LegalPage } from '../LegalPage';
import { LEGAL } from '@/lib/legal';
import { getT } from '@/lib/i18n/server';
import { PrivacyEn } from './PrivacyEn';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Privacidad') + ' · Boxinger' };
}

// Texto adaptado a la Ley 25.326 de Protección de los Datos Personales (Argentina).
// Revisalo con un profesional antes de publicar cambios importantes.
export default async function Privacidad() {
  const { t, locale } = await getT();
  if (locale === 'en') return <LegalPage title={t('Política de privacidad')} updated={LEGAL.updated}><PrivacyEn /></LegalPage>;
  const mail = <a href={'mailto:' + LEGAL.email}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Política de privacidad" updated={LEGAL.updated}>
      <p>Esta política explica qué datos personales trata Boxinger, para qué y qué derechos tenés, conforme a la Ley 25.326 de Protección de los Datos Personales y su normativa complementaria.</p>

      <h2>1. Responsable</h2>
      <p>El responsable de la base de datos es {LEGAL.holder}, CUIT {LEGAL.cuit}, con domicilio en {LEGAL.address}. Contacto: {mail}.</p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li><b>Cuenta:</b> nombre, email, contraseña (guardada cifrada; no la podemos ver) y, si entrás con Google, tu nombre, email y foto de perfil de Google.</li>
        <li><b>Perfil y preferencias:</b> foto o logo que subas, tus preferencias de notificaciones y el idioma de la interfaz.</li>
        <li><b>Contenido y actividad:</b> ideas, votos, comentarios, reacciones, buzones y equipos que creás o a los que te sumás, invitaciones que enviás (email del invitado) y fechas de actividad.</li>
        <li><b>Suscripción:</b> plan, estado, importes, fechas de cobro y los identificadores de la suscripción en Creem o Mercado Pago, incluido el email de la cuenta de Mercado Pago que indicás al pagar. Los datos de tu tarjeta los procesan Creem o Mercado Pago y nunca llegan a Boxinger.</li>
        <li><b>Contacto:</b> lo que nos escribís por el formulario de contacto o el botón de arrepentimiento (nombre, email, empresa, mensaje).</li>
        <li><b>Datos técnicos:</b> los necesarios para mantener tu sesión y proteger el servicio. De los formularios públicos guardamos solo un identificador cifrado de la conexión para evitar abusos, nunca tu dirección IP.</li>
      </ul>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Crear y administrar tu cuenta y darte acceso a los buzones.</li>
        <li>Mostrar tu participación en los buzones a quienes tienen acceso.</li>
        <li>Enviarte emails del servicio: confirmación de cuenta, invitaciones, cambios de estado de tus ideas, respuestas, avisos de la suscripción y las notificaciones que elegiste.</li>
        <li>Cobrar la suscripción, emitir comprobantes y cumplir obligaciones legales y fiscales.</li>
        <li>Responder tus consultas y solicitudes.</li>
        <li>Mantener la seguridad del servicio, prevenir fraudes y abusos, y mejorarlo.</li>
      </ul>
      <p>No vendemos ni alquilamos tus datos, no los usamos para publicidad de terceros y no hacemos perfiles comerciales con ellos. Tratamos tus datos con tu consentimiento, que das al registrarte, y para cumplir el servicio que contrataste.</p>

      <h2>4. Quién ve tu información dentro de Boxinger</h2>
      <ul>
        <li>Tu nombre, tu foto y lo que publicás en un buzón los ve cualquiera con acceso a ese buzón. En un buzón público, cualquier persona con el link.</li>
        <li>El equipo dueño de un buzón (Admin y Miembros) ve el email de quienes participan en su Comunidad, para poder gestionarla.</li>
        <li>El Admin de un equipo ve el nombre y el email de los miembros que invita.</li>
      </ul>

      <h2>5. Proveedores y transferencia internacional</h2>
      <p>Para operar el servicio compartimos los datos necesarios con estos proveedores, que los tratan por cuenta nuestra y con medidas de seguridad adecuadas:</p>
      <ul>
        <li><b>Supabase:</b> base de datos, autenticación y archivos, con servidores en Estados Unidos.</li>
        <li><b>Hostinger:</b> alojamiento de la web y envío de emails.</li>
        <li><b>Google:</b> inicio de sesión con Google, si lo elegís.</li>
        <li><b>Creem y Mercado Pago:</b> procesamiento de pagos, según sus propias políticas de privacidad. Creem actúa como revendedor en los pagos en dólares.</li>
      </ul>
      <p>Algunos de estos proveedores guardan los datos fuera de Argentina, en países que pueden no tener un nivel de protección equivalente. Al usar Boxinger prestás tu consentimiento para esa transferencia, que se limita a lo necesario para prestar el servicio. También podemos revelar datos si lo exige una autoridad competente conforme a la ley.</p>

      <h2>6. Cookies y almacenamiento local</h2>
      <p>Usamos cookies esenciales para mantener tu sesión iniciada y recordar tu idioma, y almacenamiento local del navegador para recordar preferencias de la interfaz. No usamos cookies de publicidad ni herramientas de analítica de terceros. Si las bloqueás, no vas a poder iniciar sesión.</p>

      <h2>7. Cuánto tiempo los guardamos</h2>
      <p>Guardamos tus datos mientras tengas la cuenta activa. Si la borrás desde Mi perfil, eliminamos tu perfil y tus datos de acceso. Las ideas y comentarios que publicaste en buzones de otros equipos se conservan como de un &quot;Usuario eliminado&quot;, sin tu nombre ni tu email. Si sos dueño de una cuenta, se borran tus equipos y buzones con todo su contenido. Los registros de pagos se conservan el tiempo que exija la normativa fiscal y contable.</p>

      <h2>8. Seguridad</h2>
      <p>Aplicamos medidas técnicas y organizativas para proteger tus datos: conexiones cifradas (HTTPS), contraseñas cifradas, controles de acceso por rol en la base de datos y acceso restringido a la información. Ningún sistema es completamente infalible; si ocurriera un incidente que afecte tus datos, te vamos a avisar.</p>

      <h2>9. Tus derechos</h2>
      <p>Podés acceder a tus datos, rectificarlos, actualizarlos y pedir que los suprimamos. La mayoría lo podés hacer directamente desde <Link href="/app/perfil">Mi perfil</Link> (nombre, foto, notificaciones, suscripción y borrado de la cuenta). Para el resto, escribinos a {mail} desde el email de tu cuenta. Respondemos los pedidos de acceso dentro de los 10 días corridos y los de rectificación o supresión dentro de los 5 días hábiles. El derecho de acceso es gratuito en intervalos no menores a seis meses, salvo que acredites un interés legítimo.</p>
      <p>Podés dejar de recibir las notificaciones opcionales desde <Link href="/app/perfil?tab=notif">Mi perfil › Notificaciones</Link>. Los emails necesarios para el servicio (seguridad, pagos, invitaciones) se siguen enviando mientras tengas la cuenta.</p>
      <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}>
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
      </p>

      <h2>10. Menores de edad</h2>
      <p>Boxinger es para mayores de 18 años. No recolectamos a sabiendas datos de menores; si detectamos una cuenta de un menor, la damos de baja.</p>

      <h2>11. Cambios en esta política</h2>
      <p>Si la modificamos, publicamos la nueva versión en esta página con su fecha de actualización y, si el cambio es importante, te avisamos por email.</p>

      <h2>12. Contacto</h2>
      <p>Por cualquier consulta sobre tus datos, escribinos a {mail}.</p>
    </LegalPage>
  );
}
