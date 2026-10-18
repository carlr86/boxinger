// Brainstorming: vote scales (three options, 1-5, like) with one scoring function, groups by affinity, and «Aceptar».
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const member = await mk('mem@acme.com', 'Mem');
const u1 = await mk('u1@acme.com', 'Uno');
const u2 = await mk('u2@acme.com', 'Dos');
const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const team = ob.team_id;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
for (const u of [member, u1, u2]) await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [team, u]);
const brain = (await rpc(owner, 'create_board', [team, 'Lluvia de ideas', 'private', true, true, 'brainstorm'])).id;
const slug = (await db.query(`select slug from public.boards where id = $1`, [brain])).rows[0].slug;
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [brain])).rows[0].id;
const idea = (who, title) => rpc(who, 'create_idea', [brain, title, 'Una descripción para la lluvia de ideas del equipo.', cat]);
const get = async (id) => (await rpc(owner, 'get_board', [slug])).ideas.find((x) => x.id == id);

console.log('\n# vote scale');
let a, b, c;
await ok('it starts as three options, scored 2/1/0', async () => {
  a = await idea(owner, 'Idea A');
  await rpc(u1, 'vote', [a, 'importante']); await rpc(u2, 'vote', [a, 'interesante']);
  const x = await get(a); eq([x.votes, x.points, x.score], [2, 3, 3]);
});
await err('it can\'t change once there are votes', () => rpc(owner, 'set_vote_scale', [brain, 'cinco']), 'ya hay votos');
await ok('without votes it changes to 1-5', async () => {
  await db.query(`delete from public.votes`);
  await rpc(owner, 'set_vote_scale', [brain, 'cinco']);
  eq((await rpc(owner, 'get_board', [slug])).board.vote_scale, 'cinco');
});
await err('then the old values are refused', () => rpc(u1, 'vote', [a, 'importante']), 'inválido');
await ok('stars add up, with the average', async () => {
  await rpc(u1, 'vote', [a, '5']); await rpc(u2, 'vote', [a, '3']);
  const x = await get(a); eq([x.votes, x.points, Number(x.avg)], [2, 8, 4]);
});
await ok('the Ranking orders by points', async () => {
  b = await idea(owner, 'Idea B'); await rpc(u1, 'vote', [b, '2']);
  eq((await get(a)).rank, 1); eq((await get(b)).rank, 2);
});
await err('a member cannot change the scale', () => rpc(member, 'set_vote_scale', [brain, 'like']), '');
await err('a product board cannot change it', () => rpc(owner, 'set_vote_scale', [ob.board_id, 'like']), 'Brainstorming');

console.log('\n# groups by affinity');
let g1, g2;
await ok('the team creates groups and moves ideas', async () => {
  g1 = await rpc(member, 'create_group', [brain, 'Onboarding']);
  g2 = await rpc(member, 'create_group', [brain, 'Pagos']);
  await rpc(member, 'move_idea_to_group', [a, g1]);
  await rpc(member, 'move_idea_to_group', [b, g2]);
  const bd = await rpc(owner, 'get_board', [slug]);
  eq(bd.board.groups.map((g) => g.name), ['Onboarding', 'Pagos']);
  eq([(await get(a)).group_id, (await get(b)).group_id], [g1, g2]);
});
await err('a product board has no groups', () => rpc(owner, 'create_group', [ob.board_id, 'X']), 'afinidad');
await ok('renaming a group', async () => { await rpc(owner, 'rename_group', [g1, 'Primeros pasos']); eq((await rpc(owner, 'get_board', [slug])).board.groups[0].name, 'Primeros pasos'); });
await ok('deleting a group sends its ideas back to the list', async () => { await rpc(owner, 'delete_group', [g2]); eq((await get(b)).group_id, null); });

console.log('\n# accept and merge');
await ok('Aceptar approves the idea (it goes to the Backlog)', async () => { await rpc(member, 'accept_idea', [a]); eq((await get(a)).status, 'aprobada'); });
await ok('merging keeps a group and gives the duplicate\'s author a top vote', async () => {
  c = await idea(u1, 'Idea C repetida');
  await rpc(owner, 'move_idea_to_group', [c, g1]);
  await rpc(owner, 'merge_ideas', [c, b]);
  eq((await get(b)).group_id, g1);
  eq((await db.query(`select value from public.votes where idea_id = $1 and user_id = $2`, [b, u1])).rows[0].value, '2'); // u1 had voted 2 on B already
});
await ok('emptying the board removes the groups too', async () => {
  await rpc(owner, 'empty_board', [brain, 'Lluvia de ideas']);
  eq((await db.query(`select count(*)::int n from public.idea_groups where board_id = $1`, [brain])).rows[0].n, 0);
});

await done();
