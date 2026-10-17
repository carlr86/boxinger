// Slack notices: one channel per board, paid plans, team Admin; ideas queue notices once each; the address never leaves the server.
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
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
await rpc(guest, 'join_board', [slug]);

const URL = 'https://hooks.slack.com/services/T000/B000/secretito';
const svc = (fn, args) => rpc(null, fn, args, 'service_role');
const queued = async (where = 'true') => (await db.query(`select kind, idea_id from public.slack_outbox where ${where} order by id`)).rows.map((r) => r.kind + (r.idea_id ? ':' + r.idea_id : ''));
const clear = () => db.query(`delete from public.slack_outbox`);
const idea = (who, title) => rpc(who, 'create_idea', [board, title, 'Una descripción bastante larga para la idea.', cat]);

console.log('\n# connecting');
await err('Free cannot connect', () => rpc(owner, 'slack_can_connect', [board]), 'Pro, Team y Enterprise');
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await err('a member cannot connect', () => rpc(member, 'slack_can_connect', [board]), 'Admin del equipo');
await err('the Community cannot', () => rpc(guest, 'slack_can_connect', [board]), 'Admin del equipo');
await ok('the Admin can, and gets the slug back', async () => eq(await rpc(owner, 'slack_can_connect', [board]), slug));
await err('nobody saves the channel from the browser', () => rpc(owner, 'save_slack', [board, owner, URL, '#ideas', 'Acme', null]), 'permission denied');
await err('only Slack addresses', () => svc('save_slack', [board, owner, 'https://evil.example.com/x', '#ideas', 'Acme', null]), 'inválida');
await ok('the server saves it', () => svc('save_slack', [board, owner, URL, '#ideas', 'Acme', 'https://acme.slack.com/services/B000']));
await ok('settings show the channel, never the address', async () => {
  const g = await rpc(owner, 'get_integrations', [board]);
  eq([g.slack.channel, g.slack.workspace, g.slack.created_by, g.slack.events.new_idea, g.slack.events.weekly], ['#ideas', 'Acme', 'Ana', true, true]);
  eq(JSON.stringify(g).includes('secretito'), false);
});
await err('the browser cannot read the table', () => rpc(owner, 'slack_notice_data', [[1]]), 'permission denied');

console.log('\n# what gets queued');
let a, b, c;
await ok('a new idea', async () => { a = await idea(guest, 'Modo oscuro'); eq(await queued(), ['new_idea:' + a]); });
await ok('an imported idea does not', async () => {
  await db.query(`insert into public.ideas (board_id, origin, title, description, category_id, imported) values ($1, 'comunidad', 'Vieja idea importada', '', $2, true)`, [board, cat]);
  eq(await queued(), ['new_idea:' + a]);
});
await ok('one from an integration waits in «Por revisar», then is announced when published', async () => {
  await clear();
  const key = await rpc(owner, 'create_api_key', [board]);
  const r = await rpc(null, 'ingest_idea', [crypto.createHash('sha256').update(key).digest('hex'), 'api', 'Exportar a Excel', '', 'Lucía', null, null, null], 'service_role');
  b = r.id;
  eq(await queued(), ['review:' + b]);
  await rpc(owner, 'set_idea_hidden', [b, false]);
  eq(await queued(), ['review:' + b, 'new_idea:' + b]);
  await rpc(owner, 'set_idea_hidden', [b, true]);
  await rpc(owner, 'set_idea_hidden', [b, false]);
  eq((await queued()).length, 2, 'hiding and showing again does not repeat it');
});
await ok('entering the Roadmap once, and the launch once', async () => {
  await clear();
  await rpc(owner, 'set_idea_status', [a, 'aprobada', null]);
  await rpc(owner, 'move_roadmap', [a, 'ahora', null]);
  await rpc(owner, 'move_roadmap', [a, 'siguiente', null]);
  await rpc(owner, 'move_roadmap', [a, null, null]);
  await rpc(owner, 'move_roadmap', [a, 'ahora', null]);
  eq(await queued(), ['planned:' + a]);
  await rpc(owner, 'update_idea_plan', [a, { dev_status: 'lanzada' }]);
  await rpc(owner, 'update_idea_plan', [a, { dev_status: 'en_curso' }]);
  await rpc(owner, 'update_idea_plan', [a, { dev_status: 'lanzada' }]);
  eq(await queued(), ['planned:' + a, 'launched:' + a]);
});
await ok('notices that are off are not queued', async () => {
  await clear();
  await rpc(owner, 'set_slack_events', [board, { new_idea: false, review: true, planned: true, launched: true, weekly: false }]);
  c = await idea(guest, 'Exportar a PDF');
  const ev = (await rpc(owner, 'get_integrations', [board])).slack.events;
  await rpc(owner, 'set_slack_events', [board, { new_idea: true, review: true, planned: true, launched: true, weekly: true }]);
  eq(await queued(), []);
  eq([ev.new_idea, ev.review, ev.weekly], [false, true, false]);
});
await err('a member cannot change them', () => rpc(member, 'set_slack_events', [board, {}]), 'Admin del equipo');

console.log('\n# sending');
await ok('the server claims and reads current data', async () => {
  await clear();
  await rpc(owner, 'vote', [c, 'importante']);
  const d = await idea(guest, 'Atajos de teclado');
  const rows = (await db.query(`select * from public.claim_slack(10)`)).rows;
  eq(rows.map((r) => r.status), ['sending']);
  const data = await svc('slack_notice_data', [[d, c]]);
  eq([data[d].title, data[d].author, data[d].origin, data[c].votes, data[c].importante], ['Atajos de teclado', 'Lucas', 'comunidad', 1, 1]);
  eq((await db.query(`select * from public.claim_slack(10)`)).rows.length, 0, 'not claimed twice');
});
await err('the browser cannot claim', () => rpc(owner, 'claim_slack', [10]), 'permission denied');

console.log('\n# weekly summary');
await ok('one per board and week, with the most voted', async () => {
  await clear();
  eq(await svc('queue_slack_weekly', []), 1);
  eq(await svc('queue_slack_weekly', []), 1);
  const rows = (await db.query(`select payload from public.slack_outbox where kind = 'weekly'`)).rows;
  eq(rows.length, 1);
  eq([rows[0].payload.top[0].id == c, rows[0].payload.votes >= 1, rows[0].payload.ideas >= 3], [true, true, true]);
});

console.log('\n# plan and disconnecting');
await ok('back on Free: nothing is queued', async () => {
  await clear();
  await db.query(`update public.subscriptions set plan = 'free', status = 'active', current_period_end = null where account_id = $1`, [acc]);
  await idea(owner, 'Idea en Free');
  eq(await queued(), []);
});
await ok('the Admin disconnects on any plan; pending notices are dropped', async () => {
  await db.query(`insert into public.slack_outbox (board_id, kind) values ($1, 'weekly')`, [board]);
  await rpc(owner, 'delete_slack', [board]);
  eq((await rpc(owner, 'get_integrations', [board])).slack, null);
  eq((await db.query(`select status from public.slack_outbox`)).rows.map((r) => r.status), ['skipped']);
});

await done();
