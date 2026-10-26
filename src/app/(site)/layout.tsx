import { Clarity } from '@/components/Clarity';
import { CookieBanner } from '@/components/CookieBanner';

// Public pages (landing, Slack, legal). Only these load Microsoft Clarity, after the cookie notice; /app never does.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<CookieBanner /><Clarity /></>;
}
