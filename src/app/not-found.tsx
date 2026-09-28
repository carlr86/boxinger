import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f5f5', padding: 24 }}>
      <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: 32, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>No encontramos esta página</h1>
        <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)' }}>Puede que el buzón o la idea ya no existan, o que el link esté mal.</span>
        <Link href="/app">Ir a Boxinger</Link>
      </div>
    </div>
  );
}
