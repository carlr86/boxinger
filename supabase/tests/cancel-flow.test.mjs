// Cancelling Pro: which board stays active on Free, what the account loses, and the cancel reason in Admin.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, '{"name":"X"}') returning id`, [email])).rows[0].id;
const owner = await mk('ana@acme.com');
const other = await mk('rival@x.com');
const member = await mk('mem@acme.com');
const root = await mk('admin@boxinger.com');
await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'invite', '']);
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
const team = (await db.query(`select team_id from public.boards where id = $1`, [ob.board_id])).rows[0].team_id;
const b2 = (await rpc(owner, 'create_board', [team, 'Segundo', 'invite', true, true])).id;
const t2 = await rpc(owner, 'create_team', ['Otro equipo', false]);
const b3 = (await rpc(owner, 'create_board', [t2, 'Tercero', 'private', true, true])).id;
await db.query(`insert into public.team_members (team_id, user_id, role) values ($1, $2, 'member')`, [team, member]);
await db.query(`update public.boards set allowed_domains = '{acme.com,acme.org}' where id = $1`, [b2]);
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [b2])).rows[0].id;
const idea = await rpc(owner, 'create_idea', [b2, 'Exportar a Excel', 'Necesito exportar los reportes a Excel para el equipo.', cat]);
await db.query(`update public.ideas set status = 'aprobada', rm_col = 'ahora', impact = 4, effort = 2 where id = $1`, [idea]);

console.log('\n# what Free takes away');
await ok('usage: oldest board kept, the rest listed', async () => {
  const u = await rpc(owner, 'my_pro_usage');
  eq(u.kept.name, 'Principal');
  eq(u.locked_boards.map((b) => b.name), ['Segundo', 'Tercero']);
  eq(u.teams_locked, 1); eq(u.members, 1); eq(u.roadmap_ideas, 1); eq(u.rated_ideas, 1); eq(u.domains, 2); eq(u.private_boards, 1);
});
await ok('choose another board to keep (while Pro)', async () => {
  await rpc(owner, 'set_free_board', [b2]);
  eq((await rpc(owner, 'my_pro_usage')).kept.name, 'Segundo');
  await rpc(owner, 'set_free_board', [b3]);
  eq((await rpc(owner, 'my_pro_usage')).kept.name, 'Tercero');
});
await err('only the owner chooses', () => rpc(other, 'set_free_board', [b2]), 'dueño');
await ok('on Free the chosen board stays writable, the others lock', async () => {
  await db.query(`update public.subscriptions set plan = 'free', status = 'expired' where account_id = $1`, [acc]);
  eq((await rpc(owner, 'get_board', [ (await db.query(`select slug from public.boards where id = $1`, [b3])).rows[0].slug ])).board.locked, false);
  eq((await rpc(owner, 'get_board', [ob.slug])).board.locked, true);
});
await err('on Free, changing again within 30 days is not allowed', () => rpc(owner, 'set_free_board', [ob.board_id]), '30 días');
await ok('after 30 days it is', async () => {
  await db.query(`update public.accounts set free_board_set_at = now() - interval '31 days' where id = $1`, [acc]);
  await rpc(owner, 'set_free_board', [ob.board_id]);
  eq((await rpc(owner, 'get_board', [ob.slug])).board.locked, false);
});
await ok('a deleted chosen board falls back to the oldest', async () => {
  await db.query(`update public.accounts set free_board_id = $2 where id = $1`, [acc, b2]);
  await db.query(`delete from public.boards where id = $1`, [b2]);
  eq((await rpc(owner, 'my_pro_usage')).kept.name, 'Principal');
});
await ok('cancel reason shows in Admin', async () => {
  await db.query(`update public.subscriptions set cancel_reason = 'precio', cancel_note = 'Muy caro', cancelled_at = now() where account_id = $1`, [acc]);
  const d = await rpc(root, 'admin_client_detail', [acc]);
  eq(d.cancel.reason, 'precio'); eq(d.cancel.note, 'Muy caro');
});
await err('pro_usage is not public', () => rpc(owner, 'pro_usage', [acc]), 'permission denied');
done();
