import Link from 'next/link';
import { LEGAL } from '@/lib/legal';

// Courtesy translation of page.tsx. Keep both in sync: the Spanish text is the one that applies.
export function TermsEn() {
  const mail = <a href={'mailto:' + LEGAL.email}>{LEGAL.email}</a>;
  return (
    <>
      <h2>1. Who provides the service</h2>
      <p>Boxinger (boxinger.com) is a service of {LEGAL.holder}, CUIT {LEGAL.cuit}, with address at {LEGAL.address} (&quot;Boxinger&quot;, &quot;we&quot;). You can contact us at {mail}.</p>

      <h2>2. Acceptance</h2>
      <p>By creating an account or using Boxinger you accept these terms and the <Link href="/privacidad">Privacy Policy</Link>. You must be over 18. If you use Boxinger on behalf of a company, you represent that you are authorized to accept them on its behalf.</p>

      <h2>3. The service</h2>
      <p>Boxinger is an idea board for product teams. The Admin of an account creates teams and boards; the Members of their team manage ideas; and the Community (guests and visitors of public boards) suggests, votes and comments on ideas as each board allows.</p>
      <p>We may add, change or remove features to improve the service. If a change removes an essential feature of the plan you pay for, we will let you know in advance and you can cancel.</p>

      <h2>4. Accounts</h2>
      <p>You can sign up with email and password or with Google. You must provide true information and keep it up to date. You are responsible for the activity of your account and for keeping your password safe; let us know if you suspect unauthorized access.</p>

      <h2>5. Plans and prices</h2>
      <ul>
        <li><b>Free:</b> no cost, with the limits shown on the plans page (1 team with 1 board, no members).</li>
        <li><b>Pro:</b> monthly subscription paid in advance by international card through Creem (in US dollars) or with Mercado Pago (in Argentine pesos). It renews automatically every month until you cancel it.</li>
        <li><b>Enterprise:</b> a custom plan arranged by direct contact, with conditions agreed in writing.</li>
      </ul>
      <p>Current prices are shown on the website and in My profile before you buy. For users in Argentina they are final prices. We may offer special prices for a set period; when it ends, the subscription returns to the list price.</p>
      <p>If we change the Pro price, we will email you before it applies. The new price applies from the period after the notice; if you don’t agree, you can cancel before that charge.</p>
      <p>Payments are processed by Mercado Pago and Creem under their own terms. For payments in US dollars, Creem acts as authorized reseller (merchant of record): it charges you, calculates any taxes that apply in your country and issues your receipt. Boxinger does not receive or store your card details. If a charge fails, the provider may retry it; if it isn’t settled, the account may return to the Free plan.</p>

      <h2>6. Cancellation</h2>
      <p>You can cancel Pro anytime from <Link href="/app/perfil?tab=sub">My profile › Subscription</Link>, as easily as you subscribed. No further charges are made and you keep Pro until the end of the period already paid; after that the account moves to Free. Your boards and data are kept, but those over the Free plan are locked until you return to Pro.</p>

      <h2>7. Right of withdrawal and refunds</h2>
      <p>If you are a consumer, you can withdraw from your Pro purchase within <b>10 calendar days</b> of making it, without giving reasons and at no cost, under article 34 of Argentine Law 24,240. Do it from the <Link href="/arrepentimiento">Withdrawal button</Link> (no sign-in needed) or by writing to {mail}. We give you a request code, cancel the subscription and refund the full amount to the same payment method.</p>
      <p>Outside that period we do not refund partial periods: when you cancel, you keep using Pro until the end of the paid period. If there was a duplicate or wrong charge, write to us and we will fix it.</p>

      <h2>8. Your content</h2>
      <p>The ideas, comments, images and other content you post remain yours. By posting them:</p>
      <ul>
        <li>you authorize us to store and show them within the service to whoever has access to that board (on a public board, anyone with the link);</li>
        <li>you authorize the Admin and the team that owns the board to use your ideas and comments, without compensation, to evaluate and build their product.</li>
      </ul>
      <p>Each team moderates its boards: it can hide ideas or comments and block participants. The owner of each board is responsible for its use and for what it asks of its Community.</p>

      <h2>9. Acceptable use</h2>
      <p>You may not use Boxinger to post illegal, defamatory, discriminatory or offensive content, or content that infringes third-party rights; send spam; impersonate another person; collect other users’ data; or try to access without authorization, overload or breach the platform.</p>

      <h2>10. Intellectual property</h2>
      <p>The Boxinger brand, software, design and service texts belong to us or our licensors. We grant you a personal, non-exclusive and non-transferable permission to use Boxinger under these terms.</p>

      <h2>11. Third-party services</h2>
      <p>Boxinger uses third-party services, such as Google (sign-in), Creem and Mercado Pago (payments). Their use is also governed by each one’s terms.</p>

      <h2>12. Availability and liability</h2>
      <p>We work to keep Boxinger running continuously and securely, but there may be interruptions due to maintenance, failures or causes beyond our control. To the extent permitted by law, we are not liable for indirect damages or lost profits arising from the use of, or inability to use, the service, nor for the content users post. Nothing above limits the rights Law 24,240 grants you as a consumer.</p>

      <h2>13. Suspension and termination of accounts</h2>
      <p>We may suspend or terminate accounts or boards that breach these terms, with prior notice except in serious or urgent cases. You can delete your account anytime from My profile: if you own an account, your subscription is canceled and your teams and boards are deleted along with their ideas, votes and comments.</p>

      <h2>14. Changes to these terms</h2>
      <p>If we modify these terms, we will publish the new version on this page and, if the change is important, email you at least 15 days in advance. If you keep using Boxinger after that date, you are deemed to accept the changes; if not, you can cancel and delete your account.</p>

      <h2>15. Governing law and jurisdiction</h2>
      <p>These terms are governed by the laws of the Argentine Republic. Any dispute falls under the ordinary courts of the Autonomous City of Buenos Aires, without prejudice to consumers’ right to file claims before the courts of their domicile or consumer protection authorities.</p>

      <h2>16. Contact</h2>
      <p>For any question about these terms, write to {mail} or use the <Link href="/#contacto">contact form</Link>.</p>
    </>
  );
}
