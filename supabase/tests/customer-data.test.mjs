// MRR and customer segments: optional modules (off by default, paid plans, not on Brainstorming), a starting segment list,
// validation, deleting a segment takes it off the ideas, only the team gets them, merging and exporting.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const lucia = await mk('lucia@gmail.com', 'Lucía');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const b = (await db.query(`select slug, team_id from public.boards where id = $1`, [board])).rows[0];
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
await rpc(lucia, 'join_board', [b.slug]);
const get = (who) => rpc(who, 'get_board', [b.slug]);
const ideaOf = async (who, id) => (await get(who)).ideas.find((x) => x.id == id);
const idea = (title) => rpc(lucia, 'create_idea', [board, title, 'Una descripción con el largo que hace falta.', cat]);

console.log('\n# the modules');
await ok('they start off on every board', async () => {
  const x = (await get(owner)).board;
  eq([x.modules.mrr, x.modules.segments, x.module_states.mrr, x.module_states.segments, x.segments_on_cards, x.mrr_currency], [false, false, 'optional', 'optional', false, 'USD']);
});
await err('on Free they can\'t be turned on', () => rpc(owner, 'set_board_features', [board, null, null, null, null, null, null, null, true]), 'Pro, Team y Enterprise');
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await err('a Brainstorming board doesn\'t have them', async () => {
  const brain = (await rpc(owner, 'create_board', [b.team_id, 'Lluvia', 'private', true, true, 'brainstorm'])).id;
  return rpc(owner, 'set_board_features', [brain, null, null, null, null, null, null, null, null, true]);
}, 'no está disponible');
let segs;
await ok('turning segments on brings a starting list', async () => {
  await rpc(owner, 'set_board_features', [board, null, null, null, null, null, null, null, true, true, true]);
  const x = (await get(owner)).board;
  eq([x.modules.mrr, x.modules.segments, x.segments_on_cards], [true, true, true]);
  segs = x.segments;
  eq(segs.map((s) => s.name), ['Startup', 'Small Business', 'Mediana empresa', 'Gran empresa', 'BPO']);
});
await ok('turning it off and on again doesn\'t duplicate the list', async () => {
  await rpc(owner, 'set_board_features', [board, null, null, null, null, null, null, null, null, false]);
  await rpc(owner, 'set_board_features', [board, null, null, null, null, null, null, null, null, true]);
  eq((await get(owner)).board.segments.length, 5);
});
await ok('the currency changes', async () => { await rpc(owner, 'set_mrr_currency', [board, 'ARS']); eq((await get(owner)).board.mrr_currency, 'ARS'); });
await err('only to a known one', () => rpc(owner, 'set_mrr_currency', [board, 'XXX']), 'inválida');

console.log('\n# the segment list');
await ok('add and rename', async () => {
  const id = await rpc(owner, 'add_segment', [board, 'Gobierno']);
  await rpc(owner, 'rename_segment', [id, 'Sector público']);
  eq((await get(owner)).board.segments.at(-1), { id, name: 'Sector público' });
});
await err('no repeated names', () => rpc(owner, 'add_segment', [board, 'startup']), 'Ya existe');
await err('a guest can\'t edit it', () => rpc(lucia, 'add_segment', [board, 'Otro']));

console.log('\n# on each idea');
const a = await idea('Factura electrónica');
await ok('the team saves MRR and segments', async () => {
  await rpc(owner, 'update_idea_plan', [a, { mrr: 2500.5, segments: [segs[0].id, segs[4].id] }]);
  const x = await ideaOf(owner, a);
  eq([Number(x.mrr), x.segments.slice().sort()], [2500.5, [segs[0].id, segs[4].id].sort()]);
});
await ok('and can clear the MRR', async () => {
  await rpc(owner, 'update_idea_plan', [a, { mrr: null }]);
  eq((await ideaOf(owner, a)).mrr, null);
  await rpc(owner, 'update_idea_plan', [a, { mrr: 1200 }]);
});
await err('no negative MRR', () => rpc(owner, 'update_idea_plan', [a, { mrr: -5 }]), 'negativo');
await err('no text as MRR', () => rpc(owner, 'update_idea_plan', [a, { mrr: 'mucho' }]), 'números');
await err('only segments of this board', () => rpc(owner, 'update_idea_plan', [a, { segments: ['00000000-0000-0000-0000-000000000000'] }]), 'inválidos');
await ok('a guest never gets them', async () => {
  const x = await ideaOf(lucia, a);
  eq(['mrr' in x, 'segments' in x, (await get(lucia)).board.segments], [false, false, null]);
});
await ok('deleting a segment takes it off the ideas', async () => {
  eq(await rpc(owner, 'delete_segment', [segs[4].id]), 1);
  eq((await ideaOf(owner, a)).segments, [segs[0].id]);
});

console.log('\n# merging and exporting');
await ok('merging: the main idea keeps its MRR (or takes the duplicate\'s) and the segments add up', async () => {
  const dup = await idea('Facturar electrónicamente');
  await rpc(owner, 'update_idea_plan', [dup, { mrr: 900, segments: [segs[1].id] }]);
  await rpc(owner, 'merge_ideas', [dup, a]);
  const x = await ideaOf(owner, a);
  eq([Number(x.mrr), x.segments.slice().sort()], [1200, [segs[0].id, segs[1].id].sort()]);
  const c = await idea('Pagos con QR'), d = await idea('Cobrar con QR');
  await rpc(owner, 'update_idea_plan', [d, { mrr: 300 }]);
  await rpc(owner, 'merge_ideas', [d, c]);
  eq(Number((await ideaOf(owner, c)).mrr), 300);
});
await ok('the export has MRR, currency and segment names', async () => {
  const r = await rpc(owner, 'export_ideas', [board]);
  const x = r.ideas.find((i) => i.id == a);
  eq([r.mrr_currency, Number(x.mrr), x.segments], ['ARS', 1200, 'Startup, Small Business']);
});

await done();
