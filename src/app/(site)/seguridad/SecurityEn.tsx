import Link from 'next/link';
import { LEGAL } from '@/lib/legal';

// Courtesy translation of page.tsx. Keep both in sync: the Spanish text is the one that applies.
export function SecurityEn() {
  const mail = <a href={'mailto:' + LEGAL.email}>{LEGAL.email}</a>;
  return (
    <>
      <p>At Boxinger we protect each customer’s data and that of their users with strict isolation, encryption and data minimization, under Argentine Law 25,326 on the Protection of Personal Data and with an approach aligned to the GDPR standard. This page summarizes how we do it. For enterprise customers we also offer a signable Data Processing Agreement (DPA).</p>

      <h2>1. Isolation between customers</h2>
      <p>Each customer can access only their own data. Isolation does not depend on the application code: it is enforced in the database with PostgreSQL Row Level Security, which filters every query by the authenticated user before returning a single record. In practice, a user of one customer can never see another customer’s ideas, votes, comments or members, even if they try to manipulate the application from their browser.</p>

      <h2>2. Encryption</h2>
      <ul>
        <li><b>In transit:</b> all traffic travels over HTTPS/TLS. HTTP access is automatically redirected to HTTPS and HSTS is applied (forced secure connection).</li>
        <li><b>At rest:</b> data is stored encrypted on Supabase’s infrastructure (on AWS).</li>
        <li><b>Passwords:</b> stored hashed; we cannot see or recover them.</li>
      </ul>

      <h2>3. Use of data</h2>
      <p>We do not sell or rent data, we do not run third-party advertising and we do not build commercial profiles. We only process data to provide the contracted service and according to the user’s consent. We use no third-party analytics tools and no advertising cookies.</p>

      <h2>4. AI assistant and your data</h2>
      <p>The AI assistant is available only on the Enterprise plan and is used when the team chooses to enable it. When used, only the board’s idea text, its description and vote and comment counts are sent to the model provider (Anthropic), <b>with no names or emails</b> of users. Anthropic does not use this data to train its models. If the assistant is not enabled, nothing is sent to the AI.</p>

      <h2>5. Data minimization</h2>
      <p>We collect only what the service needs to work. In particular, we do not store users’ IP addresses: from public forms we keep only an encrypted identifier of the connection, used to prevent abuse. Card details never reach Boxinger: they are processed directly by the payment gateways (Creem or Mercado Pago).</p>

      <h2>6. Data subject rights and deletion</h2>
      <ul>
        <li><b>Access and rectification:</b> users can view and correct their account and profile data from <Link href="/app/perfil">My profile</Link>.</li>
        <li><b>Deletion:</b> ideas, teams and accounts can be deleted, along with their associated data.</li>
        <li><b>Traceability:</b> administrative actions are kept in an audit log (who did what and when).</li>
      </ul>

      <h2>7. Providers (sub-processors)</h2>
      <p>To operate the service we share the necessary data with these providers, which process it on our behalf and with appropriate security measures:</p>
      <ul>
        <li><b>Supabase:</b> database, authentication and files, with servers in the United States.</li>
        <li><b>Hostinger:</b> web hosting and email delivery.</li>
        <li><b>Anthropic:</b> AI assistant (Enterprise only; idea text with no personal data).</li>
        <li><b>Creem and Mercado Pago:</b> payment processing. Creem acts as reseller for payments in US dollars.</li>
      </ul>
      <p>We notify Enterprise customers of any change of sub-processors. The current list is part of the DPA.</p>

      <h2>8. Legal framework, residency and contact</h2>
      <ul>
        <li><b>Legal framework:</b> we comply with Argentine Law 25,326 on the Protection of Personal Data, with an approach aligned to the GDPR standard. We publish a <Link href="/privacidad">Privacy Policy</Link> and <Link href="/terminos">Terms</Link>.</li>
        <li><b>Data residency:</b> data is hosted primarily in the United States (Supabase/AWS). If your organization requires a specific region, contact us.</li>
        <li><b>Incidents:</b> in the event of an incident affecting personal data, we notify the affected customers.</li>
        <li><b>DPA and contact:</b> we offer a signable Data Processing Agreement for Enterprise customers. To request it or for privacy inquiries, write to {mail}.</li>
      </ul>

      <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}>
        Informational page, not contractual. The data processing relationship with each customer is governed by the DPA signed between the parties.
      </p>
    </>
  );
}
