import Link from 'next/link';
import { LEGAL } from '@/lib/legal';

// Courtesy translation of page.tsx. Keep both in sync: the Spanish text is the one that applies.
export function PrivacyEn() {
  const mail = <a href={'mailto:' + LEGAL.email}>{LEGAL.email}</a>;
  return (
    <>
      <p>This policy explains what personal data Boxinger processes, why, and what rights you have, under Argentine Law 25,326 on the Protection of Personal Data and its complementary rules.</p>

      <h2>1. Controller</h2>
      <p>The controller of the database is {LEGAL.holder}, CUIT {LEGAL.cuit}, with address at {LEGAL.address}. Contact: {mail}.</p>

      <h2>2. What data we process</h2>
      <ul>
        <li><b>Account:</b> name, email, password (stored encrypted; we can’t see it) and, if you sign in with Google, your Google name, email and profile photo.</li>
        <li><b>Profile and preferences:</b> the photo or logo you upload, your notification preferences and your interface language.</li>
        <li><b>Content and activity:</b> ideas, votes, comments, reactions, the boards and teams you create or join, invitations you send (the invitee’s email) and activity dates.</li>
        <li><b>Subscription:</b> plan, status, amounts, billing dates and the subscription identifiers in Creem or Mercado Pago, including the Mercado Pago account email you enter when paying. Your card details are processed by Creem or Mercado Pago and never reach Boxinger.</li>
        <li><b>Contact:</b> what you send us through the contact form or the withdrawal button (name, email, company, message).</li>
        <li><b>Technical data:</b> what is needed to keep your session and protect the service. From public forms we only keep an encrypted identifier of the connection to prevent abuse, never your IP address.</li>
      </ul>

      <h2>3. What we use it for</h2>
      <ul>
        <li>Creating and managing your account and giving you access to boards.</li>
        <li>Showing your participation on boards to those who have access.</li>
        <li>Sending you service emails: account confirmation, invitations, status changes of your ideas, replies, subscription notices and the notifications you chose.</li>
        <li>Charging the subscription, issuing receipts and meeting legal and tax obligations.</li>
        <li>Answering your questions and requests.</li>
        <li>Keeping the service secure, preventing fraud and abuse, and improving it.</li>
      </ul>
      <p>We do not sell or rent your data, we do not use it for third-party advertising and we do not build commercial profiles with it. We process your data with your consent, which you give when signing up, and to provide the service you contracted.</p>

      <h2>4. Who sees your information within Boxinger</h2>
      <ul>
        <li>Your name, your photo and what you post on a board are visible to anyone with access to that board. On a public board, anyone with the link.</li>
        <li>The team that owns a board (Admin and Members) sees the email of those who take part in its Community, so it can manage it.</li>
        <li>The Admin of a team sees the name and email of the members they invite.</li>
      </ul>

      <h2>5. Providers and international transfer</h2>
      <p>To run the service we share the necessary data with these providers, who process it on our behalf with adequate security measures:</p>
      <ul>
        <li><b>Supabase:</b> database, authentication and files, with servers in the United States.</li>
        <li><b>Hostinger:</b> website hosting and email delivery.</li>
        <li><b>Google:</b> sign-in with Google, if you choose it.</li>
        <li><b>Creem and Mercado Pago:</b> payment processing, under their own privacy policies. Creem acts as reseller for payments in US dollars.</li>
      </ul>
      <p>Some of these providers store data outside Argentina, in countries that may not have an equivalent level of protection. By using Boxinger you consent to that transfer, which is limited to what is needed to provide the service. We may also disclose data if a competent authority requires it under the law.</p>

      <h2>6. Cookies and local storage</h2>
      <p>We use essential cookies to keep you signed in and to remember your language, and the browser’s local storage to remember interface preferences. We don’t use advertising cookies or third-party analytics tools. If you block them, you won’t be able to sign in.</p>

      <h2>7. How long we keep it</h2>
      <p>We keep your data while your account is active. If you delete it from My profile, we delete your profile and your sign-in data. Ideas and comments you posted on other teams’ boards are kept as from a &quot;Deleted user&quot;, without your name or email. If you own an account, your teams and boards are deleted with all their content. Payment records are kept for as long as tax and accounting rules require.</p>

      <h2>8. Security</h2>
      <p>We apply technical and organizational measures to protect your data: encrypted connections (HTTPS), encrypted passwords, role-based access controls in the database and restricted access to information. No system is completely infallible; if an incident affecting your data occurs, we will let you know.</p>

      <h2>9. Your rights</h2>
      <p>You can access, rectify, update and ask us to delete your data. Most of it you can do directly from <Link href="/app/perfil">My profile</Link> (name, photo, notifications, subscription and account deletion). For the rest, write to {mail} from your account email. We answer access requests within 10 calendar days and rectification or deletion requests within 5 business days. The right of access is free at intervals of no less than six months, unless you show a legitimate interest.</p>
      <p>You can stop receiving optional notifications from <Link href="/app/perfil?tab=notif">My profile › Notifications</Link>. Emails needed for the service (security, payments, invitations) keep being sent while you have an account.</p>
      <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}>
        The data subject has the right to access their data free of charge at intervals of no less than six months, unless a legitimate interest is shown, as established in article 14, paragraph 3 of Law No. 25,326. The AGENCY FOR ACCESS TO PUBLIC INFORMATION, as the Control Body of Law No. 25,326, has the power to handle complaints and claims filed by those whose rights are affected by non-compliance with the rules in force on personal data protection.
      </p>

      <h2>10. Minors</h2>
      <p>Boxinger is for people over 18. We do not knowingly collect data from minors; if we detect an account belonging to a minor, we close it.</p>

      <h2>11. Changes to this policy</h2>
      <p>If we modify it, we will publish the new version on this page with its update date and, if the change is important, let you know by email.</p>

      <h2>12. Contact</h2>
      <p>For any question about your data, write to {mail}.</p>
    </>
  );
}
