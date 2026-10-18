"""Prepara (o borra) lo que necesita la prueba de carga con k6 (scripts/stress/prueba.js).

    python3 scripts/stress/preparar.py crear [--usuarios 100]
    python3 scripts/stress/preparar.py borrar

Qué crea, en la base de Supabase de .env.local:
  · una dueña inventada con su cuenta Free, el equipo «Prueba de carga» y el buzón público «Prueba de carga»;
  · N personas inventadas (emails @stress-boxinger.example: no existen, no reciben correos) que ya son invitadas
    del buzón, así al entrar ven «Mis Buzones» con ese buzón;
  · scripts/stress/usuarios.json con los emails, la contraseña de prueba y el slug del buzón (no se sube a git).
Nada de esto manda emails: los usuarios se crean ya confirmados y con los avisos por email apagados.
«borrar» quita el equipo (con el buzón y todas las ideas que cargó la prueba), la cuenta y todas las personas inventadas.

Necesita, en .env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. Solo usa la biblioteca estándar de Python.
"""
import argparse, json, os, re, secrets, sys, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, 'usuarios.json')
DOMAIN = 'stress-boxinger.example'
OWNER = f'duena@{DOMAIN}'
NAME = 'Prueba de carga'
NOTIF_OFF = {'comments': False, 'replies': False, 'status': False, 'digest': False}


def env():
    e = {}
    for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
        m = re.match(r'^([A-Z0-9_]+)=(.*)$', line.strip())
        if m:
            v = m.group(2).strip()
            e[m.group(1)] = v[1:-1] if v[:1] in '"\'' and v[-1:] == v[:1] else re.sub(r'\s+#.*$', '', v)
    return e


ENV = env()
API = ENV['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SR = ENV['SUPABASE_SERVICE_ROLE_KEY']


def http(method, path, body=None, prefer=None):
    headers = {'Authorization': f'Bearer {SR}', 'apikey': SR, 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(API + path, data=None if body is None else json.dumps(body).encode(), method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'Error {e.code} en {method} {path}: {e.read().decode()[:500]}')


def q(table, filters):
    return http('GET', f'/rest/v1/{table}?' + urllib.parse.urlencode(filters))


def fake_people():
    """Todas las personas con email @stress-boxinger.example (dueña incluida)."""
    return q('profiles', {'select': 'id,email', 'email': f'like.*@{DOMAIN}'}) or []


def new_user(email, name, password):
    u = http('POST', '/auth/v1/admin/users', {'email': email, 'password': password, 'email_confirm': True,
                                               'user_metadata': {'name': name, 'demo': 'stress'}})
    http('PATCH', f'/rest/v1/profiles?id=eq.{u["id"]}', {'name': name, 'notif': NOTIF_OFF, 'onboarding_skipped_at': 'now'})
    return u['id']


def crear(n):
    if fake_people():
        raise SystemExit('La prueba ya está preparada. Para empezar de nuevo, corré primero «borrar».')
    password = 'Stress-' + secrets.token_urlsafe(12)
    owner = new_user(OWNER, 'Dueña de prueba', password)
    account = http('POST', '/rest/v1/accounts', {'owner_id': owner, 'name': NAME}, 'return=representation')[0]['id']
    team = http('POST', '/rest/v1/teams', {'account_id': account, 'name': NAME}, 'return=representation')[0]['id']
    http('POST', '/rest/v1/team_members', {'team_id': team, 'user_id': owner, 'role': 'admin'})
    board = http('POST', '/rest/v1/rpc/new_board', {'p_team': team, 'p_name': NAME, 'p_visibility': 'public',
                                                     'p_description': 'Buzón para medir la velocidad de Boxinger con muchas personas a la vez.'})
    http('PATCH', f'/rest/v1/boards?id=eq.{board["id"]}', {'created_by': owner, 'guests_can_create_ideas': True})
    cats = q('categories', {'select': 'id', 'board_id': f'eq.{board["id"]}'})
    if not cats:
        raise SystemExit('El buzón quedó sin categorías.')

    emails = [f'persona{i:03d}@{DOMAIN}' for i in range(1, n + 1)]
    with ThreadPoolExecutor(8) as ex:
        ids = list(ex.map(lambda p: new_user(p[1], f'Persona {p[0]:03d}', password), enumerate(emails, 1)))
    http('POST', '/rest/v1/board_guests', [{'board_id': board['id'], 'user_id': i, 'via': 'participation'} for i in ids])

    json.dump({'supabase_url': API, 'anon_key': ENV['NEXT_PUBLIC_SUPABASE_ANON_KEY'], 'slug': board['slug'],
               'board_id': board['id'], 'categories': [c['id'] for c in cats], 'password': password, 'emails': emails},
              open(OUT, 'w'), indent=2)
    print(f'Listo: buzón «{board["slug"]}» con {n} personas de prueba. Datos en {os.path.relpath(OUT, ROOT)}.')


def borrar():
    people = fake_people()
    owner = next((p['id'] for p in people if p['email'] == OWNER), None)
    if owner:
        n = len(q('ideas', {'select': 'id', 'author_id': f'in.({",".join(p["id"] for p in people)})'}) or [])
        # El equipo se borra con sus buzones, categorías e ideas (on delete cascade); después la cuenta.
        for acc in q('accounts', {'select': 'id', 'owner_id': f'eq.{owner}'}) or []:
            http('DELETE', f'/rest/v1/teams?account_id=eq.{acc["id"]}')
            http('DELETE', f'/rest/v1/accounts?id=eq.{acc["id"]}')
        print(f'Borrado el buzón de prueba con sus {n} ideas.')
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda p: http('DELETE', f'/auth/v1/admin/users/{p["id"]}'), people))
    print(f'Borradas {len(people)} personas de prueba.')
    if os.path.exists(OUT):
        os.remove(OUT)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Datos para la prueba de carga.')
    ap.add_argument('accion', choices=['crear', 'borrar'])
    ap.add_argument('--usuarios', type=int, default=100)
    a = ap.parse_args()
    crear(a.usuarios) if a.accion == 'crear' else borrar()
