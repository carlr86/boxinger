// Enterprise bought on the web follows the paid-plan rules; Enterprise assigned by the platform admin stays on.
import { setup } from './harness.mjs';

const { db, rpc, ok, eq, done } = await setup();
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

await done();
