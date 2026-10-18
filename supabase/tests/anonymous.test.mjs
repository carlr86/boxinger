// Anonymous ideas: «Anónimo» for everyone except the board's Admin and the author; the author still gets the emails.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const member = await mk('mem@acme.com', 'Mem');
const lucia = await mk('lucia@gmail.com', 'Lucía');
const juan = await mk('juan@gmail.com', 'Juan');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const b = (await db.query(`select slug, team_id from public.boards where id = $1`, [board])).rows[0];
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [b.team_id, member]);
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
for (const u of [lucia, juan]) await rpc(u, 'join_board', [b.slug]);
const fromBoard = async (who, id) => (await rpc(who, 'get_board', [b.slug])).ideas.find((x) => x.id == id);

let idea;
console.log('\n# posting');
await ok('a guest posts an anonymous idea', async () => {
  idea = await rpc(lucia, 'create_idea', [board, 'Modo oscuro', 'Uso la app de noche y la pantalla encandila.', cat, true]);
  eq((await db.query(`select anonymous, author_id from public.ideas where id = $1`, [idea])).rows[0], { anonymous: true, author_id: lucia });
});
await ok('the old 4-argument call still works and is not anonymous', async () => {
  const x = await rpc(juan, 'create_idea', [board, 'Exportar a Excel', 'Bajar los reportes para compartirlos con el equipo.', cat]);
  eq((await db.query(`select anonymous from public.ideas where id = $1`, [x])).rows[0].anonymous, false);
});

console.log('\n# who sees the name');
await ok('another guest sees «Anónimo», no id or photo', async () => {
  const i = await fromBoard(juan, idea);
  eq([i.author_name, i.author_id, i.author_avatar, i.anonymous], ['Anónimo', null, null, true]);
});
await ok('a team member sees «Anónimo» too', async () => eq((await fromBoard(member, idea)).author_name, 'Anónimo'));
await ok('anonymous visitors too', async () => eq((await fromBoard(null, idea)).author_name, 'Anónimo'));
await ok('the team Admin sees who it is', async () => { const i = await fromBoard(owner, idea); eq([i.author_name, i.author_id, i.anonymous], ['Lucía', lucia, true]); });
await ok('the author sees it as theirs', async () => eq((await fromBoard(lucia, idea)).author_id, lucia));
await err('the author still cannot vote for it', () => rpc(lucia, 'vote', [idea, 'importante']), 'propias');

console.log('\n# comments');
let other;
await ok('the author\'s comments on that idea are anonymous; on other ideas they are not', async () => {
  await rpc(lucia, 'add_comment', [idea, 'Sobre todo en el celular.']);
  await rpc(juan, 'add_comment', [idea, '¡Me sumo!']);
  other = (await db.query(`select id from public.ideas where author_id = $1`, [juan])).rows[0].id;
  await rpc(lucia, 'add_comment', [other, 'Buena idea.']);
  const seen = (await rpc(juan, 'get_idea', [idea])).comment_list.map((c) => [c.author_name, c.author_id]);
  eq(seen, [['Anónimo (autor de la idea)', null], ['Juan', juan]]);
  eq((await rpc(owner, 'get_idea', [idea])).comment_list[0].author_name, 'Lucía');
  eq((await rpc(juan, 'get_idea', [other])).comment_list[0].author_name, 'Lucía');
});

console.log('\n# emails still reach the author');
await ok('a comment and the launch are told to the author', async () => {
  eq((await db.query(`select count(*)::int n from public.email_outbox where user_id = $1 and template = 'new_comment'`, [lucia])).rows[0].n >= 1, true);
  await rpc(owner, 'set_idea_status', [idea, 'aprobada', null]);
  await rpc(owner, 'update_idea_plan', [idea, { dev_status: 'lanzada' }]);
  eq((await db.query(`select count(*)::int n from public.email_outbox where user_id = $1 and template = 'idea_launched'`, [lucia])).rows[0].n, 1);
});

console.log('\n# changing it and the board switch');
await err('someone else cannot change it', () => rpc(juan, 'set_idea_anonymous', [idea, false]), 'quien propuso');
await ok('the author shows their name again', async () => { await rpc(lucia, 'set_idea_anonymous', [idea, false]); eq((await fromBoard(juan, idea)).author_name, 'Lucía'); });
await err('a member cannot turn the board switch off', () => rpc(member, 'set_board_allow_anonymous', [board, false]), '');
await ok('the Admin turns it off', async () => { await rpc(owner, 'set_board_allow_anonymous', [board, false]); eq((await rpc(juan, 'get_board', [b.slug])).board.allow_anonymous, false); });
await err('then anonymous ideas are refused', () => rpc(juan, 'create_idea', [board, 'Atajos de teclado', 'Para trabajar más rápido con el teclado.', cat, true]), 'no permite');
await err('and cannot be switched on', () => rpc(lucia, 'set_idea_anonymous', [idea, true]), 'no permite');
await ok('back on', async () => { await rpc(owner, 'set_board_allow_anonymous', [board, true]); await rpc(lucia, 'set_idea_anonymous', [idea, true]); });

console.log('\n# export, Slack and merging');
await ok('the export (Admin only) has the real name and the flag', async () => {
  const r = (await rpc(owner, 'export_ideas', [board])).ideas.find((x) => x.id == idea);
  eq([r.author_name, r.anonymous], ['Lucía', true]);
});
await ok('the team digest keeps the author\'s comment anonymous', async () => {
  const d = (await rpc(null, 'digest_candidates', [new Date(Date.now() - 864e5).toISOString()], 'service_role'))[0];
  eq(d.comments.filter((c) => c.idea_id == idea).map((c) => c.author), ['Anónimo (autor de la idea)', 'Juan']);
});
await ok('Slack says «Anónimo»', async () => eq((await rpc(null, 'slack_notice_data', [[idea]], 'service_role'))[idea].author, 'Anónimo'));
await ok('merging an anonymous idea keeps its author hidden', async () => {
  const dup = await rpc(lucia, 'create_idea', [board, 'Tema oscuro', 'Lo mismo: un tema oscuro para usar de noche.', cat, true]);
  await rpc(lucia, 'add_comment', [dup, 'Lo pedí antes.']);
  await rpc(owner, 'merge_ideas', [dup, other]);
  const g = await rpc(juan, 'get_idea', [other]);
  eq(g.merges[0].author_name, 'Anónimo');
  eq(g.comment_list.find((c) => c.body === 'Lo pedí antes.').author_name, 'Anónimo (autor de la idea)');
  eq((await rpc(owner, 'get_idea', [other])).merges[0].author_name, 'Lucía');
});

await done();
