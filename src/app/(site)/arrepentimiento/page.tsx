import Link from 'next/link';
import { LegalPage } from '../LegalPage';
import { LEGAL } from '@/lib/legal';
import { WithdrawalForm } from './WithdrawalForm';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Botón de arrepentimiento') + ' · Boxinger' };
}

// Res. 424/2020 (Argentina): revocation within 10 days, without signing in, with an identification code.
export default async function Arrepentimiento() {
  const { t, locale } = await getT();
  const form = (
    <div style={{ marginTop: 32, border: '1px solid #e6ebe9', borderRadius: 12, padding: 24 }}>
      <WithdrawalForm />
    </div>
  );
  if (locale === 'en') {
    // Courtesy translation of the Spanish text below.
    return (
      <LegalPage title={t('Botón de arrepentimiento')} updated={LEGAL.updated}>
        <p>If you bought the Pro plan, you can withdraw from the purchase within <b>10 calendar days</b> of making it, without giving reasons and at no cost (article 34 of Argentine Law 24,240 and Resolution 424/2020). You don’t need to sign in.</p>
        <p>Fill in the form: we show you a request code and email it to you. We cancel the subscription and refund the full amount to the same payment method (international card or Mercado Pago).</p>
        <p>If more than 10 days have passed, you can <Link href="/app/perfil?tab=sub">cancel the subscription from My profile</Link> anytime: no further charges are made and you keep Pro until the end of the paid period.</p>
        {form}
      </LegalPage>
    );
  }
  return (
    <LegalPage title="Botón de arrepentimiento" updated={LEGAL.updated}>
      <p>Si contrataste el plan Pro, podés revocar la contratación dentro de los <b>10 días corridos</b> desde que la hiciste, sin dar motivos y sin costo (artículo 34 de la Ley 24.240 y Resolución 424/2020). No hace falta iniciar sesión.</p>
      <p>Completá el formulario: te mostramos un código de solicitud y te lo enviamos por email. Cancelamos la suscripción y te devolvemos el total por el mismo medio de pago (tarjeta internacional o Mercado Pago).</p>
      <p>Si ya pasaron los 10 días, podés <Link href="/app/perfil?tab=sub">cancelar la suscripción desde Mi perfil</Link> cuando quieras: no se hacen más cobros y seguís con Pro hasta el fin del período pagado.</p>
      {form}
    </LegalPage>
  );
}
