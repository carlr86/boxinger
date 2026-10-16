// Novedades: launching an idea tells the rest of the board in the bell (no email); proposer and voters keep idea_launched.
import { setup } from './harness.mjs';

const { db, rpc, ok, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const member = await mk('mem@acme.com', 'Mem');
const author = await mk('lucas@gmail.com', 'Lucas');
const voter = await mk('sofia@gmail.com', 'Sofía');
const other = await mk('juan@gmail.com', 'Juan');
const blocked = await mk('malo@gmail.com', 'Malo');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const slug = (await db.query(`select slug from public.boards where id = $1`, [board])).rows[0].slug;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const team = (await db.query(`select team_id from public.boards where id = $1`, [board])).rows[0].team_id;
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [team, member]);
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
for (const u of [author, voter, other, blocked]) await rpc(u, 'join_board', [slug]);
await db.query(`update public.board_guests set status = 'blocked' where user_id = $1`, [blocked]);

const idea = async (t) => rpc(author, 'create_idea', [board, t, 'Una descripción suficientemente larga para la idea.', cat]);
const launch = async (id) => { await rpc(owner, 'set_idea_status', [id, 'aprobada', null]); await rpc(owner, 'update_idea_plan', [id, { dev_status: 'lanzada' }]); };
const kinds = async (u, id) => (await db.query(`select kind from public.notifications where user_id = $1 and payload ->> 'idea_id' = $2::text and kind in ('board_update', 'idea_launched') order by kind`, [u, String(id)])).rows.map((x) => x.kind);

console.log('\n# Free: no board notice');
const f = await idea('Idea en plan Free');
await rpc(voter, 'vote', [f, 'importante']);
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await rpc(owner, 'set_idea_status', [f, 'aprobada', null]);
await db.query(`update public.subscriptions set plan = 'free', status = 'active', current_period_end = null where account_id = $1`, [acc]);
await ok('launching on Free tells nobody else', async () => {
  await db.query(`update public.ideas set dev_status = 'lanzada', launched_at = now() where id = $1`, [f]);
  eq(await rpc(owner, 'notify_board_update', [f]).catch(() => db.query(`select public.notify_board_update($1) n`, [f]).then((r) => r.rows[0].n)), 0);
});

console.log('\n# Pro');
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
const p = await idea('Exportar a Excel');
await rpc(voter, 'vote', [p, 'importante']);
const mails0 = (await db.query(`select count(*)::int n from public.email_outbox where template = 'board_update'`)).rows[0].n;
await ok('launch', () => launch(p));
await ok('author and voter: only idea_launched', async () => { eq(await kinds(author, p), ['idea_launched']); eq(await kinds(voter, p), ['idea_launched']); });
await ok('the rest of the board (guest and member) gets board_update', async () => { eq(await kinds(other, p), ['board_update']); eq(await kinds(member, p), ['board_update']); });
await ok('not whoever launched it, not blocked guests', async () => { eq(await kinds(owner, p), []); eq(await kinds(blocked, p), []); });
await ok('no email for board_update', async () => {
  eq((await db.query(`select count(*)::int n from public.email_outbox where template = 'board_update'`)).rows[0].n, mails0);
});
await ok('launching again does not repeat it', async () => {
  await rpc(owner, 'update_idea_plan', [p, { dev_status: 'en_curso' }]);
  await rpc(owner, 'update_idea_plan', [p, { dev_status: 'lanzada' }]);
  eq((await db.query(`select count(*)::int n from public.notifications where kind = 'board_update' and user_id = $1`, [other])).rows[0].n, 1);
});
await ok('a hidden idea tells nobody', async () => {
  const h = await idea('Idea oculta lanzada');
  await rpc(owner, 'set_idea_hidden', [h, true]);
  await launch(h);
  eq(await kinds(other, h), []);
});
await ok('the Community sees launched ideas (with their date) in the board', async () => {
  const i = (await rpc(other, 'get_board', [slug])).ideas.find((x) => x.id == p);
  eq(i.launched_at !== null && i.launched_at !== undefined, true);
});

await done();
