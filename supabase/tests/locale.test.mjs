// Interface language: profile, auth metadata and the inviter language on queued invitations.
import { setup } from './harness.mjs';

const { db, as, rpc, ok, err, eq, done } = await setup();
const u = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('a@b.com', '{"name":"A"}') returning id`)).rows[0].id;
await ok('locale null by default', async () => eq((await rpc(u, 'get_my_context')).me.locale, null));
await ok('set_locale en', async () => { await rpc(u, 'set_locale', ['en']); eq((await rpc(u, 'get_my_context')).me.locale, 'en'); });
await err('invalid locale', () => rpc(u, 'set_locale', ['fr']), 'Idioma inválido');
await err('anon cannot', () => rpc(null, 'set_locale', ['en']), '');
await ok('auth metadata gets locale', async () => eq((await db.query(`select raw_user_meta_data->>'locale' l from auth.users where id = $1`, [u])).rows[0].l, 'en'));

const owner = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('ana@acme.com', '{"name":"Ana"}') returning id`)).rows[0].id;
const ob = await rpc(owner, 'onboard', ['Acme', 'Acme Ideas', 'invite', '']);
await ok('invite without locale: no sender_locale', async () => { await rpc(owner, 'invite_guests', [ob.board_id, ['x@y.com']]); const r = (await db.query(`select payload from public.email_outbox where to_email = 'x@y.com'`)).rows[0]; eq(r.payload.sender_locale, undefined); });
await ok('invite after choosing English carries sender_locale en', async () => { await rpc(owner, 'set_locale', ['en']); await rpc(owner, 'invite_guests', [ob.board_id, ['z@y.com']]); const r = (await db.query(`select payload from public.email_outbox where to_email = 'z@y.com'`)).rows[0]; eq(r.payload.sender_locale, 'en'); eq(!!r.payload.token, true); });
done();
