import { AuthPage } from '../ingresar/AuthPage';

export const metadata = { title: 'Crear cuenta · Boxinger' };

export default function Registro({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AuthPage mode="registro" searchParams={searchParams} />;
}
