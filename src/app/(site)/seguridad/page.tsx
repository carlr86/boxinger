import Link from 'next/link';
import { LegalPage } from '../LegalPage';
import { LEGAL } from '@/lib/legal';
import { getT } from '@/lib/i18n/server';
import { SecurityEn } from './SecurityEn';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Seguridad y protección de datos') + ' · Boxinger' };
}

// Página informativa de seguridad (no contractual). El DPA firmable rige la relación con clientes Enterprise.
const UPDATED = '2026-10-09';

export default async function Seguridad() {
  const { t, locale } = await getT();
  if (locale === 'en') return <LegalPage title={t('Seguridad y protección de datos')} updated={UPDATED}><SecurityEn /></LegalPage>;
  const mail = <a href={'mailto:' + LEGAL.email}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Seguridad y protección de datos" updated={UPDATED}>
      <p>En Boxinger protegemos los datos de cada cliente y de sus usuarios con aislamiento estricto, cifrado y minimización de datos, bajo la Ley 25.326 de Protección de los Datos Personales (Argentina) y con un enfoque alineado al estándar GDPR. Esta página resume cómo lo hacemos. Para clientes empresariales ofrecemos además un Acuerdo de Tratamiento de Datos (DPA) firmable.</p>

      <h2>1. Aislamiento entre clientes</h2>
      <p>Cada cliente accede únicamente a sus propios datos. El aislamiento no depende del código de la aplicación: está forzado en la base de datos con Seguridad a Nivel de Fila (Row Level Security) de PostgreSQL, que filtra cada consulta por el usuario autenticado antes de devolver un solo registro. En la práctica, un usuario de un cliente nunca puede ver las ideas, votos, comentarios ni miembros de otro cliente, aunque intente manipular la aplicación desde su navegador.</p>

      <h2>2. Cifrado</h2>
      <ul>
        <li><b>En tránsito:</b> todo el tráfico viaja por HTTPS/TLS. El acceso por HTTP se redirige automáticamente a HTTPS y se aplica HSTS (conexión segura forzada).</li>
        <li><b>En reposo:</b> los datos se almacenan cifrados en la infraestructura de Supabase (sobre AWS).</li>
        <li><b>Contraseñas:</b> se guardan cifradas (hash); no podemos verlas ni recuperarlas.</li>
      </ul>

      <h2>3. Uso de los datos</h2>
      <p>No vendemos ni alquilamos datos, no hacemos publicidad de terceros y no construimos perfiles comerciales. Solo tratamos los datos para prestar el servicio contratado y según el consentimiento del usuario. No usamos herramientas de analítica de terceros ni cookies publicitarias.</p>

      <h2>4. Asistente de IA y tus datos</h2>
      <p>El asistente de IA está disponible solo en el plan Enterprise y se usa cuando el equipo decide activarlo. Cuando se usa, se envía al proveedor del modelo (Anthropic) solo el texto de las ideas del buzón, su descripción y los votos y comentarios contados, <b>sin nombres ni emails</b> de los usuarios. Anthropic no usa estos datos para entrenar sus modelos. Si el asistente no se activa, no se envía nada a la IA.</p>

      <h2>5. Minimización de datos</h2>
      <p>Recopilamos solo lo necesario para que el servicio funcione. En particular, no guardamos direcciones IP de los usuarios: de los formularios públicos conservamos únicamente un identificador cifrado de la conexión, usado para prevenir abusos. Los datos de tarjeta nunca llegan a Boxinger: los procesan directamente las pasarelas de pago (Creem o Mercado Pago).</p>

      <h2>6. Derechos de los titulares y borrado</h2>
      <ul>
        <li><b>Acceso y rectificación:</b> los usuarios pueden ver y corregir los datos de su cuenta y perfil desde <Link href="/app/perfil">Mi perfil</Link>.</li>
        <li><b>Eliminación:</b> las ideas, los equipos y las cuentas se pueden borrar, junto con sus datos asociados.</li>
        <li><b>Trazabilidad:</b> las acciones administrativas quedan en un registro de auditoría (quién hizo qué y cuándo).</li>
      </ul>

      <h2>7. Proveedores (sub-encargados)</h2>
      <p>Para operar el servicio compartimos los datos necesarios con estos proveedores, que los tratan por cuenta nuestra y con medidas de seguridad adecuadas:</p>
      <ul>
        <li><b>Supabase:</b> base de datos, autenticación y archivos, con servidores en Estados Unidos.</li>
        <li><b>Hostinger:</b> alojamiento de la web y envío de emails.</li>
        <li><b>Anthropic:</b> asistente de IA (solo Enterprise; texto de ideas sin datos personales).</li>
        <li><b>Creem y Mercado Pago:</b> procesamiento de pagos. Creem actúa como revendedor en los pagos en dólares.</li>
      </ul>
      <p>Ante cualquier cambio de sub-encargados lo notificamos a los clientes Enterprise. La lista vigente forma parte del DPA.</p>

      <h2>8. Marco legal, residencia y contacto</h2>
      <ul>
        <li><b>Marco legal:</b> cumplimos la Ley 25.326 de Protección de los Datos Personales (Argentina), con un enfoque alineado al estándar GDPR. Contamos con <Link href="/privacidad">Política de privacidad</Link> y <Link href="/terminos">Términos</Link> publicados.</li>
        <li><b>Residencia de datos:</b> los datos se alojan principalmente en Estados Unidos (Supabase/AWS). Si tu organización requiere una región específica, consultanos.</li>
        <li><b>Incidentes:</b> ante un incidente que afecte datos personales, notificamos a los clientes afectados.</li>
        <li><b>DPA y contacto:</b> ofrecemos un Acuerdo de Tratamiento de Datos firmable para clientes Enterprise. Para solicitarlo o para consultas de privacidad, escribinos a {mail}.</li>
      </ul>

      <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}>
        Página informativa, no contractual. La relación de tratamiento de datos con cada cliente se rige por el DPA firmado entre las partes.
      </p>
    </LegalPage>
  );
}
