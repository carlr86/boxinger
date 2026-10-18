// Impact / Effort and Growth are optional per board: on by default, only the board's Admin changes them, nothing is deleted.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const member = await mk('mem@acme.com', 'Mem');
const guest = await mk('lucas@gmail.com', 'Lucas');
const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const b = (await db.query(`select slug, team_id from public.boards where id = $1`, [board])).rows[0];
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [b.team_id, member]);
await rpc(guest, 'join_board', [b.slug]);
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
const idea = await rpc(owner, 'create_idea', [board, 'Modo oscuro', 'Uso la app de noche y la pantalla encandila.', cat]);
await rpc(owner, 'set_idea_status', [idea, 'aprobada', null]);
await rpc(owner, 'update_idea_plan', [idea, { impact: 4, effort: 2, growth: ['retencion'] }]);
const flags = async (who) => { const x = (await rpc(who, 'get_board', [b.slug])).board; return [x.use_rating, x.use_growth]; };

console.log('\n# board features');
await ok('both start on', async () => eq(await flags(guest), [true, true]));
await err('a member cannot change them', () => rpc(member, 'set_board_features', [board, false, null]), '');
await err('a guest cannot', () => rpc(guest, 'set_board_features', [board, false, null]), '');
await ok('the Admin turns Impact / Effort off, Growth stays', async () => { await rpc(owner, 'set_board_features', [board, false, null]); eq(await flags(owner), [false, true]); });
await ok('then Growth off too', async () => { await rpc(owner, 'set_board_features', [board, null, false]); eq(await flags(member), [false, false]); });
await ok('nothing set on the ideas is deleted', async () => {
  const i = (await rpc(owner, 'get_board', [b.slug])).ideas.find((x) => x.id == idea);
  eq([i.impact, i.effort, i.growth], [4, 2, ['retencion']]);
});
await ok('back on', async () => { await rpc(owner, 'set_board_features', [board, true, true]); eq(await flags(guest), [true, true]); });

await done();
