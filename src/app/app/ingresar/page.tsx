import { AuthPage } from './AuthPage';

export const metadata = { title: 'Ingresar · Boxinger' };

export default function Ingresar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AuthPage mode="login" searchParams={searchParams} />;
}
