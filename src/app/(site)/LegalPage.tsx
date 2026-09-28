import Link from 'next/link';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <header style={{ borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(0,0,0,0.88)' }}>
            <span style={{ width: 30, height: 30, borderRadius: 7, background: '#059669', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>B</span>
            <span style={{ fontWeight: 600, fontSize: 17 }}>Boxinger</span>
          </Link>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 96px', fontSize: 15, lineHeight: 1.7, color: 'rgba(0,0,0,0.78)' }}>
        <h1 style={{ fontSize: 32, margin: '0 0 4px', color: 'rgba(0,0,0,0.88)' }}>{title}</h1>
        <p style={{ margin: '0 0 32px', color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>Última actualización: {updated}</p>
        {children}
      </main>
    </div>
  );
}
