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
await ok('status: the Admin sees it, off on Pro', async () => {
  const s = await rpc(owner, 'ai_status', [board]);
  eq(s.enabled, false); eq(s.can_edit, true); eq(s.limits.rank, 15); eq(s.limits.suggest, 10);
});
await err('team members cannot open it', () => rpc(member, 'ai_status', [board]), 'Admin del equipo');
await err('the Community cannot open it', () => rpc(voter, 'ai_status', [board]), 'Admin del equipo');
await err('someone else cannot open it', () => rpc(other, 'ai_status', [board]), 'Admin del equipo');
await err('Pro cannot run it', () => begin(owner, 'rank'), 'Enterprise');
await db.query(`update public.subscriptions set plan = 'enterprise' where account_id = $1`, [acc]);
await ok('Enterprise turns it on', async () => eq((await rpc(owner, 'ai_status', [board])).enabled, true));

console.log('\n# product description');
await err('needs a description first', () => begin(owner, 'suggest'), 'producto');
await err('members cannot edit it', () => rpc(member, 'set_ai_context', [board, CONTEXT]), 'Admin del equipo');
await err('2.000 characters at most', () => rpc(owner, 'set_ai_context', [board, 'x'.repeat(2001)]), '2.000');
await ok('the Admin saves it', async () => {
  await rpc(owner, 'set_ai_context', [board, '  ' + CONTEXT + '  ']);
  eq((await rpc(owner, 'ai_status', [board])).context, CONTEXT);
});

console.log('\n# what the model reads');
await err('members cannot run it through the server', () => begin(member, 'rank'), 'Admin del equipo');
await ok('rank: only open ideas, with votes, no personal data', async () => {
  const s = await begin(owner, 'rank');
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
await err('outsiders cannot run it through the server', () => begin(other, 'rank'), 'Admin del equipo');
await err('server-only functions are not public', () => rpc(owner, 'ai_begin', [board, owner, 'rank']), 'permission');

console.log('\n# ideas from a suggestion');
await ok('the Admin adds it: authored by them and marked as AI', async () => {
  const id = await rpc(owner, 'create_ai_idea', [board, 'Recibos de sueldo en el celular', 'Que cada empleado vea y descargue su recibo desde el celular.', cat, null]);
  const r = (await db.query(`select author_id, origin, ai_generated from public.ideas where id = $1`, [id])).rows[0];
  eq(r.author_id, owner); eq(r.origin, 'equipo'); eq(r.ai_generated, true);
  const slug = (await db.query(`select slug from public.boards where id = $1`, [board])).rows[0].slug;
  const b = await rpc(owner, 'get_board', [slug]);
  eq(b.ideas.find((i) => i.id === id).ai, true); eq(b.ideas.find((i) => i.id === i1).ai, false);
});
await err('members cannot add AI ideas', () => rpc(member, 'create_ai_idea', [board, 'Otra idea de prueba', 'Una descripción suficientemente larga para pasar.', cat, null]), 'Admin del equipo');
await ok('regular ideas are not marked', async () => eq((await db.query(`select ai_generated from public.ideas where id = $1`, [i1])).rows[0].ai_generated, false));

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
  await finish(owner, 'suggest');
  const u = await rpc(root, 'admin_ai_usage', [acc]);
  eq(u.length, 2); // this month (1 suggestion) and last month (15 analyses)
  eq(u[0].suggest, 1); eq(u[1].rank, 15); eq(Number(u[1].cost_usd), 0.09);
});
await err('only the platform admin', () => rpc(owner, 'admin_ai_usage', [null]), '');
await ok('Consumo IA: this month per client and board, totals and 6 months', async () => {
  const o = await rpc(root, 'admin_ai_overview', [null]);
  eq(o.months.length, 6); eq(o.totals.runs, 1); eq(o.totals.suggest, 1); eq(o.totals.clients, 1);
  const c = o.clients.find((x) => x.account_id === acc);
  eq(c.plan, 'Enterprise'); eq(c.suggest, 1); eq(c.rank, 0); eq(c.boards.length, 1); eq(c.boards[0].name, 'Principal');
});
await ok('Consumo IA: last month', async () => {
  const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1);
  const o = await rpc(root, 'admin_ai_overview', [prev.toISOString().slice(0, 7)]);
  eq(o.totals.rank, 15); eq(Number(o.totals.cost_usd), 0.09); eq(o.months.some((m) => m.runs === 15), true);
});
await ok('Consumo IA: Enterprise clients without use appear with zeros', async () => {
  const o2 = await mk('beto@otro.com');
  await rpc(o2, 'onboard', ['Otro', 'Uno', 'public', '']);
  await db.query(`update public.subscriptions set plan = 'enterprise' where account_id = (select id from public.accounts where owner_id = $1)`, [o2]);
  const c = (await rpc(root, 'admin_ai_overview', [null])).clients.find((x) => x.email === 'beto@otro.com');
  eq(c.runs, 0); eq(Number(c.cost_usd), 0); eq(c.boards, []);
});
await err('Consumo IA: only the platform admin', () => rpc(owner, 'admin_ai_overview', [null]), 'plataforma');

console.log('\n# monthly limit per client (all boards together)');
const fin = (b, kind, n) => Promise.all(Array.from({ length: n }, () => rpc(null, 'ai_finish', [b, owner, kind, 'test', 1000, 200, 0.004, '{}'], 'service_role')));
const b2 = (await rpc(owner, 'create_board', [team, 'Segundo', 'public', true, true])).id;
const b3 = (await rpc(owner, 'create_board', [team, 'Tercero', 'public', true, true])).id;
for (const b of [b2, b3]) await rpc(owner, 'set_ai_context', [b, CONTEXT]);
await ok('defaults: 30 analyses and 20 suggestions per client', async () => {
  const o = await rpc(root, 'admin_ai_overview', [null]);
  const l = o.clients.find((x) => x.account_id === acc).limits;
  eq([l.suggest, l.rank, l.custom], [20, 30, false]);
});
await ok('each board shows what is left (board and client)', async () => {
  await fin(b2, 'rank', 15); await fin(b3, 'rank', 10);
  eq((await rpc(owner, 'ai_status', [board])).left.rank, 5); // client: 30 - 25
  eq((await rpc(owner, 'ai_status', [b2])).left.rank, 0); // board: 15 - 15
});
await ok('the last client analysis can run', () => begin(owner, 'rank'));
await err('client limit reached on a board with room left', async () => { await fin(b3, 'rank', 5); return begin(owner, 'rank'); }, 'Tu equipo ya usó todos los análisis');
await ok('suggestions keep their own client limit', () => begin(owner, 'suggest'));
await ok('the platform admin raises it for this client', async () => {
  const l = await rpc(root, 'admin_set_ai_quota', [acc, 40, null]);
  eq([l.suggest, l.rank, l.custom], [20, 40, true]);
  eq((await rpc(owner, 'ai_status', [board])).left.rank, 10);
  await begin(owner, 'rank');
});
await ok('back to the default', async () => {
  await rpc(root, 'admin_set_ai_quota', [acc, null, null]);
  eq((await rpc(owner, 'ai_status', [board])).left.rank, 0);
});
await err('only the platform admin changes it', () => rpc(owner, 'admin_set_ai_quota', [acc, 100, 100]), 'plataforma');
await err('sane numbers only', () => rpc(root, 'admin_set_ai_quota', [acc, -1, 5]), '1.000');


console.log('\n# suggestion feedback');
const sugs = { suggestions: ['Uno', 'Dos', 'Tres'].map((x) => ({ title: 'Idea ' + x, description: 'Una descripción suficientemente larga.', category_id: cat, why: 'porque sí' })) };
await rpc(null, 'ai_finish', [board, owner, 'suggest', 'test', 10, 10, 0.001, JSON.stringify(sugs)], 'service_role');
const lastTitles = async () => (await rpc(owner, 'ai_status', [board])).last_suggest.result.suggestions.map((x) => x.title);
await ok('discard one: leaves the list and is remembered for the AI', async () => {
  await rpc(owner, 'ai_dismiss_suggestion', [board, 'Idea Dos', true]);
  eq(await lastTitles(), ['Idea Uno', 'Idea Tres']);
  await db.query(`update public.ai_runs set created_at = created_at - interval '40 days'`); // free the monthly limits, keep the order
  await db.query(`update public.accounts set ai_suggest_limit = null, ai_rank_limit = null where id = $1`, [acc]);
  eq((await begin(owner, 'suggest')).discarded, ['Idea Dos']);
});
await ok('adding one to the board takes it off the list (not as discarded)', async () => {
  await rpc(owner, 'create_ai_idea', [board, 'Idea Uno editada', 'Una descripción suficientemente larga para pasar.', cat, 'Idea Uno']);
  eq(await lastTitles(), ['Idea Tres']);
  eq((await begin(owner, 'suggest')).discarded, ['Idea Dos']);
});
await ok('newest discarded first, at most 30', async () => {
  for (let k = 0; k < 32; k++) await rpc(owner, 'ai_dismiss_suggestion', [board, 'Descartada ' + k, true]);
  const d = (await begin(owner, 'suggest')).discarded;
  eq(d.length, 30); eq(d[0], 'Descartada 31');
});
await ok('clear all', async () => { await rpc(owner, 'ai_clear_suggestions', [board]); eq(await lastTitles(), []); });
await err('members cannot discard', () => rpc(member, 'ai_dismiss_suggestion', [board, 'Idea Tres', true]), 'Admin del equipo');

console.log('\n# members per team');
const limitOf = async (a) => (await db.query(`select public.account_member_limit($1) l`, [a])).rows[0].l;
await ok('this Enterprise client (from before the migration in real data) is limited to 20 by default here', async () => eq(await limitOf(acc), 20));
await ok('Pro stays at 4', async () => {
  const p2 = await mk('pro@x.com'); await rpc(p2, 'onboard', ['P', 'Uno', 'public', '']);
  const a2 = (await db.query(`select id from public.accounts where owner_id = $1`, [p2])).rows[0].id;
  await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [a2]);
  eq(await limitOf(a2), 4);
});
await ok('the platform admin raises it or makes it unlimited', async () => {
  let l = await rpc(root, 'admin_set_client_limits', [acc, 35, false, null, null]);
  eq([l.members.limit, l.members.unlimited, l.members.custom], [35, false, true]); eq(await limitOf(acc), 35);
  l = await rpc(root, 'admin_set_client_limits', [acc, null, true, 40, 25]);
  eq(l.members.unlimited, true); eq(await limitOf(acc), null); eq([l.ai.rank, l.ai.suggest], [40, 25]);
  l = await rpc(root, 'admin_set_client_limits', [acc, null, false, null, null]);
  eq(l.members.custom, false); eq(await limitOf(acc), 20);
});
await err('only the platform admin', () => rpc(owner, 'admin_set_client_limits', [acc, 100, false, null, null]), 'plataforma');

await done();
