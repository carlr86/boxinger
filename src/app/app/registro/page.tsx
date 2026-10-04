import { AuthPage } from '../ingresar/AuthPage';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Crear cuenta') + ' · Boxinger' };
}

export default function Registro({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AuthPage mode="registro" searchParams={searchParams} />;
}
