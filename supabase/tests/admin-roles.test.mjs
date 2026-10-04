// Platform admin: changing a person between Invitado and Miembro.
import { setup } from './harness.mjs';

const { db, as, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { name }])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const flor = await mk('flor@acme.com', 'Flor');
const root = await mk('admin@boxinger.com', 'Root');
await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);
const ob = await rpc(owner, 'onboard', ['Acme', 'Acme Ideas', 'invite', 'x']);
const board = ob.board_id, slug = ob.slug;
await rpc(owner, 'invite_guests', [board, ['flor@acme.com']]);
await rpc(flor, 'join_board', [slug]);
const role = async () => (await rpc(root, 'admin_users')).find((u) => u.user_id === flor).role;
console.log('\n# admin_set_user_role');
await ok('starts as Invitado', async () => eq(await role(), 'Invitado'));
await err('owner cannot use it', () => rpc(owner, 'admin_set_user_role', [flor, board, 'member']), '');
await err('Free account cannot get members', () => rpc(root, 'admin_set_user_role', [flor, board, 'member']), 'Free');
await db.query(`update public.subscriptions set plan = 'enterprise'`);
await ok('promote to Miembro', async () => { await rpc(root, 'admin_set_user_role', [flor, board, 'member']); eq(await role(), 'Miembro'); });
await ok('guest seat removed, sees board as member', async () => {
  eq((await db.query(`select count(*)::int n from public.board_guests where user_id = $1`, [flor])).rows[0].n, 0);
  eq((await rpc(flor, 'get_board', [slug])).role, 'member');
});
await err('promote twice', () => rpc(root, 'admin_set_user_role', [flor, board, 'member']), 'Ya es Miembro');
await err('owner role cannot change', () => rpc(root, 'admin_set_user_role', [owner, board, 'guest']), 'Admin de la cuenta');
await ok('demote to Invitado', async () => { await rpc(root, 'admin_set_user_role', [flor, board, 'guest']); eq(await role(), 'Invitado'); eq((await rpc(flor, 'get_board', [slug])).role, 'guest'); });
await err('demote twice', () => rpc(root, 'admin_set_user_role', [flor, board, 'guest']), 'Ya es Invitado');
await ok('audit logged', async () => eq((await db.query(`select count(*)::int n from public.audit_log where action = 'user_role'`)).rows[0].n, 2));
done();
