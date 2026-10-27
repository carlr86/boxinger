// Activation link of a client created from the admin panel (/app/activar/[token]): choosing the first password.
import { ACCOUNT, OWNER, freshDb } from './helpers';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { activateWithPassword } from '@/app/app/activar/[token]/actions';
import type { FakeDb } from './fakes/db';

const future = () => new Date(Date.now() + 7 * 864e5).toISOString();
let db: FakeDb;
const invitation = () => db.rows('invitations')[0];

beforeEach(() => {
  db = freshDb();
  db.seed('invitations', { token: 'tok-1', kind: 'client', email: 'ana_p@example.com', account_id: ACCOUNT, expires_at: future(), accepted_at: null, accepted_by: null, revoked_at: null });
});

test('elegir la contraseña activa la cuenta y usa el link', async () => {
  const r = await activateWithPassword('tok-1', 'clave1234');
  assert.deepEqual(r, { email: 'ana_p@example.com', slug: 'ideas-de-ana' });
  assert.equal(db.authUsers[OWNER].password, 'clave1234');
  assert.ok(invitation().accepted_at, 'el link queda usado');
  assert.equal(invitation().accepted_by, OWNER);
  assert.ok(db.rows('profiles')[0].activated_at);
});

test('el mismo link no sirve para cambiar la contraseña otra vez', async () => {
  await activateWithPassword('tok-1', 'clave1234');
  const again = await activateWithPassword('tok-1', 'otraclave99');
  assert.equal(again.error, 'La cuenta ya está activada. Ingresá con tu email.');
  assert.equal(db.authUsers[OWNER].password, 'clave1234', 'la contraseña no cambia');
});

test('si no se pudo guardar la contraseña, el link sigue sirviendo', async () => {
  db.failNext('auth', 'auth');
  const r = await activateWithPassword('tok-1', 'clave1234');
  assert.equal(r.error, 'No pudimos guardar la contraseña. Probá de nuevo.');
  assert.equal(invitation().accepted_at, null);
  assert.ok(!(OWNER in db.authUsers), 'no se guardó ninguna contraseña');

  const retry = await activateWithPassword('tok-1', 'clave1234');
  assert.equal(retry.email, 'ana_p@example.com');
  assert.equal(db.authUsers[OWNER].password, 'clave1234');
});

test('si la base falla al usar el link, no se guarda la contraseña', async () => {
  db.failNext('invitations', 'update');
  const r = await activateWithPassword('tok-1', 'clave1234');
  assert.equal(r.error, 'No pudimos activar la cuenta. Probá de nuevo en unos minutos.');
  assert.ok(!(OWNER in db.authUsers), 'no se guardó ninguna contraseña');
});

test('un link vencido, revocado o inventado no sirve', async () => {
  invitation().expires_at = '2026-01-01T00:00:00Z';
  assert.equal((await activateWithPassword('tok-1', 'clave1234')).error, 'El link venció. Pedile a Boxinger uno nuevo.');
  invitation().expires_at = future();
  invitation().revoked_at = new Date().toISOString();
  assert.equal((await activateWithPassword('tok-1', 'clave1234')).error, 'El link de activación no es válido.');
  assert.equal((await activateWithPassword('no-existe', 'clave1234')).error, 'El link de activación no es válido.');
  assert.ok(!(OWNER in db.authUsers), 'no se guardó ninguna contraseña');
});

test('una contraseña débil se rechaza antes de tocar el link', async () => {
  const r = await activateWithPassword('tok-1', 'corta');
  assert.ok(r.error);
  assert.equal(invitation().accepted_at, null);
});
