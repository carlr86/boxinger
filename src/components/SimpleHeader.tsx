import Link from 'next/link';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(0,0,0,0.88)' }}>
      <span style={{ width: size, height: size, borderRadius: 6, background: '#059669', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15 }}>B</span>
      <span style={{ fontWeight: 600, fontSize: 16 }}>Boxinger</span>
    </span>
  );
}

/** Header for screens outside a board (auth, onboarding, invitations). */
export function SimpleHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, position: 'sticky', top: 0, zIndex: 20 }}>
      <Link href="/" style={{ color: 'inherit' }}><Logo /></Link>
      <div style={{ flex: 1 }} />
      {right}
    </header>
  );
}
