import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { LanguageSwitch } from '@/components/LanguageSwitch';

export async function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const { t, locale } = await getT();
  const date = new Date(updated + 'T12:00:00Z').toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <header style={{ borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(0,0,0,0.88)' }}>
            <img src="/logo.svg" alt="" width={30} height={30} style={{ display: 'block' }} />
            <span style={{ fontWeight: 600, fontSize: 17 }}>Boxinger</span>
          </Link>
          <LanguageSwitch style={{ marginLeft: 'auto' }} />
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 96px', fontSize: 15, lineHeight: 1.7, color: 'rgba(0,0,0,0.78)' }}>
        <h1 style={{ fontSize: 32, margin: '0 0 4px', color: 'rgba(0,0,0,0.88)' }}>{title}</h1>
        <p style={{ margin: '0 0 32px', color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>{t('Última actualización: {date}', { date })}</p>
        {locale === 'en' && (
          <p style={{ margin: '-16px 0 32px', fontSize: 13, color: 'rgba(0,0,0,0.55)', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
            This is a courtesy translation. The Spanish version is the one that legally applies; switch to Español at the top to read it.
          </p>
        )}
        {children}
      </main>
      <footer style={{ borderTop: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
          <Link href="/terminos" style={{ color: 'rgba(0,0,0,0.45)' }}>{t('Términos')}</Link>
          <Link href="/privacidad" style={{ color: 'rgba(0,0,0,0.45)' }}>{t('Privacidad')}</Link>
          <Link href="/arrepentimiento" style={{ color: 'rgba(0,0,0,0.45)' }}>{t('Botón de arrepentimiento')}</Link>
          <Link href="/#contacto" style={{ color: 'rgba(0,0,0,0.45)' }}>{t('Contacto')}</Link>
        </div>
      </footer>
    </div>
  );
}
