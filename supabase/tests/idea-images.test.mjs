// One image per idea: private bucket readable only by whoever sees the board; paid plans; cleanup of unused files.
import { setup } from './harness.mjs';

const { db, rpc, ok, err, eq, done } = await setup();
const mk = async (email, name = 'X') => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name', $2::text)) returning id`, [email, name])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana');
const author = await mk('lucas@gmail.com', 'Lucas');
const other = await mk('juan@gmail.com', 'Juan');
const stranger = await mk('extra@otro.com', 'Extra');

const ob = await rpc(owner, 'onboard', ['Acme', 'Principal', 'public', '']);
const board = ob.board_id;
const slug = (await db.query(`select slug from public.boards where id = $1`, [board])).rows[0].slug;
const acc = (await db.query(`select id from public.accounts where owner_id = $1`, [owner])).rows[0].id;
const team = (await db.query(`select team_id from public.boards where id = $1`, [board])).rows[0].team_id;
const cat = (await db.query(`select id from public.categories where board_id = $1 limit 1`, [board])).rows[0].id;
for (const u of [author, other]) await rpc(u, 'join_board', [slug]);
const idea = await rpc(author, 'create_idea', [board, 'Exportar a Excel', 'Necesito bajar los reportes para el equipo.', cat]);

// Runs SQL as a user (or anon) with RLS, like the Storage API does.
const as = (uid, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
  await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
  return (await tx.query(sql, params)).rows;
});
const upload = (uid, name) => as(uid, `insert into storage.objects (bucket_id, name, owner_id, metadata) values ('idea-images', $1, $2, '{"size": 200000}') returning name`, [name, uid]);
const canRead = async (uid, name) => (await as(uid, `select name from storage.objects where bucket_id = 'idea-images' and name = $1`, [name])).length === 1;
const path = (b, k) => `${b}/${k}.webp`;

console.log('\n# plan and upload rules');
await err('Free: no upload', () => upload(author, path(board, 'a1')), 'row-level security');
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);
await ok('Pro: a guest who can post ideas uploads', () => upload(author, path(board, 'a1')));
await ok('public board: anyone signed in can post ideas, so they can upload too', () => upload(stranger, path(board, 'x1')));
await err('invite-only board: someone outside it cannot upload', async () => {
  await db.query(`update public.boards set visibility = 'invite' where id = $1`, [board]);
  try { return await upload(stranger, path(board, 'x3')); } finally { await db.query(`update public.boards set visibility = 'public' where id = $1`, [board]); }
}, 'row-level security');
await err('anonymous cannot upload', () => upload(null, path(board, 'x2')), 'row-level security');

console.log('\n# set_idea_image');
await ok('the author sets it', () => rpc(author, 'set_idea_image', [idea, path(board, 'a1')]));
await ok('it comes with the idea', async () => eq((await rpc(other, 'get_board', [slug])).ideas.find((x) => x.id == idea).image_path, path(board, 'a1')));
await err('another guest cannot change it', () => rpc(other, 'set_idea_image', [idea, null]), 'Equipo');
await err('a path from another board is rejected', () => rpc(author, 'set_idea_image', [idea, '00000000-0000-0000-0000-000000000000/zz.webp']), 'inválida');
await err('a file that was not uploaded is rejected', () => rpc(author, 'set_idea_image', [idea, path(board, 'nope')]), 'no se subió');
await ok('the team can remove it (moderation)', async () => { await rpc(owner, 'set_idea_image', [idea, null]); await rpc(owner, 'set_idea_image', [idea, path(board, 'a1')]); });

console.log('\n# who can read');
await ok('public board: anyone, even anonymous', async () => { eq(await canRead(null, path(board, 'a1')), true); eq(await canRead(stranger, path(board, 'a1')), true); });
await ok('invite-only board: guests yes, strangers and anonymous no', async () => {
  await db.query(`update public.boards set visibility = 'invite' where id = $1`, [board]);
  eq(await canRead(other, path(board, 'a1')), true);
  eq(await canRead(stranger, path(board, 'a1')), false);
  eq(await canRead(null, path(board, 'a1')), false);
  await db.query(`update public.boards set visibility = 'public' where id = $1`, [board]);
});

console.log('\n# Free after Pro');
await ok('existing images stay; new ones need a paid plan', async () => {
  await db.query(`update public.subscriptions set plan = 'free', status = 'active', current_period_end = null where account_id = $1`, [acc]);
  eq((await rpc(other, 'get_board', [slug])).ideas.find((x) => x.id == idea).image_path, path(board, 'a1'));
  await db.query(`insert into storage.objects (bucket_id, name) values ('idea-images', $1)`, [path(board, 'b1')]);
  return err('set needs Pro', () => rpc(owner, 'set_idea_image', [idea, path(board, 'b1')]), 'Pro, Team y Enterprise');
});
await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '20 days' where account_id = $1`, [acc]);

console.log('\n# merge and cleanup');
await ok('merging: a main idea with no image takes the duplicate\'s', async () => {
  const main = await rpc(other, 'create_idea', [board, 'Exportar reportes a planilla', 'Lo mismo: bajar los reportes en una planilla.', cat]);
  await rpc(owner, 'merge_ideas', [idea, main]);
  eq((await db.query(`select image_path from public.ideas where id = $1`, [main])).rows[0].image_path, path(board, 'a1'));
});
await ok('cleanup lists only unused files older than a day (the thumbnail of a used image counts as used)', async () => {
  await db.query(`insert into storage.objects (bucket_id, name, created_at) values ('idea-images', $1, now() - interval '2 days'), ('idea-images', $2, now() - interval '2 days'), ('idea-images', $3, now())`,
    [path(board, 'a1-t'), path(board, 'old'), path(board, 'fresh')]);
  await db.query(`update storage.objects set created_at = now() - interval '2 days' where name in ($1, $2, $3)`, [path(board, 'a1'), path(board, 'b1'), path(board, 'x1')]);
  const rows = (await db.query(`select public.cleanup_idea_images() n`)).rows.map((x) => x.n).sort();
  eq(rows, [path(board, 'b1'), path(board, 'old'), path(board, 'x1')].sort());
});
await ok('storage usage for the platform admin', async () => {
  const root = await mk('root@boxinger.com', 'Root');
  await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);
  const u = await rpc(root, 'admin_storage_usage');
  eq(Number(u.total_bytes) >= 200000, true);
});
await err('not for anyone else', () => rpc(owner, 'admin_storage_usage'), '');

await done();
