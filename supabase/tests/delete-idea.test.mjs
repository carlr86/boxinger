// Deleting an idea (duplicates): only whoever manages the board, and everything attached goes with it.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, '{"name":"X"}') returning id`, [email])).rows[0].id;
const owner = await mk('ana@acme.com');
const member = await mk('mem@acme.com');
const voter = await mk('voter@x.com');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const team = (await db.query(`select team_id from public.boards where id = $1`, [board])).rows[0].team_id;
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [team, member]);
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
const keep = await rpc(owner, 'create_idea', [board, 'Exportar a Excel', 'Necesito exportar los reportes a Excel para el equipo.', cat]);
const dup = await rpc(owner, 'create_idea', [board, 'Exportar reportes a Excel', 'Lo mismo: bajar los reportes en Excel para compartirlos.', cat]);
await db.query(`insert into public.votes (idea_id, user_id, value) values ($1, $2, 'importante')`, [dup, voter]);
await db.query(`insert into public.comments (idea_id, author_id, body) values ($1, $2, 'Me sirve')`, [dup, voter]);
await db.query(`insert into public.notifications (user_id, kind, payload, dedupe_key) values ($1, 'new_idea', jsonb_build_object('idea_id', $2::bigint), 'test')`, [owner, dup]);

console.log('\n# delete an idea');
await err('the Community cannot delete', () => rpc(voter, 'delete_idea', [dup]), 'Admin del equipo');
await err('a member who did not create the board cannot delete', () => rpc(member, 'delete_idea', [dup]), 'Admin del equipo');
await ok('the Admin deletes it with its votes, comments and notices', async () => {
  await rpc(owner, 'delete_idea', [dup]);
  const n = async (sql) => (await db.query(sql, [dup])).rows[0].n;
  eq(await n(`select count(*)::int n from public.ideas where id = $1`), 0);
  eq(await n(`select count(*)::int n from public.votes where idea_id = $1`), 0);
  eq(await n(`select count(*)::int n from public.comments where idea_id = $1`), 0);
  eq(await n(`select count(*)::int n from public.notifications where payload ->> 'idea_id' = $1::text`), 0);
  eq((await db.query(`select count(*)::int n from public.ideas where id = $1`, [keep])).rows[0].n, 1);
});
await err('already deleted', () => rpc(owner, 'delete_idea', [dup]), 'no existe');
await ok('a member who created the board can delete there', async () => {
  const b2 = (await rpc(member, 'create_board', [team, 'Del miembro', 'public', true, true]).catch(async () => {
    await db.query(`update public.teams set members_can_create_boards = true where id = $1`, [team]);
    return rpc(member, 'create_board', [team, 'Del miembro', 'public', true, true]);
  })).id;
  const c2 = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [b2])).rows[0].id;
  const x = await rpc(member, 'create_idea', [b2, 'Idea repetida', 'Una idea repetida que hay que sacar del buzón.', c2]);
  await rpc(member, 'delete_idea', [x]);
});
await err('read-only boards cannot delete', async () => {
  await db.query(`update public.boards set status = 'suspended' where id = $1`, [board]);
  return rpc(owner, 'delete_idea', [keep]);
}, 'solo lectura');

await done();
