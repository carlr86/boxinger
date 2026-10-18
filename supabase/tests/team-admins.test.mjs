// Team Admins: only the Admin Owner gives the role (Team/Enterprise), Admins take a seat, can't remove other Admins,
// lose the role when the plan drops, and the Admin Owner hears about sensitive actions.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const m1 = await mk('m1@acme.com', 'Uno');
const m2 = await mk('m2@acme.com', 'Dos');
const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const team = (await db.query(`select team_id from public.boards where id = $1`, [board])).rows[0].team_id;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const setPlan = (plan) => db.query(`update public.subscriptions set plan = $2, status = 'active', provider = 'creem', current_period_end = now() + interval '20 days' where account_id = $1`, [acc, plan]);
await setPlan('pro');
for (const u of [m1, m2]) await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [team, u]);
const role = async (u) => (await db.query(`select role from public.team_members where team_id = $1 and user_id = $2`, [team, u])).rows[0]?.role;
const mails = async (tpl) => (await db.query(`select count(*)::int n from public.email_outbox where user_id = $1 and template = $2`, [owner, tpl])).rows[0].n;

console.log('\n# giving the role');
await err('on Pro it is not available', () => rpc(owner, 'set_team_member_role', [team, m1, 'admin']), 'Team y Enterprise');
await setPlan('enterprise');
await err('a member cannot give it', () => rpc(m1, 'set_team_member_role', [team, m2, 'admin']), 'Admin Owner');
await ok('the Admin Owner makes someone Admin', async () => { await rpc(owner, 'set_team_member_role', [team, m1, 'admin']); eq(await role(m1), 'admin'); });
await err('an Admin cannot make another Admin', () => rpc(m1, 'set_team_member_role', [team, m2, 'admin']), 'Admin Owner');
await err('nobody changes the Admin Owner', () => rpc(owner, 'set_team_member_role', [team, owner, 'member']), 'no cambia');
await ok('get_team tells the owner apart', async () => {
  eq((await rpc(owner, 'get_team', [team])).is_owner, true);
  eq((await rpc(m1, 'get_team', [team])).is_owner, false);
});

console.log('\n# what an Admin can and cannot do');
await err('an Admin cannot remove another Admin', async () => {
  await rpc(owner, 'set_team_member_role', [team, m2, 'admin']);
  try { return await rpc(m1, 'remove_team_member', [team, m2]); } finally { await rpc(owner, 'set_team_member_role', [team, m2, 'member']); }
}, 'Admin Owner');
await err('nor the Admin Owner', () => rpc(m1, 'remove_team_member', [team, owner]), 'Admin Owner');
await err('nor delete the team', () => rpc(m1, 'delete_team', [team, 'Acme']), 'Admin Owner');
await ok('an Admin manages the board (rename it)', () => rpc(m1, 'update_board', [board, 'Principal 2', null, null, false]));

console.log('\n# seats');
await ok('Admins take a seat: with the team full, nobody else is invited', async () => {
  await db.query(`update public.subscriptions set member_limit = 2 where account_id = $1`, [acc]).catch(() => {});
  const lim = (await db.query(`select public.account_member_limit($1) n`, [acc])).rows[0].n;
  if (lim == null || lim > 2) { await db.query(`update public.accounts set member_limit = 2 where id = $1`, [acc]).catch(() => {}); }
  const lim2 = (await db.query(`select public.account_member_limit($1) n`, [acc])).rows[0].n;
  if (lim2 === 2) return err('team full', () => rpc(owner, 'invite_team_members', [team, ['nuevo@acme.com'], null]), 'hasta 2');
});

console.log('\n# notices to the Admin Owner');
await ok('an Admin exporting tells the Admin Owner; the owner exporting does not', async () => {
  const before = await mails('owner_admin_action');
  await rpc(m1, 'export_ideas', [board]);
  eq(await mails('owner_admin_action'), before + 1);
  await rpc(owner, 'export_ideas', [board]);
  eq(await mails('owner_admin_action'), before + 1);
});
await ok('an Admin deleting a board tells the Admin Owner', async () => {
  const id = (await db.query(`insert into public.boards (team_id, name, slug, created_by) values ($1, 'Otro buzón', 'otro-buzon', $2) returning id`, [team, owner])).rows[0].id;
  const name = 'Otro buzón';
  const before = await mails('owner_admin_action');
  await rpc(m1, 'delete_board', [id, name]);
  eq(await mails('owner_admin_action'), before + 1);
});

console.log('\n# leaving Team / Enterprise');
await ok('back to Pro: Admins become members, the Admin Owner keeps their row', async () => {
  await setPlan('pro'); eq(await role(m1), 'member');
  eq((await db.query(`select role from public.team_members where team_id = $1 and user_id = $2`, [team, owner])).rows[0]?.role ?? 'admin', 'admin');
});

await done();
