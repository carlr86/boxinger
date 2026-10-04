import Link from 'next/link';
import { LegalPage } from '../LegalPage';
import { LEGAL } from '@/lib/legal';

export const metadata = { title: 'Términos · Boxinger' };

// Texto adaptado a la normativa argentina (Ley 24.240 de Defensa del Consumidor, Res. 424/2020).
// Revisalo con un profesional antes de publicar cambios importantes.
export default function Terminos() {
  const mail = <a href={'mailto:' + LEGAL.email}>{LEGAL.email}</a>;
  return (
    <LegalPage title="Términos y condiciones" updated={LEGAL.updated}>
      <h2>1. Quién presta el servicio</h2>
      <p>Boxinger (boxinger.com) es un servicio de {LEGAL.holder}, CUIT {LEGAL.cuit}, con domicilio en {LEGAL.address} (en adelante, &quot;Boxinger&quot;, &quot;nosotros&quot;). Podés contactarnos en {mail}.</p>

      <h2>2. Aceptación</h2>
      <p>Al crear una cuenta o usar Boxinger aceptás estos términos y la <Link href="/privacidad">Política de privacidad</Link>. Tenés que ser mayor de 18 años. Si usás Boxinger en nombre de una empresa, declarás que tenés facultades para aceptarlos en su nombre.</p>

      <h2>3. El servicio</h2>
      <p>Boxinger es un buzón de ideas para equipos de producto. El Admin de una cuenta crea equipos y buzones; los Miembros de su equipo gestionan las ideas; y la Comunidad (invitados y visitantes de buzones públicos) propone, vota y comenta ideas según lo que habilite cada buzón.</p>
      <p>Podemos agregar, cambiar o quitar funciones para mejorar el servicio. Si un cambio te quita una función esencial del plan que pagás, te avisamos con anticipación y podés cancelar.</p>

      <h2>4. Cuentas</h2>
      <p>Podés registrarte con email y contraseña o con Google. Tenés que dar datos verdaderos y mantenerlos actualizados. Sos responsable de la actividad de tu cuenta y de cuidar tu contraseña; avisanos si sospechás un acceso no autorizado.</p>

      <h2>5. Planes y precios</h2>
      <ul>
        <li><b>Free:</b> sin costo, con los límites que se muestran en la página de planes (1 equipo con 1 buzón, sin miembros).</li>
        <li><b>Pro:</b> suscripción mensual que se paga por adelantado con tarjeta internacional a través de Creem (en dólares) o con Mercado Pago (en pesos argentinos). Se renueva automáticamente cada mes hasta que la canceles.</li>
        <li><b>Enterprise:</b> plan a medida que se contrata por contacto directo, con condiciones acordadas por escrito.</li>
      </ul>
      <p>Los precios vigentes se muestran en la web y en Mi perfil antes de contratar. Para usuarios en Argentina son precios finales. Podemos ofrecer precios especiales por un plazo determinado; al vencer, la suscripción vuelve al precio de lista.</p>
      <p>Si cambiamos el precio de Pro, te avisamos por email antes de que se aplique. El nuevo precio rige desde el período siguiente al aviso; si no estás de acuerdo, podés cancelar antes de ese cobro.</p>
      <p>Los pagos los procesan Mercado Pago y Creem según sus propias condiciones. En los pagos en dólares, Creem actúa como revendedor autorizado (merchant of record): es quien te cobra, calcula los impuestos que correspondan en tu país y te emite el comprobante. Boxinger no recibe ni guarda los datos de tu tarjeta. Si un cobro falla, el proveedor puede reintentarlo; si no se regulariza, la cuenta puede volver al plan Free.</p>

      <h2>6. Cancelación (baja)</h2>
      <p>Podés cancelar Pro cuando quieras, desde <Link href="/app/perfil?tab=sub">Mi perfil › Suscripción</Link>, con la misma facilidad con que lo contrataste. No se hacen más cobros y seguís con Pro hasta el final del período ya pagado; después la cuenta pasa a Free. Tus buzones y datos se conservan, pero los que excedan el plan Free quedan bloqueados hasta que vuelvas a Pro.</p>

      <h2>7. Derecho de arrepentimiento y reembolsos</h2>
      <p>Si sos consumidor, podés revocar la contratación de Pro dentro de los <b>10 días corridos</b> desde que la hiciste, sin dar motivos y sin costo, conforme al artículo 34 de la Ley 24.240. Hacelo desde el <Link href="/arrepentimiento">Botón de arrepentimiento</Link> (no hace falta iniciar sesión) o escribiendo a {mail}. Te damos un código de solicitud, cancelamos la suscripción y te devolvemos el total por el mismo medio de pago.</p>
      <p>Fuera de ese plazo no hacemos reembolsos por períodos parciales: al cancelar, seguís usando Pro hasta el fin del período pagado. Si hubo un cobro duplicado o erróneo, escribinos y lo corregimos.</p>

      <h2>8. Tu contenido</h2>
      <p>Las ideas, comentarios, imágenes y demás contenido que publicás siguen siendo tuyos. Al publicarlos:</p>
      <ul>
        <li>nos autorizás a guardarlos y mostrarlos dentro del servicio, a quienes tengan acceso a ese buzón (en un buzón público, cualquier persona con el link);</li>
        <li>autorizás al Admin y al equipo dueño del buzón a usar tus ideas y comentarios, sin contraprestación, para evaluar y desarrollar su producto.</li>
      </ul>
      <p>Cada equipo modera sus buzones: puede ocultar ideas o comentarios y bloquear participantes. El dueño de cada buzón es responsable de su uso y de lo que pide a su Comunidad.</p>

      <h2>9. Uso aceptable</h2>
      <p>No podés usar Boxinger para publicar contenido ilegal, difamatorio, discriminatorio, ofensivo o que infrinja derechos de terceros; enviar spam; hacerte pasar por otra persona; recolectar datos de otros usuarios; ni intentar acceder sin autorización, sobrecargar o vulnerar la plataforma.</p>

      <h2>10. Propiedad intelectual</h2>
      <p>La marca Boxinger, el software, el diseño y los textos del servicio son nuestros o de nuestros licenciantes. Te damos un permiso personal, no exclusivo e intransferible para usar Boxinger según estos términos.</p>

      <h2>11. Servicios de terceros</h2>
      <p>Boxinger usa servicios de terceros, como Google (inicio de sesión), Creem y Mercado Pago (cobros). Su uso se rige además por las condiciones de cada uno.</p>

      <h2>12. Disponibilidad y responsabilidad</h2>
      <p>Trabajamos para que Boxinger funcione de forma continua y segura, pero puede haber interrupciones por mantenimiento, fallas o causas ajenas. En la medida que lo permita la ley, no respondemos por daños indirectos ni por el lucro cesante derivados del uso o la imposibilidad de uso del servicio, ni por el contenido que publican los usuarios. Nada de lo anterior limita los derechos que te reconoce la Ley 24.240 si sos consumidor.</p>

      <h2>13. Suspensión y baja de cuentas</h2>
      <p>Podemos suspender o dar de baja cuentas o buzones que incumplan estos términos, con aviso previo salvo en casos graves o urgentes. Podés borrar tu cuenta cuando quieras desde Mi perfil: si sos dueño de una cuenta, se cancela tu suscripción y se borran tus equipos y buzones con sus ideas, votos y comentarios.</p>

      <h2>14. Cambios en estos términos</h2>
      <p>Si modificamos estos términos, publicamos la nueva versión en esta página y, si el cambio es importante, te avisamos por email con al menos 15 días de anticipación. Si seguís usando Boxinger después de esa fecha, se entiende que aceptás los cambios; si no, podés cancelar y borrar tu cuenta.</p>

      <h2>15. Ley aplicable y jurisdicción</h2>
      <p>Estos términos se rigen por las leyes de la República Argentina. Ante cualquier conflicto, son competentes los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires, sin perjuicio del derecho de los consumidores a reclamar ante los tribunales de su domicilio o ante las autoridades de defensa del consumidor.</p>

      <h2>16. Contacto</h2>
      <p>Por cualquier consulta sobre estos términos, escribinos a {mail} o usá el <Link href="/#contacto">formulario de contacto</Link>.</p>
    </LegalPage>
  );
}
