import { AuthPage } from './AuthPage';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Ingresar') + ' · Boxinger' };
}

export default function Ingresar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AuthPage mode="login" searchParams={searchParams} />;
}
