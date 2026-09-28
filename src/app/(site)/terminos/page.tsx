import { LegalPage } from '../LegalPage';

export const metadata = { title: 'Términos · Boxinger' };

// Borrador base: revisalo con tu asesor legal antes de publicar.
export default function Terminos() {
  return (
    <LegalPage title="Términos y condiciones" updated="27 de septiembre de 2026">
      <h2>1. El servicio</h2>
      <p>Boxinger es un buzón de ideas para equipos de producto: el Equipo crea buzones, su Comunidad propone, vota y comenta ideas, y el Equipo las revisa y prioriza.</p>
      <h2>2. Cuentas</h2>
      <p>Para participar necesitás una cuenta con un email verificado o con Google. Sos responsable de la actividad de tu cuenta y de mantener tu contraseña segura.</p>
      <h2>3. Planes y pagos</h2>
      <p>El plan Free no tiene costo. El plan Pro es una suscripción mensual que se cobra por adelantado con PayPal (en dólares) o Mercado Pago (en pesos argentinos) y se renueva automáticamente hasta que la canceles. Podés cancelarla cuando quieras desde tu perfil; seguís con Pro hasta el fin del período pagado. Te avisamos por email cualquier cambio de precio antes de que se aplique.</p>
      <h2>4. Contenido</h2>
      <p>Las ideas y comentarios son de quien los publica. Al publicarlos, autorizás al dueño del buzón a usarlos para mejorar su producto. El Equipo de cada buzón puede moderar, ocultar contenido y bloquear participantes.</p>
      <h2>5. Uso aceptable</h2>
      <p>No se permite publicar contenido ilegal, ofensivo o spam, ni intentar vulnerar la plataforma. Podemos suspender cuentas o buzones que incumplan estos términos.</p>
      <h2>6. Baja</h2>
      <p>Podés borrar tu cuenta desde Mi perfil. Si sos dueño de un equipo, se borran también tus buzones con sus ideas, votos y comentarios.</p>
      <h2>7. Contacto</h2>
      <p>Escribinos a <a href="mailto:hola@boxinger.com">hola@boxinger.com</a>.</p>
    </LegalPage>
  );
}
