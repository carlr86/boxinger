import { Clarity } from '@/components/Clarity';

// Public pages (landing, Slack, legal). Only these load Microsoft Clarity; /app never does.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<Clarity /></>;
}
