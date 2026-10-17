// Integrations: a board's API key lets other tools send ideas. Paid plans, team Admin only, hidden until the team publishes.
import crypto from 'node:crypto';
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

const hash = (k) => crypto.createHash('sha256').update(k).digest('hex');
const send = (key, o = {}) => rpc(null, 'ingest_idea', [hash(key), o.source || 'api', o.title ?? 'Exportar a Excel', o.description ?? '',
  o.name ?? null, o.email ?? null, o.category ?? null, o.ref ?? null], 'service_role');
const count = async (t, where = 'true') => (await db.query(`select count(*)::int n from public.${t} where ${where}`)).rows[0].n;

console.log('\n# who can set it up');
await err('Free cannot create a key', () => rpc(owner, 'create_api_key', [board]), 'Pro y Enterprise');
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await err('a member cannot create a key', () => rpc(member, 'create_api_key', [board]), 'Admin del equipo');
await err('the Community cannot see the integrations', () => rpc(guest, 'get_integrations', [board]), 'Admin del equipo');
await err('nobody calls the door from the browser', () => rpc(owner, 'ingest_idea', [hash('x'), 'api', 'Exportar a Excel', '', null, null, null, null]), 'permission denied');

let key;
await ok('the Admin creates a key, shown once', async () => {
  key = await rpc(owner, 'create_api_key', [board]);
  eq(/^bxk_[0-9a-f]{48}$/.test(key), true, 'format');
  const g = await rpc(owner, 'get_integrations', [board]);
  eq([g.api.hint, g.api.origin, g.api.default_category, g.api.use_count, g.pending], [key.slice(-4), 'comunidad', cats[0].id, 0, 0]);
  eq(JSON.stringify(g).includes(key), false, 'the key is never returned again');
  eq(await count('board_integrations', `token_hash = '${hash(key)}'`), 1, 'only the hash is stored');
});

console.log('\n# ideas that come in');
let first;
await ok('an idea arrives hidden, with where it came from and who asked', async () => {
  const r = await send(key, { title: '  Exportar   movimientos a Excel ', description: 'Corto', name: 'Juan Pérez', email: 'JUAN@cliente.com', category: cats[1].name.toUpperCase(), ref: 'resp-1' });
  eq(r.duplicate, false);
  first = (await db.query(`select * from public.ideas where id = $1`, [r.id])).rows[0];
  eq([first.title, first.description, first.hidden, first.source, first.status, first.origin, first.category_id], ['Exportar movimientos a Excel', 'Corto', true, 'api', 'pendiente', 'comunidad', cats[1].id]);
  eq([first.requester_name, first.requester_email, first.author_id, first.imported], ['Juan Pérez', 'juan@cliente.com', null, false]);
});
await ok('the same external id twice is one idea', async () => {
  const r = await send(key, { title: 'Otro título', ref: 'resp-1' });
  eq([r.id, r.duplicate], [first.id, true]);
});
await ok('unknown category: the default one', async () => {
  const r = await send(key, { title: 'Modo oscuro', category: 'No existe' });
  eq((await db.query(`select category_id from public.ideas where id = $1`, [r.id])).rows[0].category_id, cats[0].id);
});
await ok('a requester already in the board owns the idea', async () => {
  const r = await send(key, { title: 'Pagar con QR', email: 'lucas@gmail.com' });
  eq((await db.query(`select author_id from public.ideas where id = $1`, [r.id])).rows[0].author_id, guest);
});
await ok('a long title is cut and kept whole in the description', async () => {
  const long = 'Un título larguísimo que sigue y sigue porque el formulario dejó escribir todo en una sola línea';
  const r = await send(key, { title: long, description: 'Detalle' });
  const i = (await db.query(`select title, description from public.ideas where id = $1`, [r.id])).rows[0];
  eq([i.title.length <= 80, i.title.endsWith('…'), i.description], [true, true, long + '\n\nDetalle']);
});
await err('no title', () => send(key, { title: '   ' }), 'Falta el título');
await err('a 4-letter title', () => send(key, { title: 'Hola' }), 'al menos 5');
await err('a wrong key', () => send('bxk_otra'), 'no es válida');
await ok('it counts uses and tells whoever manages the board (bell, no email)', async () => {
  const g = await rpc(owner, 'get_integrations', [board]);
  eq([g.api.use_count, g.pending], [4, 4]);
  eq(await count('notifications', `kind = 'new_idea_inbox' and user_id = '${owner}'`), 4);
  eq(await count('notifications', `kind = 'new_idea_inbox' and user_id = '${member}'`), 0);
  eq(await count('email_outbox'), 0);
});

console.log('\n# what each one sees');
await ok('the team sees it hidden, with its source and requester', async () => {
  const i = (await rpc(owner, 'get_board', [slug])).ideas.find((x) => x.id == first.id);
  eq([i.hidden, i.source, i.author_name, i.requester_email], [true, 'api', 'Juan Pérez', 'juan@cliente.com']);
});
await ok('the Community does not see it until it is published', async () => {
  eq((await rpc(guest, 'get_board', [slug])).ideas.some((x) => x.id == first.id), false);
});
await ok('published: the Community sees «Recibida por el Equipo» and nothing about the requester or source', async () => {
  await rpc(member, 'set_idea_hidden', [first.id, false]);
  const i = (await rpc(guest, 'get_board', [slug])).ideas.find((x) => x.id == first.id);
  eq([i.author_name, i.source, i.requester_name, i.requester_email], ['Recibida por el Equipo', undefined, undefined, undefined]);
});
await ok('it can be edited with a short description', () => rpc(owner, 'update_idea', [first.id, 'Exportar a Excel', 'Corto', cats[0].id]));
await err('a normal idea still needs 20 characters', async () => {
  const id = await rpc(owner, 'create_idea', [board, 'Login con Google', 'Para entrar más rápido sin contraseña.', cats[0].id]);
  return rpc(owner, 'update_idea', [id, 'Login con Google', 'Corto', cats[0].id]);
}, '20');

console.log('\n# options, new key, plan and limits');
await ok('the Admin picks Equipo and another category', async () => {
  await rpc(owner, 'set_integration_options', [board, 'equipo', cats[2].id]);
  const r = await send(key, { title: 'Reportes en PDF' });
  const i = (await db.query(`select origin, category_id from public.ideas where id = $1`, [r.id])).rows[0];
  eq([i.origin, i.category_id], ['equipo', cats[2].id]);
});
let key2;
await ok('a new key replaces the old one', async () => {
  key2 = await rpc(owner, 'create_api_key', [board]);
  eq(key2 !== key, true);
  await send(key2, { title: 'Con la clave nueva' });
});
await err('the old key stops working', () => send(key, { title: 'Con la clave vieja' }), 'no es válida');
await ok('the daily limit', async () => {
  await db.query(`insert into public.ideas (board_id, origin, title, description, category_id, hidden, source)
                  select $1, 'comunidad', 'Idea número ' || g, '', $2, true, 'api' from generate_series(1, 200) g`, [board, cats[0].id]);
});
await err('…stops the 201st of the day', () => send(key2, { title: 'Una más' }), 'Demasiadas acciones');
await db.query(`update public.ideas set created_at = now() - interval '2 days' where title like 'Idea número %'`);
await db.query(`update public.subscriptions set plan = 'free', status = 'expired' where account_id = $1`, [acc]);
await err('back on Free the door closes', () => send(key2, { title: 'En Free' }), 'Pro y Enterprise');
await err('…and options cannot be changed', () => rpc(owner, 'set_integration_options', [board, 'comunidad', cats[0].id]), 'Pro y Enterprise');
await ok('…but the Admin can still see and delete the key', async () => {
  eq((await rpc(owner, 'get_integrations', [board])).api.hint, key2.slice(-4));
  await rpc(owner, 'delete_api_key', [board]);
  eq((await rpc(owner, 'get_integrations', [board])).api, null);
});
await ok('ideas that came in stay in the board', async () => eq((await count('ideas', `source = 'api' and board_id = '${board}'`)) > 200, true));

done();
