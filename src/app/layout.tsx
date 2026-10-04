import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SITE_URL } from '@/lib/env';
import { getLocale, getT } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';
import { ErrorReporter } from '@/components/ErrorReporter';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    metadataBase: new URL(SITE_URL),
    title: t('Boxinger · Buzón de ideas para equipos de producto'),
    description: t('Boxinger reúne las propuestas de tu comunidad y de tu equipo. La comunidad vota, el equipo revisa y las ideas aprobadas pasan al backlog, la matriz de esfuerzo e impacto y el roadmap.'),
    // Icons come from src/app/favicon.ico, icon.svg and apple-icon.png (made from public/logo.svg).
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body><I18nProvider locale={locale}>{children}<ErrorReporter /></I18nProvider></body>
    </html>
  );
}
