"""Carga (o borra) el buzón de demo «Ideas para Vitrina» en la cuenta de quien lo va a mostrar.

    python3 scripts/demo-vitrina/cargar.py cargar --email dueña@ejemplo.com
    python3 scripts/demo-vitrina/cargar.py borrar --email dueña@ejemplo.com

Qué crea, en la cuenta de ese email (tiene que ser Pro o Enterprise):
  · un equipo «Vitrina» con dos personas del equipo de producto inventadas, y el buzón público «Ideas para Vitrina»;
  · 20 personas de la comunidad inventadas (emails @vitrina-demo.example: no pueden entrar ni reciben correos);
  · 44 ideas en Novedades, Roadmap, Backlog, En revisión, Rechazadas y Pendientes, con votos, comentarios,
    respuestas del equipo, «me gusta», historial de estados e imágenes.
Nada de esto manda emails ni notificaciones. «borrar» quita el equipo, el buzón, las imágenes y las personas inventadas.

Necesita, en .env.local: SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SITE_URL,
y el paquete psycopg (pip install "psycopg[binary]"). Las imágenes salen de imagenes.py.
"""
import argparse, json, os, random, re, sys, unicodedata, urllib.error, urllib.request, uuid
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import datos as D  # noqa: E402

AR = timezone(timedelta(hours=-3))
TODAY = datetime.fromisoformat(D.TODAY).replace(tzinfo=AR)
NOW = datetime.now(AR) - timedelta(minutes=30)
BUCKET = 'idea-images'


# ───────────────────────── conexión ─────────────────────────
def env():
    e = {}
    for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
        m = re.match(r'^([A-Z0-9_]+)=(.*)$', line.strip())
        if m:
            v = m.group(2).strip()
            # comillas, o un comentario al final de la línea (KEY=valor  # nota), como lo lee Next.js
            e[m.group(1)] = v[1:-1] if v[:1] in '"\'' and v[-1:] == v[:1] else re.sub(r'\s+#.*$', '', v)
    return e


ENV = env()
API = ENV['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SR = ENV['SUPABASE_SERVICE_ROLE_KEY']


def http(method, path, body=None, ctype='application/json'):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        'Authorization': f'Bearer {SR}', 'apikey': SR, 'Content-Type': ctype, 'x-upsert': 'true'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'Error {e.code} en {method} {path}: {e.read().decode()[:500]}')


def db():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(ENV['SUPABASE_DB_URL'], row_factory=dict_row, prepare_threshold=None)


# ───────────────────────── ayudas ─────────────────────────
def slugify(s):
    return re.sub(r'[^a-z0-9]+', '.', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()).strip('.')


def email_of(key):
    name = D.TEAM.get(key) or D.COMMUNITY[key]
    return f'{slugify(name)}@{D.EMAIL_DOMAIN}'


def day(s, rnd, lo=9, hi=21):
    """Una fecha (AAAA-MM-DD) a una hora al azar del día, en hora de Argentina, nunca después de hoy."""
    d = datetime.fromisoformat(s).replace(tzinfo=AR) + timedelta(hours=rnd.randint(lo, hi), minutes=rnd.randint(0, 59))
    return min(d, NOW)


def between(a, b, rnd):
    if b <= a:
        return a + timedelta(minutes=rnd.randint(5, 90))
    return a + (b - a) * rnd.random()


def check_data():
    keys = set(D.TEAM) | set(D.COMMUNITY)
    titles = set()
    for i in D.IDEAS:
        assert 5 <= len(i['title']) <= 80 and 20 <= len(i['desc']) <= 2000, i['title']
        assert i['title'] not in titles, i['title']
        titles.add(i['title'])
        assert i['by'] in keys and i['votes'] <= len(D.COMMUNITY), i['title']
        for k in ('approved', 'dev', 'launch', 'review', 'rejected'):
            assert i.get(k) is None or i[k] >= i['at'], (i['title'], k)
    for t, cs in D.COMMENTS.items():
        assert t in titles, t
        at = next(i['at'] for i in D.IDEAS if i['title'] == t)
        for who, when, body, reply in cs:
            assert who in keys and when >= at and len(body) <= 1000, (t, body)
            if reply:
                assert reply[0] in D.TEAM and reply[1] >= when, (t, reply)
    for t in D.LIKES:
        assert t in D.COMMENTS, t


# ───────────────────────── personas ─────────────────────────
def ensure_people(cx):
    """Crea (si faltan) las personas inventadas con la API de Auth, sin contraseña ni email de confirmación."""
    people = {**D.TEAM, **D.COMMUNITY}
    ids = {}
    for key, name in people.items():
        em = email_of(key)
        row = cx.execute('select id from public.profiles where lower(email) = %s', (em,)).fetchone()
        if row:
            ids[key] = row['id']
            continue
        u = http('POST', '/auth/v1/admin/users', {'email': em, 'email_confirm': True,
                                                   'user_metadata': {'name': name, 'demo': 'vitrina'}})
        ids[key] = u['id']
    rnd = random.Random('personas')
    for key, uid in ids.items():
        since = datetime(2026, 5, 1, tzinfo=AR) + timedelta(days=rnd.randint(0, 40))
        cx.execute("""update public.profiles set name = %s, created_at = %s, last_seen_at = %s,
                        notif = (select coalesce(jsonb_object_agg(key, false), '{}') from jsonb_each(notif))
                      where id = %s""", (people[key], since, NOW - timedelta(hours=rnd.randint(2, 200)), uid))
    return ids


# ───────────────────────── cargar ─────────────────────────
def owner_account(cx, email):
    row = cx.execute("""select p.id uid, a.id account, public.account_is_pro(a.id) pro
                        from public.profiles p left join public.accounts a on a.owner_id = p.id
                        where lower(p.email) = lower(%s)""", (email,)).fetchone()
    if not row or not row['account']:
        raise SystemExit(f'No encontré una cuenta de Boxinger de {email}.')
    return row


def demo_boards(cx, account):
    return cx.execute("""select b.id, b.slug, t.id team from public.boards b join public.teams t on t.id = b.team_id
                         where t.account_id = %s and t.name = %s and b.name = %s""",
                      (account, D.TEAM_NAME, D.BOARD_NAME)).fetchall()


def cargar(email):
    check_data()
    with db() as cx:
        acc = owner_account(cx, email)
        if not acc['pro']:
            raise SystemExit('La cuenta tiene que ser Pro o Enterprise para mostrar Roadmap, Novedades e imágenes.')
        if demo_boards(cx, acc['account']):
            raise SystemExit('El demo ya está cargado en esta cuenta. Para empezar de nuevo, corré primero «borrar».')
        ids = ensure_people(cx)
        owner = acc['uid']
        cx.commit()

        # equipo y buzón
        team = cx.execute("""insert into public.teams (account_id, name, color) values (%s, %s, '#0f766e') returning id""",
                          (acc['account'], D.TEAM_NAME)).fetchone()['id']
        cx.execute("insert into public.team_members (team_id, user_id, role, joined_at) values (%s, %s, 'admin', %s)",
                   (team, owner, datetime(2026, 5, 20, 10, tzinfo=AR)))
        for k in D.TEAM:
            cx.execute("insert into public.team_members (team_id, user_id, role, joined_at) values (%s, %s, 'member', %s)",
                       (team, ids[k], datetime(2026, 5, 21, 11, tzinfo=AR)))
        b = cx.execute("select id, slug from public.new_board(%s, %s, 'public', %s)", (team, D.BOARD_NAME, D.BOARD_DESC)).fetchone()
        board, slug = b['id'], b['slug']
        cx.execute("""update public.boards set created_by = %s, color = '#0f766e', guests_can_view_roadmap = true,
                        created_at = %s where id = %s""", (owner, datetime(2026, 6, 1, 10, tzinfo=AR), board))
        cats = {r['name']: r['id'] for r in cx.execute('select id, name from public.categories where board_id = %s', (board,))}
        community = list(D.COMMUNITY)
        first_seen = {}

        def seen(key, when):
            if key in D.COMMUNITY:
                first_seen[key] = min(first_seen.get(key, when), when)

        idea_ids, images, order = {}, {}, {'ahora': 0, 'siguiente': 0, 'despues': 0}
        laura = ids['laura']
        for idea in D.IDEAS:
            rnd = random.Random(idea['title'])
            st = idea['stage']
            at = day(idea['at'], rnd)
            end = TODAY
            status, rm, dev, approved_at, dev_at, launched_at, reason = 'pendiente', None, 'por_empezar', None, None, None, None
            review_at = max(day(idea['review'], rnd), at + timedelta(minutes=40)) if idea.get('review') else None
            if st in ('lanzada', 'ahora', 'siguiente', 'despues', 'backlog'):
                status = 'aprobada'
                if st == 'lanzada':
                    launched_at = day(idea['launch'], rnd, 10, 17)
                    approved_at = between(at, launched_at - (launched_at - at) * 0.6, rnd)
                    dev_at = between(approved_at, launched_at, rnd)
                    rm, dev, end = 'ahora', 'lanzada', launched_at
                else:
                    approved_at = max(day(idea['approved'], rnd), at + timedelta(hours=1))
                    if st != 'backlog':
                        rm = st
                    if st == 'ahora':
                        dev, dev_at = 'en_curso', max(day(idea['dev'], rnd), approved_at + timedelta(hours=1))
                if review_at is None and approved_at - at > timedelta(days=3):
                    review_at = between(at, approved_at, rnd)
            elif st == 'en_revision':
                status = 'en_revision'
            elif st == 'rechazada':
                status, reason = 'rechazada', idea['reason']
            if rm:
                order[rm] += 1
            author = ids[idea['by']]
            seen(idea['by'], at)
            row = cx.execute("""
                insert into public.ideas (board_id, author_id, origin, title, description, category_id, status, reject_reason,
                  approved_at, impact, effort, rm_col, rm_order, priority, dev_status, dev_at, launched_at, chk_design, chk_prd,
                  growth, created_at, updated_at)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                (board, author, 'equipo' if idea['by'] in D.TEAM else 'comunidad', idea['title'], idea['desc'], cats[idea['cat']],
                 status, reason, approved_at, idea.get('impact', 0) if status == 'aprobada' else 0,
                 idea.get('effort', 0) if status == 'aprobada' else 0, rm, order[rm] if rm else None,
                 idea.get('prio') if status == 'aprobada' else None, dev, dev_at, launched_at,
                 st in ('lanzada', 'ahora'), st in ('lanzada', 'ahora', 'siguiente'),
                 idea.get('growth', []) if status == 'aprobada' else [], at, max(x for x in (at, approved_at, dev_at, launched_at) if x)))
            iid = row.fetchone()['id']
            idea_ids[idea['title']] = iid
            if idea.get('image'):
                images[iid] = idea['image']

            # historial de estados
            steps, prev = [], 'pendiente'
            if review_at and approved_at and review_at >= approved_at:
                review_at = None
            if review_at and status != 'pendiente':
                steps.append(('en_revision', review_at, None))
            if status == 'aprobada':
                steps.append(('aprobada', approved_at, None))
            elif status == 'rechazada':
                steps.append(('rechazada', max(day(idea['rejected'], rnd), (review_at or at) + timedelta(hours=2)), reason))
            for to, when, why in steps:
                cx.execute("""insert into public.status_changes (idea_id, from_status, to_status, reason, user_id, created_at)
                              values (%s, %s, %s, %s, %s, %s)""", (iid, prev, to, why, laura, when))
                prev = to

            # votos: quien propuso la idea primero, después el resto al azar
            voters = [idea['by']] if idea['by'] in D.COMMUNITY else []
            voters += rnd.sample([k for k in community if k not in voters], idea['votes'] - len(voters))
            vote_end = min(end, TODAY)
            for k, who in enumerate(voters):
                r = rnd.random()
                value = 'importante' if r < idea['imp'] else ('interesante' if r < idea['imp'] + (1 - idea['imp']) * 0.7 else 'no_importante')
                if k == 0 and who == idea['by']:
                    value, when = 'importante', at + timedelta(minutes=1)
                else:
                    when = between(at, min(vote_end, NOW), rnd)
                seen(who, when)
                cx.execute("""insert into public.votes (idea_id, user_id, value, created_at, updated_at)
                              values (%s, %s, %s, %s, %s)""", (iid, ids[who], value, when, when))

            # comentarios, respuestas del equipo y «me gusta»
            likes = D.LIKES.get(idea['title'], {})
            for n, (who, when, body, reply) in enumerate(D.COMMENTS.get(idea['title'], [])):
                c_at = day(when, rnd)
                c_at = max(c_at, at + timedelta(minutes=30))
                seen(who, c_at)
                cid = cx.execute("""insert into public.comments (idea_id, author_id, body, created_at, updated_at)
                                    values (%s, %s, %s, %s, %s) returning id""", (iid, ids[who], body, c_at, c_at)).fetchone()['id']
                if reply:
                    r_at = max(day(reply[1], rnd), c_at + timedelta(hours=1))
                    cx.execute("""insert into public.comment_replies (comment_id, author_id, body, created_at, updated_at)
                                  values (%s, %s, %s, %s, %s)""", (cid, ids[reply[0]], reply[2], r_at, r_at))
                fans = rnd.sample([k for k in community if k != who], likes.get(n, rnd.choice([0, 0, 1, 1, 2])))
                for f in fans:
                    cx.execute("""insert into public.reactions (comment_id, user_id, value, created_at)
                                  values (%s, %s, 'like', %s)""", (cid, ids[f], between(c_at, NOW, rnd)))

        # la comunidad se suma al buzón el día de su primera participación
        for k, when in first_seen.items():
            cx.execute("""insert into public.board_guests (board_id, user_id, via, joined_at) values (%s, %s, 'participation', %s)
                          on conflict do nothing""", (board, ids[k], when - timedelta(minutes=5)))
        cx.execute('update public.boards set last_activity_at = now() where id = %s', (board,))
        cx.commit()

        # imágenes: se suben al espacio privado del buzón y se enganchan a su idea
        folder = os.path.join(HERE, 'imagenes')
        for iid, name in images.items():
            path = f'{board}/{uuid.uuid4()}.webp'
            for src, dst in ((f'{name}.webp', path), (f'{name}-t.webp', path.replace('.webp', '-t.webp'))):
                with open(os.path.join(folder, src), 'rb') as fh:
                    http('POST', f'/storage/v1/object/{BUCKET}/{dst}', fh.read(), 'image/webp')
            cx.execute('update public.ideas set image_path = %s where id = %s', (path, iid))
        cx.commit()

        counts = cx.execute("""select count(*) ideas,
                                 (select count(*) from public.votes v join public.ideas i on i.id = v.idea_id where i.board_id = %(b)s) votos,
                                 (select count(*) from public.comments c join public.ideas i on i.id = c.idea_id where i.board_id = %(b)s) comentarios,
                                 count(*) filter (where image_path is not null) imagenes
                               from public.ideas where board_id = %(b)s""", {'b': board}).fetchone()
    site = ENV.get('NEXT_PUBLIC_SITE_URL', 'https://www.boxinger.com').rstrip('/')
    print(f"Listo: {counts['ideas']} ideas, {counts['votos']} votos, {counts['comentarios']} comentarios y {counts['imagenes']} imágenes.")
    print(f'Buzón: {site}/app/b/{slug}')


# ───────────────────────── borrar ─────────────────────────
def borrar(email):
    with db() as cx:
        acc = owner_account(cx, email)
        for b in demo_boards(cx, acc['account']):
            names = [r['name'] for r in cx.execute(
                "select name from storage.objects where bucket_id = %s and name like %s", (BUCKET, f"{b['id']}/%"))]
            if names:
                http('DELETE', f'/storage/v1/object/{BUCKET}', {'prefixes': names})
            cx.execute('delete from public.teams where id = %s', (b['team'],))
            print(f"Borrado el buzón {b['slug']} y su equipo.")
        cx.commit()
        people = cx.execute('select id from public.profiles where lower(email) like %s', (f'%@{D.EMAIL_DOMAIN}',)).fetchall()
    for p in people:
        http('DELETE', f"/auth/v1/admin/users/{p['id']}")
    print(f'Borradas {len(people)} personas inventadas.')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Buzón de demo «Ideas para Vitrina».')
    ap.add_argument('accion', choices=['cargar', 'borrar', 'revisar'])
    ap.add_argument('--email', help='Email de la cuenta de Boxinger donde va el demo')
    a = ap.parse_args()
    if a.accion == 'revisar':
        check_data()
        print('Los datos del demo están bien.')
    elif not a.email:
        ap.error('falta --email')
    else:
        (cargar if a.accion == 'cargar' else borrar)(a.email)
