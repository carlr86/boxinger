// Enterprise bought on the web follows the paid-plan rules; Enterprise assigned by the platform admin stays on.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, '{"name":"X"}') returning id`, [email])).rows[0].id;
const owner = await mk('ana@acme.com');
await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const set = (sql) => db.query(`update public.subscriptions set ${sql} where account_id = $1`, [acc]);
const plan = async () => (await db.query(`select public.account_plan($1) p, public.account_is_pro($1) pro, public.account_member_limit($1) m`, [acc])).rows[0];

console.log('\n# paid Enterprise');
await ok('active (Creem): Enterprise, Pro features, 20 members', async () => {
  await set(`plan = 'enterprise', status = 'active', provider = 'creem', provider_subscription_id = 'sub_1', current_period_end = now() + interval '30 days'`);
  const p = await plan(); eq([p.p, p.pro, p.m], ['enterprise', true, 20]);
});
await ok('payment pending: still Enterprise', async () => { await set(`status = 'past_due'`); eq((await plan()).p, 'enterprise'); });
await ok('cancelled with days paid left: still Enterprise', async () => { await set(`status = 'cancelled', cancel_at_period_end = true`); eq((await plan()).p, 'enterprise'); });
await ok('cancelled and the period is over: Free', async () => {
  await set(`current_period_end = now() - interval '1 day'`);
  const p = await plan(); eq([p.p, p.pro, p.m], ['free', false, 4]);
});
await ok('expired: Free', async () => { await set(`status = 'expired'`); eq((await plan()).p, 'free'); });

console.log('\n# Enterprise assigned by the platform admin');
await ok('manual stays on whatever the dates say', async () => {
  await set(`plan = 'enterprise', status = 'active', provider = 'manual', provider_subscription_id = null, current_period_end = null`);
  eq((await plan()).p, 'enterprise');
});
await ok('Pro rules unchanged', async () => {
  await set(`plan = 'pro', status = 'cancelled', provider = 'mercadopago', current_period_end = now() + interval '5 days'`);
  eq((await plan()).p, 'pro');
  await set(`current_period_end = now() - interval '1 day'`);
  eq((await plan()).p, 'free');
});


console.log('\n# Enterprise price schedule');
const root = await mk('admin@boxinger.com');
await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);
const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
await ok('current prices: Pro and Enterprise apart', async () => {
  const pr = await rpc(root, 'admin_prices');
  eq(Number(pr.enterprise.current.USD), 19.99); eq(Number(pr.enterprise.current.ARS), 29999);
  eq(pr.rows.every((r) => r.state), true);
  eq((await db.query(`select public.current_price('USD') p`)).rows[0].p !== null, true);
});
await ok('schedule a new Enterprise price: only Enterprise subscribers get the notice', async () => {
  await set(`plan = 'enterprise', status = 'active', provider = 'mercadopago', currency = 'ARS', current_period_end = now() + interval '30 days', deal_type = null`);
  const other = await mk('pro@x.com'); await rpc(other, 'onboard', ['P', 'Uno', 'public', '']);
  await db.query(`update public.subscriptions set plan = 'pro', status = 'active', provider = 'mercadopago', currency = 'ARS' where account_id = (select id from public.accounts where owner_id = $1)`, [other]);
  const id = await rpc(root, 'admin_schedule_price', ['ARS', 34999, tomorrow, 'all', true, 'enterprise']);
  const to = (await db.query(`select to_email from public.email_outbox where dedupe_key like 'price:' || $1 || ':%'`, [id])).rows.map((r) => r.to_email);
  eq(to, ['ana@acme.com']);
  const pr = await rpc(root, 'admin_prices');
  eq(pr.enterprise.rows.find((r) => r.id === id).state, 'scheduled'); eq(pr.rows.some((r) => r.id === id), false);
});
await ok('a Pro price change does not notify Enterprise subscribers', async () => {
  const id = await rpc(root, 'admin_schedule_price', ['ARS', 16999, tomorrow, 'all', true, 'pro']);
  const to = (await db.query(`select to_email from public.email_outbox where dedupe_key like 'price:' || $1 || ':%'`, [id])).rows.map((r) => r.to_email);
  eq(to, ['pro@x.com']);
});
await err('same day twice for the same plan', () => rpc(root, 'admin_schedule_price', ['ARS', 35999, tomorrow, 'all', false, 'enterprise']), 'ese día');
await ok('once it starts, it is the Enterprise price', async () => {
  await db.query(`update public.price_schedule set effective_from = now() - interval '1 second' where plan = 'enterprise' and amount = 34999`);
  eq(Number((await db.query(`select public.current_plan_price('enterprise', 'ARS') p`)).rows[0].p), 34999);
  eq(Number((await db.query(`select public.current_plan_price('enterprise', 'USD') p`)).rows[0].p), 19.99);
});

await done();
