// Emptying a board: whoever manages it, every plan, typed name to confirm; the board and its people stay.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const member = await mk('mem@acme.com', 'Mem');
const guest = await mk('lucas@gmail.com', 'Lucas');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const b = (await db.query(`select slug, name, team_id from public.boards where id = $1`, [board])).rows[0];
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [b.team_id, member]);
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
await rpc(guest, 'join_board', [b.slug]);
const a = await rpc(guest, 'create_idea', [board, 'Modo oscuro', 'Uso la app de noche y la pantalla encandila.', cat]);
const c = await rpc(owner, 'create_idea', [board, 'Exportar a Excel', 'Bajar los reportes para compartirlos con el equipo.', cat]);
await rpc(guest, 'vote', [c, 'importante']);
await rpc(guest, 'add_comment', [c, '¡Sí, por favor!']);
const count = async (sql) => (await db.query(sql, [board])).rows[0].n;

console.log('\n# empty a board');
await err('the Community cannot', () => rpc(guest, 'empty_board', [board, b.name]), 'Admin del equipo');
await err('a member who did not create the board cannot', () => rpc(member, 'empty_board', [board, b.name]), 'Admin del equipo');
await err('the name must match', () => rpc(owner, 'empty_board', [board, 'otro nombre']), 'no coincide');
let n;
await ok('the Admin empties it on Free', async () => { n = await rpc(owner, 'empty_board', [board, ` ${b.name} `]); });
await ok('every idea is gone, with votes, comments and notices', async () => {
  eq(n, 2);
  eq(await count(`select count(*)::int n from public.ideas where board_id = $1`), 0);
  eq((await db.query(`select count(*)::int n from public.votes where idea_id = any($1)`, [[a, c]])).rows[0].n, 0);
  eq((await db.query(`select count(*)::int n from public.comments where idea_id = any($1)`, [[a, c]])).rows[0].n, 0);
  eq((await db.query(`select count(*)::int n from public.notifications where payload ->> 'idea_id' in ($1, $2)`, [String(a), String(c)])).rows[0].n, 0);
});
await ok('the board, its categories and its people stay', async () => {
  eq(await count(`select count(*)::int n from public.boards where id = $1`), 1);
  eq((await count(`select count(*)::int n from public.categories where board_id = $1`)) > 0, true);
  eq(await count(`select count(*)::int n from public.board_guests where board_id = $1`), 1);
  eq((await rpc(guest, 'get_board', [b.slug])).ideas.length, 0);
});
await ok('new ideas can be posted again', () => rpc(guest, 'create_idea', [board, 'Primera idea nueva', 'El buzón vacío vuelve a recibir ideas.', cat]));
await ok('recorded in the audit log', async () => eq(await count(`select count(*)::int n from public.audit_log where action = 'board_emptied' and target_id = $1::text`), 1));

await done();
