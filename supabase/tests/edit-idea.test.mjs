// Editing an idea: whoever loaded it can always correct it (also guests, with votes or once approved); the team edits any idea.
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
const [cat, cat2] = (await db.query(`select id from public.categories where board_id = $1 order by position limit 2`, [board])).rows.map((r) => r.id);
for (const u of [lucia, juan]) await rpc(u, 'join_board', [b.slug]);
const row = async (id) => (await db.query(`select title, description, category_id from public.ideas where id = $1`, [id])).rows[0];
const edit = (who, id, title) => rpc(who, 'update_idea', [id, title, 'Una descripción corregida por quien corresponde.', cat2]);

const idea = await rpc(lucia, 'create_idea', [board, 'Modo oscuro', 'Uso la app de noche y la pantalla encandila.', cat]);

console.log('\n# the author');
await ok('a guest edits their own idea', async () => {
  await edit(lucia, idea, 'Modo oscuro en el celular');
  eq(await row(idea), { title: 'Modo oscuro en el celular', description: 'Una descripción corregida por quien corresponde.', category_id: cat2 });
});
await ok('also once it has votes and is approved', async () => {
  await rpc(juan, 'vote', [idea, 'importante']);
  await rpc(owner, 'set_idea_status', [idea, 'aprobada']);
  await edit(lucia, idea, 'Modo oscuro para toda la app');
  eq((await row(idea)).title, 'Modo oscuro para toda la app');
});
await err('the same rules for the text', () => rpc(lucia, 'update_idea', [idea, 'Hola', 'Una descripción corregida por quien corresponde.', cat]), 'entre 5 y 80');

console.log('\n# everyone else');
await err('another guest can\'t edit it', () => edit(juan, idea, 'Lo cambio yo'), 'Solo el Equipo');
await ok('a member and the Admin can', async () => {
  await edit(member, idea, 'Editada por un miembro');
  await edit(owner, idea, 'Editada por el Admin');
  eq((await row(idea)).title, 'Editada por el Admin');
});
await err('a blocked author can\'t edit it anymore', async () => {
  await rpc(owner, 'set_guest_status', [board, lucia, 'blocked']);
  return edit(lucia, idea, 'Intento estando bloqueada');
}, 'bloqueó');

await done();
