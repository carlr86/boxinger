import { AntdRegistry } from '@ant-design/nextjs-registry';
import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { getContext } from '@/lib/session';

export const metadata: Metadata = { title: 'Boxinger' };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <AntdRegistry>
      <Providers initialCtx={ctx}>
        <div className="bx-app">{children}</div>
      </Providers>
    </AntdRegistry>
  );
}
