import { SimpleHeader } from '@/components/SimpleHeader';
import { NewPasswordForm } from './NewPasswordForm';

export const metadata = { title: 'Nueva contraseña · Boxinger' };

export default function NuevaContrasena() {
  return (
    <>
      <SimpleHeader />
      <main className="bx-main"><NewPasswordForm /></main>
    </>
  );
}
