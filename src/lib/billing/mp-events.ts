import 'server-only';
import * as mercadopago from './mercadopago';
import { activate, addMonth, cancelled, findAccount, paymentFailed } from './service';

/** Reads a preapproval from Mercado Pago and mirrors its state on the account. */
export async function handlePreapproval(id: string) {
  const p = await mercadopago.getPreapproval(id);
  const accountId = await findAccount('mercadopago', id, p.external_reference);
  if (!accountId) return;
  const amount = Number(p.auto_recurring?.transaction_amount || 0);
  if (p.status === 'authorized') {
    await activate(accountId, { provider: 'mercadopago', subId: id, currency: 'ARS', amount, periodEnd: p.next_payment_date || addMonth(), plan: mercadopago.planOfPreapproval(p) });
  } else if (p.status === 'paused') {
    await paymentFailed(accountId, 'mercadopago', id, 'paused:' + id + ':' + (p.last_modified || ''));
  } else if (p.status === 'cancelled') {
    await cancelled(accountId, id, p.next_payment_date || null);
  }
}
