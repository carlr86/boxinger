// Exporting a board's ideas: team Admin only, on every plan, hidden ideas included.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const member = await mk('mem@acme.com', 'Mem');
const guest = await mk('lucas@gmail.com', 'Lucas');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const slug = (await db.query(`select slug from public.boards where id = $1`, [board])).rows[0].slug;
const team = (await db.query(`select team_id from public.boards where id = $1`, [board])).rows[0].team_id;
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [team, member]);
const cat = (await db.query(`select id, name from public.categories where board_id = $1 order by position limit 1`, [board])).rows[0];
await rpc(guest, 'join_board', [slug]);
const a = await rpc(guest, 'create_idea', [board, 'Modo oscuro', 'Uso la app de noche y la pantalla encandila.', cat.id]);
const b = await rpc(owner, 'create_idea', [board, 'Exportar a Excel', 'Bajar los reportes para compartirlos con el equipo.', cat.id]);
await rpc(guest, 'vote', [b, 'importante']);
await rpc(owner, 'vote', [a, 'interesante']);
await rpc(guest, 'add_comment', [b, '¡Sí, por favor!']);
await rpc(owner, 'set_idea_hidden', [a, true]);

console.log('\n# export');
await err('the Community cannot export', () => rpc(guest, 'export_ideas', [board]), 'Admin del equipo');
await err('a member who did not create the board cannot export', () => rpc(member, 'export_ideas', [board]), 'Admin del equipo');
let r;
await ok('the Admin exports on Free', async () => { r = await rpc(owner, 'export_ideas', [board]); });
await ok('every idea, hidden ones too, with votes, comments and author', () => {
  eq(r.ideas.length, 2);
  const [x, y] = r.ideas;
  eq([x.title, x.hidden, x.author_email, x.origin, Number(x.interesante)], ['Modo oscuro', true, 'lucas@gmail.com', 'comunidad', 1]);
  eq([y.title, Number(y.importante), Number(y.comments), y.category, y.status], ['Exportar a Excel', 1, 1, cat.name, 'pendiente']);
  eq(r.slug, slug);
});
await ok('recorded in the audit log', async () => {
  eq((await db.query(`select count(*)::int n from public.audit_log where action = 'ideas_exported' and target_id = $1`, [board])).rows[0].n, 1);
});

await done();
