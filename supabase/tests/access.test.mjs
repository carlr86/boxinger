// Invite-only boards, domains, access requests, notifications, leaving and removing guests.
import { setup } from './harness.mjs';

const { db, as, rpc, ok, err, eq, done } = await setup();

// users
const mk = async (email, name, unverified) => (await db.query(`insert into auth.users (email, raw_user_meta_data${unverified ? ', email_confirmed_at' : ''}) values ($1, $2${unverified ? ', null' : ''}) returning id`, [email, { name }])).rows[0].id;
const owner = await mk('ana@acme.com', 'Ana Dueña');
const invited = await mk('ivan@gmail.com', 'Iván Invitado');
const stranger = await mk('rival@competencia.com', 'Rival');
const colleague = await mk('carlos@acme.com', 'Carlos Acme');
const fake = await mk('falso@acme.com', 'Sin verificar', true);
const root = await mk('admin@boxinger.com', 'Root');
await db.query(`update public.profiles set is_super_admin = true where id = $1`, [root]);

console.log('\n# invite-only boards');
const ob = await ok('onboard invite board (Free)', () => rpc(owner, 'onboard', ['Acme', 'Acme Ideas', 'invite', 'Privado para clientes']));
const slug = ob.slug, board = ob.board_id;
const ctx = await rpc(owner, 'get_my_context');
const cats = (await rpc(owner, 'get_board', [slug])).categories;
await ok('anon: forbidden, no name leaked', async () => { const d = await rpc(null, 'get_board', [slug]); eq(d.forbidden, true); eq(d.name, undefined); eq(d.visibility, 'invite'); eq(d.signed_in, false); });
await ok('stranger signed in: forbidden', async () => { const d = await rpc(stranger, 'get_board', [slug]); eq(d.forbidden, true); eq(d.signed_in, true); });
await err('stranger cannot join by link', () => rpc(stranger, 'join_board', [slug]), 'solo para invitados');
await err('stranger cannot vote', () => rpc(stranger, 'create_idea', [board, 'Copiar ideas', 'Quiero ver todas las ideas del rival.', cats[0].id]), 'acceso');
await ok('owner sees it', async () => { const d = await rpc(owner, 'get_board', [slug]); eq(d.role, 'admin'); eq(d.board.allowed_domains, []); });
await ok('invite guest by email (Free)', () => rpc(owner, 'invite_guests', [board, ['ivan@gmail.com']]));
await ok('invited sees it before accepting', async () => { const d = await rpc(invited, 'get_board', [slug]); eq(d.role, 'guest'); eq(d.joined, false); eq(d.perms.can_create_ideas, true); eq(d.board.allowed_domains, null); });
await ok('invited joins by visiting (join_board)', async () => { eq(await rpc(invited, 'join_board', [slug]), 'guest'); eq((await rpc(invited, 'get_board', [slug])).joined, true); });
await ok('invitation marked accepted', async () => { const r = (await db.query(`select accepted_by from public.invitations where board_id = $1 and email = 'ivan@gmail.com'`, [board])).rows[0]; eq(r.accepted_by, invited); });
await ok('invited listed in Mis Buzones', async () => { const c = await rpc(invited, 'get_my_context'); eq(c.guest_boards.map((b) => b.slug), [slug]); });
const idea = await ok('invited creates idea', () => rpc(invited, 'create_idea', [board, 'Exportar a CSV', 'Necesito exportar los reportes a CSV.', cats[0].id]));
await err('stranger cannot read idea', async () => { const r = await rpc(stranger, 'get_idea', [idea]); if (r === null || r?.forbidden) throw new Error('sin acceso'); return r; }, 'acceso');
await ok('blocked invited loses access', async () => { await rpc(owner, 'set_guest_status', [board, invited, 'blocked']); const d = await rpc(invited, 'get_board', [slug]); eq(d.forbidden, true); await rpc(owner, 'set_guest_status', [board, invited, 'active']); });
await ok('revoked pending invite gives no access', async () => {
  await rpc(owner, 'invite_guests', [board, ['rival@competencia.com']]);
  eq((await rpc(stranger, 'get_board', [slug])).role, 'guest');
  const inv = (await db.query(`select id from public.invitations where board_id = $1 and email = 'rival@competencia.com'`, [board])).rows[0].id;
  await rpc(owner, 'revoke_invitation', [inv]);
  eq((await rpc(stranger, 'get_board', [slug])).forbidden, true);
});
await err('domains need Pro', () => rpc(owner, 'set_board_domains', [board, ['acme.com']]), 'Pro');
await ok('owner goes Pro', () => rpc(root, 'admin_update_subscription', [ctx.account.id, 'pro', null, null, null, null, false]));
await err('webmail domain refused', () => rpc(owner, 'set_board_domains', [board, ['gmail.com']]), 'personal');
await err('invalid domain refused', () => rpc(owner, 'set_board_domains', [board, ['no es dominio']]), 'inválido');
await ok('set domains (normalized)', async () => eq(await rpc(owner, 'set_board_domains', [board, ['@ACME.com ', 'acme.com', 'filial.acme.com']]), ['acme.com', 'filial.acme.com']));
await ok('colleague by domain sees and joins', async () => { eq((await rpc(colleague, 'get_board', [slug])).role, 'guest'); await rpc(colleague, 'vote', [idea, 'importante']); const via = (await db.query(`select via from public.board_guests where board_id = $1 and user_id = $2`, [board, colleague])).rows[0].via; eq(via, 'domain'); });
await ok('unverified domain email: no access', async () => eq((await rpc(fake, 'get_board', [slug])).forbidden, true));
await ok('domains stop working on Free', async () => {
  const other = await mk('nuevo@acme.com', 'Nuevo Acme');
  await rpc(root, 'admin_update_subscription', [ctx.account.id, 'free', null, null, null, null, false]);
  eq((await rpc(other, 'get_board', [slug])).forbidden, true);
  eq((await rpc(colleague, 'get_board', [slug])).role, 'guest'); // already joined
  await rpc(root, 'admin_update_subscription', [ctx.account.id, 'pro', null, null, null, null, false]);
});
await ok('switch to public: anyone sees', async () => { await rpc(owner, 'set_board_visibility', [board, 'public']); eq((await rpc(null, 'get_board', [slug])).forbidden, undefined); });
await ok('switch back to invite', async () => { await rpc(owner, 'set_board_visibility', [board, 'invite']); eq((await rpc(null, 'get_board', [slug])).forbidden, true); eq((await rpc(invited, 'get_board', [slug])).role, 'guest'); });
await ok('private: guests out', async () => { await rpc(owner, 'set_board_visibility', [board, 'private']); eq((await rpc(invited, 'get_board', [slug])).forbidden, true); await rpc(owner, 'set_board_visibility', [board, 'invite']); });
await ok('create_board accepts invite', () => rpc(owner, 'create_board', [ob.team_id, 'Otro', 'invite', true, true]));
await ok('default visibility is invite', async () => eq((await db.query(`select column_default from information_schema.columns where table_name = 'boards' and column_name = 'visibility'`)).rows[0].column_default, "'invite'::text"));

console.log('\n# guests see the roadmap (read only)');
await ok('approve + roadmap + priority', async () => { await rpc(owner, 'set_idea_status', [idea, 'aprobada']); await rpc(owner, 'move_roadmap', [idea, 'ahora']); await rpc(owner, 'update_idea_plan', [idea, { priority: 'alta' }]); });
const gi = async (who) => (await rpc(who, 'get_board', [slug])).ideas.find((x) => x.id == idea);
await ok('off by default: guest gets no roadmap data', async () => { const d = await rpc(invited, 'get_board', [slug]); eq(d.board.guests_can_view_roadmap, false); eq((await gi(invited)).rm_col, undefined); });
await err('guest cannot turn it on', () => rpc(invited, 'set_board_roadmap_public', [board, true]), 'Admin');
await ok('owner turns it on', () => rpc(owner, 'set_board_roadmap_public', [board, true]));
await ok('guest sees column, not internals', async () => { const i = await gi(invited); eq(i.rm_col, 'ahora'); eq(i.dev_status, 'por_empezar'); eq(i.priority, undefined); eq(i.impact, undefined); eq(i.chk_prd, undefined); eq((await rpc(invited, 'get_board', [slug])).board.guests_can_view_roadmap, true); });
await ok('team still sees everything', async () => eq((await gi(owner)).priority, 'alta'));
await ok('stranger still sees nothing', async () => eq((await rpc(stranger, 'get_board', [slug])).forbidden, true));
await ok('guest cannot move roadmap', async () => { try { await rpc(invited, 'move_roadmap', [idea, 'siguiente']); throw new Error('moved'); } catch (e) { if (e.message === 'moved') throw e; } });
await ok('back on Free: hidden again', async () => {
  await rpc(root, 'admin_update_subscription', [ctx.account.id, 'free', null, null, null, null, false]);
  eq((await gi(invited)).rm_col, undefined);
  await rpc(root, 'admin_update_subscription', [ctx.account.id, 'pro', null, null, null, null, false]);
});
await err('Free cannot enable', async () => { await rpc(root, 'admin_update_subscription', [ctx.account.id, 'free', null, null, null, null, false]); try { await rpc(owner, 'set_board_roadmap_public', [board, true]); } finally { await rpc(root, 'admin_update_subscription', [ctx.account.id, 'pro', null, null, null, null, false]); } }, 'Pro');

console.log('\n# launched ideas');
await ok('launch idea', () => rpc(owner, 'update_idea_plan', [idea, { dev_status: 'lanzada' }]));
await ok('guest sees launched_at even without roadmap sharing', async () => { await rpc(owner, 'set_board_roadmap_public', [board, false]); const i = await gi(invited); if (!i.launched_at) throw new Error('no launched_at'); eq(i.dev_status, undefined); eq(i.priority, undefined); });
await ok('undo launch clears it', async () => { await rpc(owner, 'update_idea_plan', [idea, { dev_status: 'en_curso' }]); eq((await gi(invited)).launched_at, null); });

console.log('\n# access requests');
const asker = await mk('pide@otra.com', 'Pide Acceso');
const asker2 = await mk('pide2@otra.com', 'Pide Dos');
await ok('stranger sees can_request, no name', async () => { const d = await rpc(asker, 'get_board', [slug]); eq(d.forbidden, true); eq(d.can_request, true); eq(d.request, null); eq(d.name, undefined); });
await ok('anon also sees can_request', async () => eq((await rpc(null, 'get_board', [slug])).can_request, true));
await err('anon cannot request', () => rpc(null, 'request_board_access', [slug, 'hola']), 'sesión');
await ok('stranger requests access', async () => eq(await rpc(asker, 'request_board_access', [slug, 'Soy cliente de Acme']), 'pending'));
await ok('second request stays pending', async () => eq(await rpc(asker, 'request_board_access', [slug, 'otra vez']), 'pending'));
await ok('forbidden shows pending', async () => eq((await rpc(asker, 'get_board', [slug])).request, 'pending'));
await ok('admin email queued', async () => { const r = (await db.query(`select to_email, payload from public.email_outbox where template = 'access_request'`)).rows; eq(r.length, 1); eq(r[0].to_email, 'ana@acme.com'); eq(r[0].payload.message, 'Soy cliente de Acme'); });
await ok('owner sees request count and list', async () => { eq((await rpc(owner, 'get_board', [slug])).board.pending_requests, 1); const c = await rpc(owner, 'get_board_community', [board]); eq(c.requests.length, 1); eq(c.requests[0].email, 'pide@otra.com'); });
await ok('guest sees no requests', async () => { eq((await rpc(invited, 'get_board', [slug])).board.pending_requests, null); });
const reqId = (await db.query(`select id from public.board_access_requests where user_id = $1`, [asker])).rows[0].id;
await err('guest cannot decide', () => rpc(invited, 'decide_access_request', [reqId, true]), 'Admin');
await ok('owner approves', () => rpc(owner, 'decide_access_request', [reqId, true]));
await ok('approved sees board as guest', async () => { const d = await rpc(asker, 'get_board', [slug]); eq(d.role, 'guest'); eq(d.joined, true); const via = (await db.query(`select via from public.board_guests where board_id = $1 and user_id = $2`, [board, asker])).rows[0].via; eq(via, 'request'); });
await ok('granted email queued', async () => eq((await db.query(`select count(*)::int as n from public.email_outbox where template = 'access_granted'`)).rows[0].n, 1));
await err('cannot decide twice', () => rpc(owner, 'decide_access_request', [reqId, false]), 'respondida');
await ok('second stranger rejected', async () => { await rpc(asker2, 'request_board_access', [slug, null]); const id = (await db.query(`select id from public.board_access_requests where user_id = $1`, [asker2])).rows[0].id; await rpc(owner, 'decide_access_request', [id, false]); eq((await rpc(asker2, 'get_board', [slug])).request, 'rejected'); });
await err('rejected cannot ask again for 7 days', () => rpc(asker2, 'request_board_access', [slug, null]), 'más adelante');
await ok('blocked guest: no can_request', async () => { await rpc(owner, 'set_guest_status', [board, asker, 'blocked']); eq((await rpc(asker, 'get_board', [slug])).can_request, false); });
await err('blocked cannot request', () => rpc(asker, 'request_board_access', [slug, null]), 'No podés');
await ok('Free: no requests', async () => {
  await rpc(root, 'admin_update_subscription', [ctx.account.id, 'free', null, null, null, null, false]);
  const other = await mk('tres@otra.com', 'Tres');
  eq((await rpc(other, 'get_board', [slug])).can_request, false);
  try { await rpc(other, 'request_board_access', [slug, null]); throw new Error('allowed'); } catch (e) { if (!/no recibe/.test(e.message)) throw e; }
  await rpc(root, 'admin_update_subscription', [ctx.account.id, 'pro', null, null, null, null, false]);
});
await ok('private/public boards: no requests', async () => {
  const other = await mk('cuatro@otra.com', 'Cuatro');
  await rpc(owner, 'set_board_visibility', [board, 'private']); eq((await rpc(other, 'get_board', [slug])).can_request, false);
  await rpc(owner, 'set_board_visibility', [board, 'public']);
  try { await rpc(other, 'request_board_access', [slug, null]); throw new Error('allowed'); } catch (e) { if (!/no recibe/.test(e.message)) throw e; }
  await rpc(owner, 'set_board_visibility', [board, 'invite']);
});
await ok('requests notification pref saved', async () => { await rpc(owner, 'update_notifications', [{ requests: false }]); eq((await db.query(`select notif->>'requests' as v from public.profiles where id = $1`, [owner])).rows[0].v, 'false'); });

console.log('\n# notifications');
const nOf = async (who) => rpc(who, 'get_notifications', [50]);
await ok('access request notified even with email off', async () => {
  // owner turned the "requests" email off in the previous test
  const asker3 = await mk('cinco@otra.com', 'Cinco');
  await rpc(asker3, 'request_board_access', [slug, 'Hola']);
  const n = (await nOf(owner)).filter((x) => x.kind === 'access_request' && x.payload.email === 'cinco@otra.com');
  eq(n.length, 1); eq(n[0].read, false); if (!n[0].payload.request_id) throw new Error('no request_id');
  const mails = (await db.query(`select count(*)::int as c from public.email_outbox where template = 'access_request' and payload->>'email' = 'cinco@otra.com'`)).rows[0].c; eq(mails, 0);
});
await ok('unread count in context and RPC', async () => { const u = await rpc(owner, 'notifications_unread'); if (u < 1) throw new Error('no unread'); eq((await rpc(owner, 'get_my_context')).unread_notifications, u); });
await ok('approving resolves the notice and notifies requester', async () => {
  const asker3 = (await db.query(`select id from public.profiles where email = 'cinco@otra.com'`)).rows[0].id;
  const id = (await db.query(`select id from public.board_access_requests where user_id = $1`, [asker3])).rows[0].id;
  await rpc(owner, 'decide_access_request', [id, true]);
  const n = (await nOf(owner)).find((x) => x.kind === 'access_request' && x.payload.email === 'cinco@otra.com');
  eq(n.read, true); eq(n.payload.resolved, 'approved');
  eq((await nOf(asker3)).filter((x) => x.kind === 'access_granted').length, 1);
});
await ok('comment on my idea notifies author', async () => {
  await rpc(colleague, 'add_comment', [idea, 'Buena idea']);
  eq((await nOf(invited)).filter((x) => x.kind === 'new_comment').length >= 1, true);
});
await ok('launch notifies author and voters once', async () => {
  await rpc(owner, 'update_idea_plan', [idea, { dev_status: 'lanzada' }]);
  const a = (await nOf(invited)).filter((x) => x.kind === 'idea_launched'); eq(a.length, 1); eq(a[0].payload.mine, true);
  const v = (await nOf(colleague)).filter((x) => x.kind === 'idea_launched'); eq(v.length, 1); eq(v[0].payload.mine, false);
});
await ok('mark some read, then all', async () => {
  const list = await nOf(invited); const unread = list.filter((x) => !x.read);
  if (!unread.length) throw new Error('nothing unread');
  eq(await rpc(invited, 'mark_notifications_read', [[unread[0].id]]), 1);
  await rpc(invited, 'mark_notifications_read', [null]);
  eq(await rpc(invited, 'notifications_unread'), 0);
});
await ok('cannot read or mark others notifications', async () => {
  const mine = (await nOf(owner)).map((x) => x.id);
  const theirs = (await nOf(stranger)).map((x) => x.id);
  eq(theirs.some((x) => mine.includes(x)), false);
  eq(await rpc(stranger, 'mark_notifications_read', [mine]), 0);
});
await err('anon cannot list', () => rpc(null, 'get_notifications', [10]), 'sesión');

console.log('\n# remove, block, leave');
await err('guest cannot remove others', () => rpc(invited, 'remove_board_guest', [board, colleague]), 'Equipo');
await ok('owner removes invited guest', async () => { const r = await rpc(owner, 'remove_board_guest', [board, invited]); eq(r.domain, false); });
await ok('removed guest loses access (invitation revoked)', async () => { const d = await rpc(invited, 'get_board', [slug]); eq(d.forbidden, true); eq(d.can_request, true); });
await ok('removed guest can ask for access again', async () => eq(await rpc(invited, 'request_board_access', [slug, 'Volví']), 'pending'));
await ok('removed domain guest: warned they can come back', async () => { const r = await rpc(owner, 'remove_board_guest', [board, colleague]); eq(r.domain, true); eq((await rpc(colleague, 'get_board', [slug])).role, 'guest'); });
await ok('blocked stays out and cannot request', async () => { const d = await rpc(asker, 'get_board', [slug]); eq(d.forbidden, true); eq(d.can_request, false); });
await ok('guest leaves the board', async () => {
  const g = await mk('sale@otra.com', 'Sale');
  await rpc(owner, 'invite_guests', [board, ['sale@otra.com']]); await rpc(g, 'join_board', [slug]);
  await rpc(g, 'toggle_favorite', [board]);
  await rpc(g, 'leave_board', [board]);
  eq((await rpc(g, 'get_board', [slug])).forbidden, true);
  eq((await rpc(g, 'get_my_context')).guest_boards.length, 0);
  eq((await db.query(`select count(*)::int c from public.board_favorites where user_id = $1`, [g])).rows[0].c, 0);
});
await err('blocked cannot leave the block', () => rpc(asker, 'leave_board', [board]), 'bloqueó');
await err('non-guest cannot leave', () => rpc(stranger, 'leave_board', [board]), 'No sos parte');

console.log('\n# new idea notice');
await ok('guest idea notifies the owner', async () => {
  const g = await mk('idea@otra.com', 'Ideadora');
  await rpc(owner, 'invite_guests', [board, ['idea@otra.com']]); await rpc(g, 'join_board', [slug]);
  const id = await rpc(g, 'create_idea', [board, 'Exportar en PDF', 'Poder exportar los ebooks en formato PDF.', cats[0].id]);
  const n = (await rpc(owner, 'get_notifications', [50])).filter((x) => x.kind === 'new_idea' && x.payload.idea_id == id);
  eq(n.length, 1); eq(n[0].payload.author, 'Ideadora'); eq(n[0].payload.slug, slug); eq(n[0].payload.origin, 'comunidad');
  eq((await db.query(`select count(*)::int c from public.email_outbox where payload->>'idea_id' = $1 and template = 'new_idea'`, [String(id)])).rows[0].c, 0);
});
await ok('owner own idea: no notice to self', async () => {
  const id = await rpc(owner, 'create_idea', [board, 'Idea de la dueña', 'Una idea cargada por la dueña del buzón.', cats[0].id]);
  eq((await rpc(owner, 'get_notifications', [50])).filter((x) => x.kind === 'new_idea' && x.payload.idea_id == id).length, 0);
});

console.log('\n# vote labels');
await ok('defaults: empty labels', async () => eq((await rpc(owner, 'get_board', [slug])).board.vote_labels, {}));
await ok('rename two options', async () => eq(await rpc(owner, 'set_vote_labels', [board, { importante: '  Lo  quiero ya ', no_importante: 'Paso' }]), { importante: 'Lo quiero ya', no_importante: 'Paso' }));
await ok('everyone with access sees them', async () => eq((await rpc(colleague, 'get_board', [slug])).board.vote_labels.no_importante, 'Paso'));
await err('too long', () => rpc(owner, 'set_vote_labels', [board, { importante: 'Esto es demasiado largo' }]), 'entre 2 y 16');
await err('too short', () => rpc(owner, 'set_vote_labels', [board, { interesante: 'x' }]), 'entre 2 y 16');
await err('duplicates', () => rpc(owner, 'set_vote_labels', [board, { importante: 'Sí', interesante: 'sí' }]), 'distintos');
await err('guest cannot rename', () => rpc(colleague, 'set_vote_labels', [board, { importante: 'Hack' }]), 'Admin');
await ok('restore defaults', async () => eq(await rpc(owner, 'set_vote_labels', [board, {}]), {}));

console.log('\n# delete notifications');
await ok('delete one, others cannot delete mine, then empty all', async () => {
  const mine = await rpc(owner, 'get_notifications', [100]);
  if (mine.length < 2) throw new Error('need 2+');
  eq(await rpc(stranger, 'delete_notifications', [[mine[0].id]]), 0);
  eq(await rpc(owner, 'delete_notifications', [[mine[0].id]]), 1);
  eq((await rpc(owner, 'get_notifications', [100])).length, mine.length - 1);
  await rpc(owner, 'delete_notifications', [null]);
  eq((await rpc(owner, 'get_notifications', [100])).length, 0);
  eq(await rpc(owner, 'notifications_unread'), 0);
});

done();
