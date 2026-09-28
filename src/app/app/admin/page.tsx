import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/session';
import { AdminApp } from '@/components/admin/AdminApp';

export const metadata = { title: 'Admin · Boxinger', robots: { index: false } };

export default async function AdminPage() {
  const ctx = await requireContext('/app/admin');
  if (!ctx.me.is_super_admin) notFound();
  return <Suspense><AdminApp /></Suspense>;
}
