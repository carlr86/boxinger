// Board kinds: existing boards are «Producto digital» unchanged; blank and Brainstorming boards get their modules;
// fixed modules can't be turned off; Brainstorming needs a paid plan; unknown («Próximamente») types are refused.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const team = ob.team_id;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const slugOf = async (id) => (await db.query(`select slug from public.boards where id = $1`, [id])).rows[0].slug;
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const mods = async (id) => (await rpc(owner, 'get_board', [await slugOf(id)])).board;

console.log('\n# Producto digital (every board today)');
await ok('a board made the old way is Producto digital with everything on', async () => {
  const b = await mods(ob.board_id);
  eq(b.kind, 'producto');
  eq(sorted(b.modules), sorted({ ranking: true, backlog: true, rating: true, growth: true, roadmap: true, status: true, changelog: true, affinity: false, mrr: false, segments: false }));
  eq([b.use_rating, b.use_growth], [true, true]);
});
await err('its fixed modules (Roadmap) can\'t be turned off', () => rpc(owner, 'set_board_features', [ob.board_id, null, null, null, null, false]), 'incluido');
await ok('its optional ones (Impact/Effort, Growth) still can', async () => {
  await rpc(owner, 'set_board_features', [ob.board_id, false, false]);
  const b = await mods(ob.board_id);
  eq([b.modules.rating, b.modules.growth, b.use_rating, b.use_growth], [false, false, false, false]);
  await rpc(owner, 'set_board_features', [ob.board_id, true, true]);
});

console.log('\n# creating by type');
await err('a «Próximamente» type is refused', () => rpc(owner, 'create_board', [team, 'Reclamos', 'public', true, true, 'reclamos']), 'todavía no');
await err('Brainstorming on Free is refused', () => rpc(owner, 'create_board', [team, 'Lluvia', 'public', true, true, 'brainstorm']), 'Pro, Team y Enterprise');
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
let blank, brain;
await ok('a blank board starts with only the Buzón and Ranking', async () => {
  blank = (await rpc(owner, 'create_board', [team, 'En blanco', 'public', true, true, 'blank'])).id;
  const b = await mods(blank);
  eq(b.kind, 'blank');
  eq(sorted(b.modules), sorted({ ranking: true, backlog: false, rating: false, growth: false, roadmap: false, status: false, changelog: false, affinity: false, mrr: false, segments: false }));
});
await ok('and the Admin turns modules on', async () => {
  await rpc(owner, 'set_board_features', [blank, true, null, null, true, true]);
  const m = (await mods(blank)).modules;
  eq([m.rating, m.backlog, m.roadmap, m.status], [true, true, true, false]);
});
await ok('a Brainstorming board has Affinity, Matrix and Backlog fixed', async () => {
  brain = (await rpc(owner, 'create_board', [team, 'Lluvia de ideas', 'private', true, true, 'brainstorm'])).id;
  const b = await mods(brain);
  eq(b.kind, 'brainstorm');
  eq(sorted(b.modules), sorted({ ranking: true, backlog: true, rating: true, growth: false, roadmap: false, status: false, changelog: false, affinity: true, mrr: false, segments: false }));
  eq(b.module_states.affinity, 'fixed');
});
await err('its Roadmap is not available', () => rpc(owner, 'set_board_features', [brain, null, null, null, null, true]), 'no está disponible');
await err('its Matrix can\'t be turned off', () => rpc(owner, 'set_board_features', [brain, false]), 'incluido');
await ok('its Ranking is optional', async () => { await rpc(owner, 'set_board_features', [brain, null, null, false]); eq((await mods(brain)).modules.ranking, false); });

await done();
