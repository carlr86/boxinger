import Link from 'next/link';
import { LanguageSwitch } from '@/components/LanguageSwitch';

export function Logo({ size = 28, compactOnMobile }: { size?: number; compactOnMobile?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(0,0,0,0.88)' }}>
      <img src="/logo.svg" alt="" width={size} height={size} style={{ display: 'block', flex: 'none' }} />
      <span className={compactOnMobile ? 'bx-hide-mobile' : undefined} style={{ fontWeight: 600, fontSize: 16 }}>Boxinger</span>
    </span>
  );
}

/** Header for screens outside a board (auth, onboarding, invitations). */
export function SimpleHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, position: 'sticky', top: 0, zIndex: 20 }}>
      <Link href="/" style={{ color: 'inherit' }}><Logo /></Link>
      <div style={{ flex: 1 }} />
      {right ?? <LanguageSwitch />}
    </header>
  );
}
