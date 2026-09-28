import { redirect } from 'next/navigation';
import { getContext, homePath } from '@/lib/session';

export default async function AppHome() {
  const ctx = await getContext();
  redirect(ctx ? homePath(ctx) : '/app/ingresar');
}
