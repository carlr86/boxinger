import Link from 'next/link';
import { LegalPage } from '../LegalPage';
import { LEGAL } from '@/lib/legal';
import { WithdrawalForm } from './WithdrawalForm';

export const metadata = { title: 'Botón de arrepentimiento · Boxinger' };

// Res. 424/2020 (Argentina): revocation within 10 days, without signing in, with an identification code.
export default function Arrepentimiento() {
  return (
    <LegalPage title="Botón de arrepentimiento" updated={LEGAL.updated}>
      <p>Si contrataste el plan Pro, podés revocar la contratación dentro de los <b>10 días corridos</b> desde que la hiciste, sin dar motivos y sin costo (artículo 34 de la Ley 24.240 y Resolución 424/2020). No hace falta iniciar sesión.</p>
      <p>Completá el formulario: te mostramos un código de solicitud y te lo enviamos por email. Cancelamos la suscripción y te devolvemos el total por el mismo medio de pago (PayPal o Mercado Pago).</p>
      <p>Si ya pasaron los 10 días, podés <Link href="/app/perfil?tab=sub">cancelar la suscripción desde Mi perfil</Link> cuando quieras: no se hacen más cobros y seguís con Pro hasta el fin del período pagado.</p>
      <div style={{ marginTop: 32, border: '1px solid #e6ebe9', borderRadius: 12, padding: 24 }}>
        <WithdrawalForm />
      </div>
    </LegalPage>
  );
}
