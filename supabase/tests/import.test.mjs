// Importing ideas from a CSV/Excel file: paid plans, team Admin only, historical dates, no notices, undo.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const member = await mk('mem@acme.com', 'Mem');
const guest = await mk('lucas@gmail.com', 'Lucas');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const slug = (await db.query(`select slug from public.boards where id = $1`, [board])).rows[0].slug;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const team = (await db.query(`select team_id from public.boards where id = $1`, [board])).rows[0].team_id;
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [team, member]);
const cats = (await db.query(`select id, name from public.categories where board_id = $1 order by position`, [board])).rows;
await rpc(guest, 'join_board', [slug]);
await rpc(owner, 'create_idea', [board, 'Modo oscuro', 'Uso la app de noche y la pantalla encandila.', cats[0].id]);
const before = async (t) => (await db.query(`select count(*)::int n from public.${t}`)).rows[0].n;
const mails0 = await before('email_outbox'), notes0 = await before('notifications');

const rows = [
  { row: 2, title: 'Exportar a Excel', description: 'Bajar los reportes', category: cats[1].name.toUpperCase(), date: '2024-03-15', name: 'Juan Pérez', email: 'juan@cliente.com', status: 'aprobada' },
  { row: 3, title: 'Login con Google', description: '', category: 'No existe', date: '2099-01-01', name: 'Lucas', email: 'LUCAS@gmail.com' },
  { row: 4, title: 'Un título larguísimo que sigue y sigue porque el cliente escribió todo en una sola línea sin parar nunca', description: 'Detalle' },
  { row: 5, title: '' },
  { row: 6, title: 'Sí' },
  { row: 7, title: 'exportar a excel' },
  { row: 8, title: 'Modo oscuro' },
  { row: 9, title: 'Fecha rota', date: '2024-02-31', status: 'rechazada' },
];
const args = (r = rows) => [board, 'historico.xlsx', 'comunidad', cats[0].id, JSON.stringify(r)];

console.log('\n# who can import');
await err('Free cannot import', () => rpc(owner, 'import_ideas', args()), 'Pro y Enterprise');
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await err('a member cannot import', () => rpc(member, 'import_ideas', args()), 'Admin del equipo');
await err('the Community cannot import', () => rpc(guest, 'import_ideas', args()), 'Admin del equipo');

console.log('\n# import');
let res;
await ok('the Admin imports', async () => { res = await rpc(owner, 'import_ideas', args()); });
await ok('created and skipped with their reason', () => {
  eq(res.created, 4);
  eq(res.skipped.map((s) => `${s.row}:${s.reason}`), ['5:sin_titulo', '6:titulo_corto', '7:repetida', '8:existe']);
});
const got = (await db.query(`select * from public.ideas where import_id = $1 order by id`, [res.import_id])).rows;
const [xl, gl, long, broken] = got;
await ok('category by name (any case), else the default one', () => { eq(xl.category_id, cats[1].id); eq(gl.category_id, cats[0].id); });
await ok('original date kept; future or broken dates are today', () => {
  eq(new Date(xl.created_at).toISOString().slice(0, 10), '2024-03-15');
  eq(new Date(gl.created_at).toDateString(), new Date().toDateString());
  eq(new Date(broken.created_at).toDateString(), new Date().toDateString());
});
await ok('status: approved stays approved, anything else is pending', () => { eq([xl.status, gl.status, broken.status], ['aprobada', 'pendiente', 'pendiente']); eq(xl.approved_at !== null, true); });
await ok('long title cut, kept whole in the description', () => { eq(long.title.length, 80); eq(long.title.endsWith('…'), true); eq(long.description.startsWith('Un título larguísimo'), true); eq(long.description.endsWith('Detalle'), true); });
await ok('a requester already in the board owns the idea; unknown ones are kept as text', () => {
  eq(gl.author_id, guest); eq(xl.author_id, null);
  eq([xl.requester_name, xl.requester_email], ['Juan Pérez', 'juan@cliente.com']);
  eq(gl.origin, 'comunidad'); eq(gl.imported, true);
});
await ok('no notices and no emails', async () => { eq(await before('email_outbox'), mails0); eq(await before('notifications'), notes0); });

console.log('\n# what each one sees');
await ok('the team sees who asked for it', async () => {
  const i = (await rpc(owner, 'get_board', [slug])).ideas.find((x) => x.id == xl.id);
  eq([i.imported, i.author_name, i.requester_email], [true, 'Juan Pérez', 'juan@cliente.com']);
});
await ok('the Community sees «Importada» and nothing about the requester', async () => {
  const i = (await rpc(guest, 'get_board', [slug])).ideas.find((x) => x.id == xl.id);
  eq([i.imported, i.author_name, i.requester_name, i.requester_email], [true, 'Importada', undefined, undefined]);
  const d = await rpc(guest, 'get_idea', [xl.id]);
  eq([d.author_name, d.requester_email], ['Importada', undefined]);
});
await ok('an imported idea can be edited with a short description', () => rpc(owner, 'update_idea', [gl.id, 'Login con Google', 'Corto', cats[0].id]));
await err('a normal idea still needs 20 characters', async () => {
  const id = (await db.query(`select id from public.ideas where board_id = $1 and not imported`, [board])).rows[0].id;
  return rpc(owner, 'update_idea', [id, 'Modo oscuro', 'Corto', cats[0].id]);
}, '20');

console.log('\n# limits and undo');
await err('up to 1.000 rows', () => rpc(owner, 'import_ideas', args(Array.from({ length: 1001 }, (_, k) => ({ row: k + 2, title: 'Idea número ' + k })))), '1.000');
await ok('nothing new: no import is recorded', async () => {
  const r = await rpc(owner, 'import_ideas', args([{ row: 2, title: 'Modo oscuro' }]));
  eq([r.created, r.import_id], [0, null]);
});
await ok('history', async () => { const h = await rpc(owner, 'get_imports', [board]); eq(h.length, 1); eq([h[0].file_name, h[0].rows, h[0].left, h[0].user_name], ['historico.xlsx', 4, 4, 'Ana']); });
await err('a member cannot see the history', () => rpc(member, 'get_imports', [board]), 'Admin del equipo');
await ok('undo deletes that import with its votes', async () => {
  await db.query(`insert into public.votes (idea_id, user_id, value) values ($1, $2, 'importante')`, [xl.id, member]);
  eq(await rpc(owner, 'undo_import', [res.import_id]), 4);
  eq((await db.query(`select count(*)::int n from public.ideas where board_id = $1`, [board])).rows[0].n, 1);
  eq((await rpc(owner, 'get_imports', [board])).length, 0);
});

await done();
