// Roles, ideas, votes, ranking, comments, plans and limits, members, roadmap, admin panel and jobs.
import { setup } from './harness.mjs';

const { db, as, rpc, ok, err, eq, done } = await setup();

// users
const mk = async (email, name, extra = '') => (await db.query(`insert into auth.users (email, raw_user_meta_data${extra ? ', email_confirmed_at' : ''}) values ($1, $2${extra ? ', null' : ''}) returning id`, [email, { name }])).rows[0].id;
const carla = await mk('carla@pampa.com', 'Carla Méndez');
const martina = await mk('martina@pampa.com', 'Martina Sosa');
const lucas = await mk('lucas@gmail.com', 'Lucas Ferreyra');
const sofia = await mk('sofia@gmail.com', 'Sofía Ramírez');
const unver = await mk('nov@gmail.com', 'Sin Verificar', 'x');
const root = await mk('admin@boxinger.com', 'Admin Boxinger');
await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);

console.log('\n# onboarding & plans');
const ob = await ok('onboard', () => rpc(carla, 'onboard', ['Pampa Pagos', 'Pampa Pagos', 'public', 'Ideas para la app']));
const slug = ob.slug;
eq(slug, 'pampa-pagos', 'slug');
const board = ob.board_id;
await err('free: second board', () => rpc(carla, 'create_board', [ob.team_id, 'Otro', 'public']), 'En Free');
await err('free: second team', () => rpc(carla, 'create_team', ['Otro equipo']), 'Pro');
await err('onboard twice', () => rpc(carla, 'onboard', ['X', 'Y', 'public', '']), 'Ya tenés');
const ctx = await ok('context', () => rpc(carla, 'get_my_context'));
eq(ctx.teams.length, 1, 'teams'); eq(ctx.teams[0].boards[0].slug, slug); eq(ctx.account.pro, false);
const cats = (await rpc(carla, 'get_board', [slug])).categories;
eq(cats.length, 3, 'default categories');

console.log('\n# ideas & votes');
await err('anon cannot create idea', () => rpc(null, 'create_idea', [board, 'Modo oscuro app', 'Uso la app de noche y encandila mucho.', cats[0].id]), 'iniciar sesión');
await err('unverified cannot participate', () => rpc(unver, 'create_idea', [board, 'Modo oscuro app', 'Uso la app de noche y encandila mucho.', cats[0].id]), 'Verificá');
await err('title too short', () => rpc(lucas, 'create_idea', [board, 'abc', 'Uso la app de noche y encandila mucho.', cats[0].id]), 'título');
const i1 = await ok('guest creates idea (auto-joins)', () => rpc(lucas, 'create_idea', [board, 'Modo oscuro en la app', 'Uso la app de noche y la pantalla encandila.', cats[0].id]));
const i2 = await ok('team creates idea', () => rpc(carla, 'create_idea', [board, 'Pagos recurrentes', 'Programar pagos que se repiten todos los meses.', cats[1].id]));
let b = await rpc(lucas, 'get_board', [slug]);
eq(b.role, 'guest', 'lucas role'); eq(b.ideas.find((x) => x.id == i1).origin, 'comunidad'); eq(b.ideas.find((x) => x.id == i2).origin, 'equipo');
eq(b.ideas[0].score, undefined, 'guest sees no score');
await err('author cannot vote own', () => rpc(lucas, 'vote', [i1, 'importante']), 'propias');
await err('author cannot vote own team idea', () => rpc(carla, 'vote', [i2, 'importante']), 'propias');
await ok('team votes community idea', () => rpc(carla, 'vote', [i1, 'importante']));
await ok('guest votes team idea', () => rpc(lucas, 'vote', [i2, 'interesante']));
await ok('sofia votes', () => rpc(sofia, 'vote', [i2, 'importante']));
await ok('sofia changes vote', () => rpc(sofia, 'vote', [i2, 'no_importante']));
b = await rpc(carla, 'get_board', [slug]);
const t2 = b.ideas.find((x) => x.id == i2);
eq([t2.votes, t2.importante, t2.interesante, t2.no_importante, t2.score], [2, 0, 1, 1, 1], 'breakdown');
eq(b.ideas.find((x) => x.id == i1).rank, 1, 'rank 1'); eq(t2.rank, 2, 'rank 2');
await ok('sofia removes vote', () => rpc(sofia, 'vote', [i2, null]));

console.log('\n# status');
await err('guest cannot change status', () => rpc(lucas, 'set_idea_status', [i1, 'aprobada', null]), 'Equipo');
await err('reject needs reason', () => rpc(carla, 'set_idea_status', [i1, 'rechazada', ' ']), 'motivo');
await ok('approve', () => rpc(carla, 'set_idea_status', [i1, 'aprobada', null]));
await err('vote closed', () => rpc(sofia, 'vote', [i1, 'importante']), 'cerrada');
const outbox = (await db.query(`select template, to_email from public.email_outbox where template not like 'admin_%' order by id`)).rows;
eq(outbox.map((x) => x.template), ['idea_status'], 'status email');
b = await rpc(carla, 'get_board', [slug]);
eq(b.ideas.find((x) => x.id == i1).rank, null, 'approved leaves ranking');

console.log('\n# comments');
const c1 = await ok('guest comments team idea', () => rpc(lucas, 'add_comment', [i2, 'Me encanta, ¿se podría elegir el día?']));
await err('team cannot reply own comment', async () => { const c = await rpc(carla, 'add_comment', [i2, 'Nota interna']); await rpc(carla, 'reply_comment', [c, 'x']); }, 'propio');
await ok('team replies', () => rpc(carla, 'reply_comment', [c1, 'Sí, la idea es elegir día y frecuencia.']));
await err('one reply per comment', () => rpc(carla, 'reply_comment', [c1, 'Otra']), 'ya tiene');
await err('guest cannot reply', () => rpc(sofia, 'reply_comment', [c1, 'yo']), 'Equipo');
await err('react own', () => rpc(lucas, 'react', [c1, null, 'like']), 'propio');
await ok('sofia likes comment', () => rpc(sofia, 'react', [c1, null, 'like']));
await ok('sofia toggles to no_like', () => rpc(sofia, 'react', [c1, null, 'no_like']));
let idea = await rpc(sofia, 'get_idea', [i2]);
const cm = idea.comment_list.find((x) => x.id == c1);
eq([cm.likes, cm.dislikes, cm.my_reaction, cm.reply.body.slice(0, 2)], [0, 1, 'no_like', 'Sí'], 'reactions');
await ok('lucas deletes comment with reply', () => rpc(lucas, 'delete_comment', [c1]));
idea = await rpc(sofia, 'get_idea', [i2]);
eq([idea.comment_list.find((x) => x.id == c1).author_name, idea.comment_list.find((x) => x.id == c1).body], ['Comentario eliminado', null], 'deleted keeps reply');
eq((await db.query(`select template from public.email_outbox where template not like 'admin_%' order by id`)).rows.map((x) => x.template), ['idea_status', 'new_comment', 'team_reply'], 'emails');

console.log('\n# config');
const nc = await ok('add category', () => rpc(carla, 'add_category', [board, 'Seguridad']));
await err('dup category', () => rpc(carla, 'add_category', [board, 'seguridad']), 'Ya existe');
await err('guest cannot add category', () => rpc(lucas, 'add_category', [board, 'Otra']), 'Admin');
await err('delete in-use category needs target', () => rpc(carla, 'delete_category', [cats[0].id, null]), 'mover');
await ok('delete category moving ideas', () => rpc(carla, 'delete_category', [cats[0].id, nc]));
eq(await rpc(carla, 'reset_categories', [board]), 1, 'reset adds Feature back');
await ok('update board', () => rpc(carla, 'update_board', [board, 'Pampa Pagos', 'Nueva descripción', null, false]));
await ok('invite guests', () => rpc(carla, 'invite_guests', [board, ['nuevo@gmail.com', 'NUEVO@gmail.com ', 'otro@gmail.com']]));
eq((await db.query(`select count(*)::int n from public.invitations where kind='guest'`)).rows[0].n, 2, 'dedup guest invites');
const comm = await rpc(carla, 'get_board_community', [board]);
eq(comm.guests.length, 2, 'guests (lucas, sofia)');
await ok('block sofia', () => rpc(carla, 'set_guest_status', [board, sofia, 'blocked']));
await err('blocked cannot vote', () => rpc(sofia, 'vote', [i2, 'importante']), 'bloqueó');

console.log('\n# pro, teams, members');
await err('free cannot invite members', () => rpc(carla, 'invite_team_members', [ob.team_id, ['martina@pampa.com'], null]), 'Pro');
await err('non-admin cannot change plan', () => rpc(carla, 'admin_update_subscription', [ctx.account.id, 'pro', null, null, null, null, false]), 'Admin de plataforma');
await ok('super admin sets pro with 20% deal', () => rpc(root, 'admin_update_subscription', [ctx.account.id, 'pro', 'pct', 20, null, 'Fundador', true]));
eq((await rpc(carla, 'get_my_context')).account.subscription.effective_amount, 7.99, 'deal price');
const b2 = await ok('pro: second board private', () => rpc(carla, 'create_board', [ob.team_id, 'Pampa Interno', 'private']));
const t2id = await ok('pro: second team', () => rpc(carla, 'create_team', ['Pampa Comercios']));
await ok('invite member', () => rpc(carla, 'invite_team_members', [ob.team_id, ['martina@pampa.com'], null]));
await err('seat limit', () => rpc(carla, 'invite_team_members', [ob.team_id, ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'], null]), 'hasta 4');
const tok = (await db.query(`select token from public.invitations where kind='team' and email='martina@pampa.com'`)).rows[0].token;
await err('wrong user cannot accept team invite', () => rpc(lucas, 'accept_invitation', [tok]), 'martina@pampa.com');
const acc = await ok('martina accepts', () => rpc(martina, 'accept_invitation', [tok]));
eq(acc.slug, slug, 'accept slug');
eq((await rpc(martina, 'get_board', [b2.slug])).role, 'member', 'member sees private');
await ok('member votes another member\'s idea', () => rpc(martina, 'vote', [i2, 'interesante']));
await ok('member comments another member\'s idea', () => rpc(martina, 'add_comment', [i2, 'Sumo: también por semana.']));
await ok('author comments own idea', () => rpc(carla, 'add_comment', [i2, 'Lo vemos en la próxima planificación.']));
await err('guest cannot see private', async () => { const r = await rpc(lucas, 'get_board', [b2.slug]); if (r.forbidden) throw new Error('forbidden'); }, 'forbidden');
await ok('remove access', () => rpc(carla, 'set_board_access', [b2.id, martina, false]));
eq((await rpc(martina, 'get_board', [b2.slug])).forbidden, true, 'access removed');
const mctx = await rpc(martina, 'get_my_context');
eq(mctx.teams[0].boards.map((x) => x.slug), [slug], 'member context boards');
await ok('member changes status', () => rpc(martina, 'set_idea_status', [i2, 'en_revision', null]));
await ok('member invites guest', () => rpc(martina, 'invite_guests', [board, ['amigo@gmail.com']]));
await err('member cannot rename board', () => rpc(martina, 'update_board', [board, 'X', null, null, false]), 'Admin');
const team = await ok('get_team', () => rpc(carla, 'get_team', [ob.team_id]));
eq(team.members.length, 1); eq(team.boards.find((x) => x.id === b2.id).access[martina], false, 'access matrix');

console.log('\n# roadmap (pro)');
await ok('rate', () => rpc(carla, 'update_idea_plan', [i1, { impact: 4, effort: 2, priority: 'alta' }]));
await ok('roadmap move', () => rpc(carla, 'move_roadmap', [i1, 'ahora', null]));
await err('only approved to roadmap', () => rpc(carla, 'move_roadmap', [i2, 'ahora', null]), 'aprobadas');
await ok('launch notifies voters', () => rpc(carla, 'update_idea_plan', [i1, { dev_status: 'lanzada' }]));
eq((await db.query(`select count(*)::int n from public.email_outbox where template='idea_launched'`)).rows[0].n, 2, 'launch emails: the voter and the author (Lucas)');
await ok('rename column', () => rpc(carla, 'rename_roadmap_column', [board, 'ahora', 'Q4']));

console.log('\n# downgrade');
await ok('back to free', () => rpc(root, 'admin_update_subscription', [ctx.account.id, 'free', null, null, null, null, false]));
eq((await rpc(carla, 'get_board', [b2.slug])).board.locked, true, 'second board locked');
await err('locked board read-only', () => rpc(carla, 'update_board', [b2.id, 'X', null, null, false]).then(() => rpc(carla, 'add_category', [b2.id, 'Z'])), 'Pro');
eq((await rpc(martina, 'get_board', [slug])).role, null, 'member paused on free');

console.log('\n# admin');
await ok('admin_clients', async () => { const r = await rpc(root, 'admin_clients'); eq(r.length, 1); eq(r[0].login, 'Email'); });
await ok('admin_boards', async () => eq((await rpc(root, 'admin_boards')).length, 2));
await ok('admin_users', async () => { const r = await rpc(root, 'admin_users'); eq(r.find((x) => x.email === 'martina@pampa.com').role, 'Miembro'); eq(r.find((x) => x.email === 'lucas@gmail.com').role, 'Invitado'); });
await ok('admin_overview', () => rpc(root, 'admin_overview', [30]));
await ok('admin_board_signups', async () => { const r = await rpc(root, 'admin_board_signups', ['2026-01-01', '2027-12-31', 'month']); if (!r.length) throw new Error('empty'); });
await ok('admin_client_detail', () => rpc(root, 'admin_client_detail', [ctx.account.id]));
await ok('admin_board_detail', () => rpc(root, 'admin_board_detail', [board]));
await err('price in past', () => rpc(root, 'admin_schedule_price', ['USD', 12, '2020-01-01', 'all', true]), 'posterior');
const pid = await ok('schedule price', () => rpc(root, 'admin_schedule_price', ['USD', 12, '2099-01-01', 'new', false]));
await ok('admin_prices', async () => { const r = await rpc(root, 'admin_prices'); eq(r.current.USD, 9.99); eq(r.rows.find((x) => x.id === pid).state, 'scheduled'); });
await ok('cancel price', () => rpc(root, 'admin_cancel_price', [pid]));
await ok('suspend board', () => rpc(root, 'admin_set_board_status', [board, 'suspended']));
await err('suspended read-only', () => rpc(lucas, 'add_comment', [i2, 'hola']), 'suspendido');
const prov = await ok('provision client (service role)', async () => {
  const u = await mk('laura@seguros.com', 'Laura Giménez');
  return rpc(null, 'admin_provision_client', [root, u, 'Giménez Seguros', '', 'pro', true], 'service_role');
});
await err('client provisioning not callable by users', () => rpc(carla, 'admin_provision_client', [root, carla, 'x', '', 'free', false]), 'permission');
const laura = (await db.query(`select id from auth.users where email='laura@seguros.com'`)).rows[0].id;
eq((await rpc(root, 'admin_clients')).find((x) => x.email === 'laura@seguros.com').login, 'Pendiente', 'pending login');
await ok('client activates', () => rpc(laura, 'accept_invitation', [prov.token]));
eq((await rpc(laura, 'get_my_context')).account.pro, true, 'laura pro');

console.log('\n# anon');
await ok('anon reads public board', async () => { const r = await rpc(null, 'get_board', [slug]); eq(r.role, null); });
await ok('anon current price', async () => eq(Number(await rpc(null, 'current_price', ['USD'])), 9.99));
await ok('anon reads no rows directly', async () => eq((await as(null, 'select * from public.ideas')).length, 0));


console.log('\n# jobs');
await ok('digest candidates', async () => { const r = await rpc(null, 'digest_candidates', [new Date(Date.now() - 864e5).toISOString()], 'service_role'); if (!Array.isArray(r)) throw new Error('not array'); });
await ok('weekly summary', () => rpc(null, 'weekly_summary', [], 'service_role'));
await ok('new-client emails to super admins', async () => { const n = (await db.query(`select count(*)::int n from public.email_outbox where template='admin_new_client'`)).rows[0].n; if (n < 2) throw new Error('got ' + n); });
await err('digest not callable by users', () => rpc(carla, 'digest_candidates', [new Date().toISOString()]), 'permission');


console.log('\n# delete team');
await err('member cannot delete team', () => rpc(martina, 'delete_team', [ob.team_id, 'Pampa Pagos']), 'Admin');
await err('guest cannot delete team', () => rpc(lucas, 'delete_team', [ob.team_id, 'Pampa Pagos']), 'Admin');
await err('wrong confirmation', () => rpc(carla, 'delete_team', [ob.team_id, 'pampa']), 'no coincide');
await ok('delete empty team', async () => eq(await rpc(carla, 'delete_team', [t2id, 'Pampa Comercios']), 0));
await ok('delete team with boards', async () => eq(await rpc(carla, 'delete_team', [ob.team_id, 'Pampa Pagos']), 2));
await ok('boards, ideas and members gone', async () => {
  const r = (await db.query(`select (select count(*) from public.boards b join public.teams t on t.id=b.team_id join public.accounts a on a.id=t.account_id where a.owner_id=$1)::int b, (select count(*) from public.ideas where board_id=$2)::int i, (select count(*) from public.team_members where team_id=$3)::int m`, [carla, board, ob.team_id])).rows[0];
  eq([r.b, r.i, r.m], [0, 0, 0]);
});
await ok('account survives, can onboard again', async () => { eq((await rpc(carla, 'get_my_context')).teams.length, 0); await rpc(carla, 'onboard', ['Nuevo equipo', 'Nuevo buzón', 'public', '']); });


console.log('\n# storage');
await ok('upload own avatar', () => as(sofia, `insert into storage.objects (bucket_id, name) values ('media', 'avatars/${sofia}/a.png')`));
await ok('read own avatar (needed by upsert)', async () => eq((await as(sofia, `select name from storage.objects where name like 'avatars/%'`)).length, 1));
await err('upload into someone else folder', () => as(sofia, `insert into storage.objects (bucket_id, name) values ('media', 'avatars/${lucas}/a.png')`), 'row-level security');
await ok('others cannot list my avatar', async () => eq((await as(lucas, `select name from storage.objects where name like 'avatars/%'`)).length, 0));


console.log('\n# visibility');
const vctx = await rpc(carla, 'get_my_context');
const vb = vctx.teams[0].boards[0];
await ok('lucas joins public board', () => rpc(lucas, 'join_board', [vb.slug]));
await ok('pending guest invite', () => rpc(carla, 'invite_guests', [vb.id, ['pendiente@gmail.com']]));
await err('free cannot make private', () => rpc(carla, 'set_board_visibility', [vb.id, 'private']), 'Pro');
await ok('carla to pro', () => rpc(root, 'admin_update_subscription', [vctx.account.id, 'pro', null, null, null, null, false]));
await err('guest cannot change visibility', () => rpc(lucas, 'set_board_visibility', [vb.id, 'private']), 'Admin');
await err('invalid value', () => rpc(carla, 'set_board_visibility', [vb.id, 'secreto']), 'inválida');
await ok('make private', async () => { const r = await rpc(carla, 'set_board_visibility', [vb.id, 'private']); eq([r.guests, r.revoked], [1, 1]); });
await ok('guest loses access', async () => eq((await rpc(lucas, 'get_board', [vb.slug])).forbidden, true));
await ok('anon loses access', async () => eq((await rpc(null, 'get_board', [vb.slug])).forbidden, true));
await ok('owner still sees it', async () => eq((await rpc(carla, 'get_board', [vb.slug])).board.visibility, 'private'));
await err('no guest invites on private', () => rpc(carla, 'invite_guests', [vb.id, ['otro2@gmail.com']]), 'privados');
await ok('back to public restores guest', async () => { await rpc(carla, 'set_board_visibility', [vb.id, 'public']); eq((await rpc(lucas, 'get_board', [vb.slug])).role, 'guest'); });
await ok('same value is a no-op', async () => eq((await rpc(carla, 'set_board_visibility', [vb.id, 'public'])).guests, 0));


console.log('\n# idea & board permissions');
const t3 = await ok('team without member boards', () => rpc(carla, 'create_team', ['Producto', false]));
const b3 = await ok('board: only owner creates ideas', () => rpc(carla, 'create_board', [t3, 'Roadmap interno', 'public', false, false]));
await ok('invite martina to Producto', () => rpc(carla, 'invite_team_members', [t3, ['martina@pampa.com'], null]));
const tk3 = (await db.query(`select token from public.invitations where kind='team' and team_id=$1`, [t3])).rows[0].token;
await ok('martina accepts', () => rpc(martina, 'accept_invitation', [tk3]));
await err('member cannot create board by default', () => rpc(martina, 'create_board', [t3, 'Ideas Martina', 'public', true, true]), 'Solo el Admin');
await err('member cannot change team settings', () => rpc(martina, 'set_team_settings', [t3, true]), 'Admin');
await ok('owner enables member boards', () => rpc(carla, 'set_team_settings', [t3, true]));
await ok('context: member can create boards', async () => eq((await rpc(martina, 'get_my_context')).teams.find((t) => t.id === t3).can_create_boards, true));
const b4 = await ok('member creates private board', () => rpc(martina, 'create_board', [t3, 'Ideas Martina', 'private', false, true]));
const cat3 = (await rpc(carla, 'get_board', [b3.slug])).categories[0].id;
const cat4 = (await rpc(martina, 'get_board', [b4.slug])).categories[0].id;
await err('member blocked from ideas on owner board', () => rpc(martina, 'create_idea', [b3.id, 'Idea de miembro', 'Una idea larga para el buzón interno.', cat3]), 'no habilitó');
await ok('lucas perms: cannot create', async () => eq((await rpc(lucas, 'get_board', [b3.slug])).perms, { can_manage: false, can_create_ideas: false }));
await ok('anon perms: cannot create', async () => eq((await rpc(null, 'get_board', [b3.slug])).perms.can_create_ideas, false));
await err('guest blocked from ideas', () => rpc(lucas, 'create_idea', [b3.id, 'Idea de invitado', 'Una idea larga de un invitado cualquiera.', cat3]), 'solo el Equipo');
await ok('owner always creates', () => rpc(carla, 'create_idea', [b3.id, 'Idea del dueño', 'El dueño siempre puede cargar ideas acá.', cat3]));
await ok('creator member creates on own board (members off)', () => rpc(martina, 'create_idea', [b4.id, 'Idea de Martina', 'Quien creó el buzón siempre puede cargar.', cat4]));
await ok('creator member manages own board', () => rpc(martina, 'update_board', [b4.id, 'Ideas de Martina', null, null, false]));
await ok('creator perms', async () => eq((await rpc(martina, 'get_board', [b4.slug])).perms, { can_manage: true, can_create_ideas: true }));
await err('creator member cannot delete board', () => rpc(martina, 'delete_board', [b4.id, 'Ideas de Martina']), 'eliminar');
await err('member cannot manage owner board', () => rpc(martina, 'set_board_idea_permissions', [b3.id, true, true]), 'Admin');
await ok('owner enables members and guests', () => rpc(carla, 'set_board_idea_permissions', [b3.id, true, true]));
await ok('member can now create', () => rpc(martina, 'create_idea', [b3.id, 'Idea de miembro', 'Una idea larga para el buzón interno.', cat3]));
await ok('guest can now create', () => rpc(lucas, 'create_idea', [b3.id, 'Idea de invitado', 'Una idea larga de un invitado cualquiera.', cat3]));
await ok('owner still deletes member board', () => rpc(carla, 'delete_board', [b4.id, 'Ideas de Martina']));


console.log('\n# growth');
const gi = (await rpc(carla, 'get_board', [b3.slug])).ideas[0].id;
await ok('set growth levers', () => rpc(carla, 'update_idea_plan', [gi, { growth: ['retencion', 'adquisicion', 'retencion'] }]));
await ok('team sees sorted, unique levers', async () => eq((await rpc(carla, 'get_board', [b3.slug])).ideas.find((i) => i.id === gi).growth, ['adquisicion', 'retencion']));
await ok('other patches keep growth', async () => { await rpc(carla, 'update_idea_plan', [gi, { impact: 3 }]); eq((await rpc(carla, 'get_idea', [gi])).growth, ['adquisicion', 'retencion']); });
await err('invalid lever', () => rpc(carla, 'update_idea_plan', [gi, { growth: ['viralidad'] }]), 'Growth');
await err('guest cannot set growth', () => rpc(lucas, 'update_idea_plan', [gi, { growth: ['churn'] }]), 'Equipo');
await ok('guest does not receive growth', async () => eq('growth' in (await rpc(lucas, 'get_board', [b3.slug])).ideas.find((i) => i.id === gi), false));
await ok('anon does not receive growth', async () => eq('growth' in (await rpc(null, 'get_idea', [gi])), false));
await ok('clear levers', async () => { await rpc(martina, 'update_idea_plan', [gi, { growth: [] }]); eq((await rpc(carla, 'get_idea', [gi])).growth, []); });


console.log('\n# enterprise');
const cacc = (await rpc(carla, 'get_my_context')).account.id;
await err('users cannot self-assign enterprise', () => rpc(carla, 'admin_update_subscription', [cacc, 'enterprise', null, null, null, null, false]), 'Admin de plataforma');
await ok('super admin assigns enterprise', () => rpc(root, 'admin_update_subscription', [cacc, 'enterprise', 'pct', 50, null, 'ignorado', true]));
await ok('context: enterprise, pro features, unlimited', async () => { const a = (await rpc(carla, 'get_my_context')).account; eq([a.plan, a.pro, a.member_limit, a.subscription.deal_type, a.subscription.provider], ['enterprise', true, null, null, 'manual']); });
await ok('team: unlimited members', async () => eq((await rpc(carla, 'get_team', [t3])).max_members, null));
await ok('invite 6 more members (over the Pro limit)', () => rpc(carla, 'invite_team_members', [t3, ['e1@x.com', 'e2@x.com', 'e3@x.com', 'e4@x.com', 'e5@x.com', 'e6@x.com'], null]));
await ok('pro features still on (private board allowed)', () => rpc(carla, 'create_board', [t3, 'Interno enterprise', 'private', true, false]));
await ok('admin sees Enterprise', async () => eq((await rpc(root, 'admin_clients')).find((c) => c.account_id === cacc).plan, 'Enterprise'));
await ok('overview: not in Pro MRR list, counted apart', async () => { const o = await rpc(root, 'admin_overview', [30]); eq([o.pro.some((c) => c.account_id === cacc), o.enterprise >= 1], [false, true]); });
await ok('enterprise email queued', async () => eq((await db.query(`select count(*)::int n from public.email_outbox where template='subscription_changed' and payload->>'plan'='enterprise'`)).rows[0].n, 1));
await ok('back to pro keeps 4-member limit', async () => { await rpc(root, 'admin_update_subscription', [cacc, 'pro', null, null, null, null, false]); eq((await rpc(carla, 'get_team', [t3])).max_members, 4); });
await err('pro limit enforced again', () => rpc(carla, 'invite_team_members', [t3, ['e7@x.com'], null]), 'hasta 4');

done();
