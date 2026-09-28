import { LegalPage } from '../LegalPage';

export const metadata = { title: 'Privacidad · Boxinger' };

// Borrador base (Ley 25.326 de Argentina): revisalo con tu asesor legal antes de publicar.
export default function Privacidad() {
  return (
    <LegalPage title="Política de privacidad" updated="27 de septiembre de 2026">
      <h2>Qué datos guardamos</h2>
      <p>Tu nombre, email, foto (si la subís o viene de Google) y la actividad en los buzones: ideas, votos, comentarios y reacciones. Si pagás Pro, guardamos el estado de la suscripción y los importes cobrados; los datos de tu tarjeta los procesan PayPal o Mercado Pago y nunca llegan a Boxinger.</p>
      <h2>Para qué los usamos</h2>
      <p>Para darte acceso, mostrar tu participación en los buzones, enviarte las notificaciones que elegiste y cobrar la suscripción. No vendemos tus datos.</p>
      <h2>Quién más los ve</h2>
      <p>Tu nombre y lo que publicás lo ve cualquiera que tenga acceso al buzón. El Equipo de un buzón ve tu email si sos parte de su Comunidad. Usamos proveedores para operar el servicio: Supabase (base de datos y autenticación), Vercel (hosting), Resend (emails), PayPal y Mercado Pago (cobros).</p>
      <h2>Tus derechos</h2>
      <p>Podés acceder, corregir y borrar tus datos desde Mi perfil, o escribirnos a <a href="mailto:hola@boxinger.com">hola@boxinger.com</a>. Al borrar tu cuenta, tus ideas y comentarios quedan como de un usuario eliminado.</p>
    </LegalPage>
  );
}
