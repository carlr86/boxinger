// Merging duplicate ideas: paid plans, team Admin only; votes, comments and old links move to the main idea.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const member = await mk('mem@acme.com', 'Mem');
const lucas = await mk('lucas@gmail.com', 'Lucas');
const sofia = await mk('sofia@gmail.com', 'Sofía');
const juan = await mk('juan@gmail.com', 'Juan');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const slug = (await db.query(`select slug from public.boards where id = $1`, [board])).rows[0].slug;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const team = (await db.query(`select team_id from public.boards where id = $1`, [board])).rows[0].team_id;
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [team, member]);
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
for (const u of [lucas, sofia, juan]) await rpc(u, 'join_board', [slug]);

// main: by Sofía. duplicate: by Lucas.
const main = await rpc(sofia, 'create_idea', [board, 'Exportar a Excel', 'Necesito bajar los reportes en Excel para el equipo.', cat]);
const dup = await rpc(lucas, 'create_idea', [board, 'Bajar reportes en Excel', 'Poder descargar los reportes como planilla, con filtros.', cat]);
await rpc(juan, 'vote', [main, 'interesante']);   // Juan votes both: keeps the main one's vote
await rpc(juan, 'vote', [dup, 'importante']);
await rpc(sofia, 'vote', [dup, 'importante']);    // the main idea's author voted the duplicate: dropped
await rpc(owner, 'vote', [dup, 'interesante']);   // moves
const cm = await rpc(juan, 'add_comment', [dup, 'Lo usaría todos los días']);
await rpc(owner, 'reply_comment', [cm, '¡Gracias, Juan!']);
await rpc(sofia, 'react', [cm, 'like']).catch(() => db.query(`insert into public.reactions (comment_id, user_id, value) values ($1, $2, 'like')`, [cm, sofia]));
const mails0 = (await db.query(`select count(*)::int n from public.email_outbox`)).rows[0].n;

console.log('\n# who can merge');
await err('Free cannot merge', () => rpc(owner, 'merge_ideas', [dup, main]), 'Pro, Team y Enterprise');
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await err('a member cannot merge', () => rpc(member, 'merge_ideas', [dup, main]), 'Admin del equipo');
await err('the Community cannot merge', () => rpc(lucas, 'merge_ideas', [dup, main]), 'Admin del equipo');
await err('not with itself', () => rpc(owner, 'merge_ideas', [dup, dup]), 'otra idea');
await err('not across boards', async () => {
  const b2 = (await rpc(owner, 'create_board', [team, 'Otro', 'public', true, true])).id;
  const c2 = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [b2])).rows[0].id;
  const x = await rpc(owner, 'create_idea', [b2, 'Idea en otro buzón', 'Esta idea está en otro buzón distinto.', c2]);
  return rpc(owner, 'merge_ideas', [dup, x]);
}, 'mismo buzón');

console.log('\n# merge');
let r;
await ok('the Admin merges', async () => { r = await rpc(owner, 'merge_ideas', [dup, main]); });
const votes = async (id) => Object.fromEntries((await db.query(`select user_id, value from public.votes where idea_id = $1`, [id])).rows.map((x) => [x.user_id, x.value]));
await ok('votes: both-voter keeps the main vote, main author not added, Admin moves, duplicate author counts as importante', async () => {
  const v = await votes(main);
  eq(v[juan], 'interesante'); eq(v[sofia], undefined); eq(v[owner], 'interesante'); eq(v[lucas], 'importante');
  eq(Object.keys(v).length, 3);
  eq([r.votes_moved, r.author_vote], [2, true]);
});
await ok('comments move with their reply and reactions, marked as merged', async () => {
  const c = (await db.query(`select idea_id, merged_from from public.comments where id = $1`, [cm])).rows[0];
  eq(Number(c.idea_id), Number(main)); eq(c.merged_from !== null, true);
  eq((await db.query(`select count(*)::int n from public.comment_replies where comment_id = $1`, [cm])).rows[0].n, 1);
  eq((await db.query(`select count(*)::int n from public.reactions where comment_id = $1`, [cm])).rows[0].n, 1);
  eq(r.comments_moved, 1);
});
await ok('the duplicate is gone and its old link leads to the main idea', async () => {
  eq((await db.query(`select count(*)::int n from public.ideas where id = $1`, [dup])).rows[0].n, 0);
  eq(Number((await rpc(juan, 'get_idea', [dup])).merged_into), Number(main));
});
await ok('the main idea lists what was merged and marks the comment', async () => {
  const d = await rpc(juan, 'get_idea', [main]);
  eq(d.merges.length, 1); eq([d.merges[0].title, d.merges[0].author_name], ['Bajar reportes en Excel', 'Lucas']);
  eq(d.comment_list[0].merged_from_title, 'Bajar reportes en Excel');
  eq(d.votes, 3);
});
await ok('bell notice for the duplicate author and voters (not the Admin who merged), no email', async () => {
  const n = (await db.query(`select user_id, payload from public.notifications where kind = 'idea_merged' order by user_id`)).rows;
  const by = Object.fromEntries(n.map((x) => [x.user_id, x.payload]));
  eq(by[lucas].mine, true); eq(by[juan].mine, false); eq(by[sofia].mine, false); eq(by[owner], undefined);
  eq(Number(by[lucas].idea_id), Number(main)); eq(by[lucas].from_title, 'Bajar reportes en Excel');
  eq((await db.query(`select count(*)::int n from public.email_outbox`)).rows[0].n, mails0);
  eq(r.notified, 3);
});
await ok('chain: A into B, then B into C, everything ends in C', async () => {
  const c3 = await rpc(juan, 'create_idea', [board, 'Exportar datos a planillas', 'Exportar cualquier listado a una planilla de cálculo.', cat]);
  await rpc(owner, 'merge_ideas', [main, c3]);
  eq(Number((await rpc(juan, 'get_idea', [dup])).merged_into), Number(c3));
  eq(Number((await rpc(juan, 'get_idea', [main])).merged_into), Number(c3));
  const d = await rpc(juan, 'get_idea', [c3]);
  eq(d.merges.map((x) => x.title), ['Bajar reportes en Excel', 'Exportar a Excel']);
  eq((await votes(c3))[sofia], 'importante'); // Sofía proposed B, now merged into Juan's C
});
await ok('recorded in the audit log', async () => {
  eq((await db.query(`select count(*)::int n from public.audit_log where action = 'ideas_merged'`)).rows[0].n, 2);
});

await done();
