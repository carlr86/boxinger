// Refunds on recorded charges: billed in the admin panel = amount − refunded.
import { setup } from './harness.mjs';

const { db, rpc, ok, eq, done } = await setup();
const mk = async (email) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, '{"name":"X"}') returning id`, [email])).rows[0].id;
const root = await mk('admin@boxinger.com');
const owner = await mk('ana@acme.com');
await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);
await rpc(owner, 'onboard', ['Acme', 'Acme', 'invite', '']);
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const pay = (id, amount, cur, status = 'completed', refunded = 0) => db.query(
  `insert into public.payments (account_id, provider, provider_payment_id, amount, currency, status, refunded_amount, paid_at) values ($1, 'mercadopago', $2, $3, $4, $5, $6, now())`,
  [acc, id, amount, cur, status, refunded]);

console.log('\n# refunds');
await pay('p1', 14999, 'ARS');
await pay('p2', 14999, 'ARS', 'completed', 4999);
await pay('p3', 14999, 'ARS', 'refunded', 14999);
await pay('c1', 9.99, 'USD');
await pay('f1', 9.99, 'USD', 'failed');
await ok('billed subtracts refunds and ignores failed charges', async () => {
  const d = await rpc(root, 'admin_client_detail', [acc]);
  eq(Number(d.billed_ars), 14999 + 10000);
  eq(Number(d.billed), 9.99);
});
await ok('payments list carries the refunded amount', async () => {
  const d = await rpc(root, 'admin_client_detail', [acc]);
  eq(d.payments.map((p) => Number(p.refunded_amount)).sort((a, b) => a - b), [0, 0, 0, 4999, 14999]);
});
done();
