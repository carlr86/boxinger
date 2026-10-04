// Production error log: dedupe, alert throttling and the admin view.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const rec = async (fp, msg = 'boom') => (await db.query(`select public.record_app_error('server', $1, '{"path":"/x"}', $2) as n`, [msg, fp])).rows[0].n;
const mk = async (email) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, '{"name":"X"}') returning id`, [email])).rows[0].id;
const root = await mk('admin@boxinger.com');
const user = await mk('ana@acme.com');
await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);

console.log('\n# app errors');
await ok('first time alerts', async () => eq(await rec('a'), true));
await ok('repeat within 6h: no alert, counted', async () => {
  eq(await rec('a'), false);
  eq((await db.query(`select count from public.app_errors where fingerprint = 'a'`)).rows[0].count, 2);
});
await ok('after 6h it alerts again', async () => {
  await db.query(`update public.app_errors set notified_at = now() - interval '7 hours' where fingerprint = 'a'`);
  eq(await rec('a'), true);
});
await ok('admin sees open errors', async () => { const r = await rpc(root, 'admin_errors', [20]); eq(r.open, 1); eq(r.rows[0].count, 3); });
await err('a regular user cannot see them', () => rpc(user, 'admin_errors', [20]), 'Admin de plataforma');
await err('nobody but the service role can record', () => rpc(user, 'record_app_error', ['x', 'y', {}, 'z']), 'permission denied');
await ok('resolved and back: alerts right away', async () => {
  const id = (await rpc(root, 'admin_errors', [20])).rows[0].id;
  await rpc(root, 'admin_resolve_error', [id]);
  eq((await rpc(root, 'admin_errors', [20])).open, 0);
  eq(await rec('a'), true);
  eq((await rpc(root, 'admin_errors', [20])).open, 1);
});
await ok('at most 20 alert emails per hour', async () => {
  let n = 0;
  for (let i = 0; i < 25; i++) if (await rec('flood' + i)) n++;
  eq(n, 19); // 'a' already used one of the 20
});
await ok('resolve all', async () => { await rpc(root, 'admin_resolve_error', [null]); eq((await rpc(root, 'admin_errors', [20])).open, 0); });
done();
