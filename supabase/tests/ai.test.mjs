// AI assistant (Enterprise): who can use it, the product description, monthly limits and what the model reads.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, '{"name":"X"}') returning id`, [email])).rows[0].id;
const owner = await mk('ana@acme.com');
const member = await mk('mem@acme.com');
const voter = await mk('voter@x.com');
const other = await mk('rival@x.com');
const root = await mk('admin@boxinger.com');
await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const team = (await db.query(`select team_id from public.boards where id = $1`, [board])).rows[0].team_id;
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await db.query(`insert into public.team_members (team_id, user_id, role, all_boards) values ($1, $2, 'member', true)`, [team, member]);
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
const i1 = await rpc(owner, 'create_idea', [board, 'Exportar a Excel', 'Necesito exportar los reportes a Excel para el equipo.', cat]);
const i2 = await rpc(owner, 'create_idea', [board, 'Modo oscuro', 'Un modo oscuro para usar la app de noche sin cansar la vista.', cat]);
const i3 = await rpc(owner, 'create_idea', [board, 'Integración con Slack', 'Avisos de ideas nuevas en un canal de Slack del equipo.', cat]);
await db.query(`update public.ideas set status = 'aprobada' where id = $1`, [i3]);
await rpc(voter, 'join_board', ['acme-principal']).catch(() => {});
await db.query(`insert into public.votes (idea_id, user_id, value) values ($1, $2, 'importante')`, [i2, voter]);
const begin = (uid, kind) => rpc(null, 'ai_begin', [board, uid, kind], 'service_role');
const finish = (uid, kind) => rpc(null, 'ai_finish', [board, uid, kind, 'test', 1000, 200, 0.006, JSON.stringify({ ok: true })], 'service_role');
const CONTEXT = 'Acme es un CRM para inmobiliarias chicas de Argentina. Queremos que los agentes carguen propiedades más rápido.';

console.log('\n# plan and access');
await ok('status: team sees it, off on Pro', async () => {
  const s = await rpc(member, 'ai_status', [board]);
  eq(s.enabled, false); eq(s.can_edit, false); eq(s.limits.rank, 15);
  eq((await rpc(owner, 'ai_status', [board])).can_edit, true);
});
await err('the Community cannot open it', () => rpc(voter, 'ai_status', [board]), 'Equipo');
await err('someone else cannot open it', () => rpc(other, 'ai_status', [board]), 'Equipo');
await err('Pro cannot run it', () => begin(owner, 'rank'), 'Enterprise');
await db.query(`update public.subscriptions set plan = 'enterprise' where account_id = $1`, [acc]);
await ok('Enterprise turns it on', async () => eq((await rpc(member, 'ai_status', [board])).enabled, true));

console.log('\n# product description');
await err('needs a description first', () => begin(owner, 'suggest'), 'producto');
await err('members cannot edit it', () => rpc(member, 'set_ai_context', [board, CONTEXT]), 'Admin');
await err('2.000 characters at most', () => rpc(owner, 'set_ai_context', [board, 'x'.repeat(2001)]), '2.000');
await ok('the Admin saves it', async () => {
  await rpc(owner, 'set_ai_context', [board, '  ' + CONTEXT + '  ']);
  eq((await rpc(member, 'ai_status', [board])).context, CONTEXT);
});

console.log('\n# what the model reads');
await ok('rank: only open ideas, with votes, no personal data', async () => {
  const s = await begin(member, 'rank');
  eq(s.context, CONTEXT); eq(s.account_id, acc);
  eq(s.ideas.map((i) => i.id).sort(), [i1, i2].sort());
  const dark = s.ideas.find((i) => i.id === i2);
  eq(dark.votes, 1); eq(dark.vote_breakdown, { importante: 1 }); eq(dark.category.length > 0, true);
  eq(JSON.stringify(s).includes('@'), false);
});
await ok('suggest: every idea title, and the categories to choose from', async () => {
  const s = await begin(owner, 'suggest');
  eq(s.ideas.length, 3); eq(s.categories.some((c) => c.id === cat), true);
});
await err('outsiders cannot run it through the server', () => begin(other, 'rank'), 'Equipo');
await err('server-only functions are not public', () => rpc(owner, 'ai_begin', [board, owner, 'rank']), 'permission');

console.log('\n# monthly limits');
await ok('a finished run is stored and counted', async () => {
  await finish(owner, 'rank');
  const s = await rpc(owner, 'ai_status', [board]);
  eq(s.used.rank, 1); eq(s.last_rank.result, { ok: true });
});
await ok('15 analyses a month, then it stops', async () => {
  for (let k = 1; k < 15; k++) await finish(owner, 'rank');
});
await err('limit reached', () => begin(owner, 'rank'), 'este mes');
await ok('suggestions have their own limit', () => begin(owner, 'suggest'));
await ok('last month does not count', async () => {
  await db.query(`update public.ai_runs set created_at = date_trunc('month', now()) - interval '2 days' where kind = 'rank'`);
  await begin(owner, 'rank');
});

console.log('\n# platform admin');
await ok('usage and cost per client', async () => {
  await finish(member, 'suggest');
  const u = await rpc(root, 'admin_ai_usage', [acc]);
  eq(u.length, 2); // this month (1 suggestion) and last month (15 analyses)
  eq(u[0].suggest, 1); eq(u[1].rank, 15); eq(Number(u[1].cost_usd), 0.09);
});
await err('only the platform admin', () => rpc(owner, 'admin_ai_usage', [null]), '');

await done();
