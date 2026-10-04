import { SimpleHeader } from '@/components/SimpleHeader';
import { NewPasswordForm } from './NewPasswordForm';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Nueva contraseña') + ' · Boxinger' };
}

export default function NuevaContrasena() {
  return (
    <>
      <SimpleHeader />
      <main className="bx-main"><NewPasswordForm /></main>
    </>
  );
}
