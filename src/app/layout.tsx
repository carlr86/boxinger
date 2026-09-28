import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.boxinger.com'),
  title: 'Boxinger · Buzón de ideas para equipos de producto',
  description:
    'Boxinger reúne las propuestas de tu comunidad y de tu equipo. La comunidad vota, el equipo revisa y las ideas aprobadas pasan al backlog, la matriz de esfuerzo e impacto y el roadmap.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
