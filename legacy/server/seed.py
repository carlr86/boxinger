"""Demo data: one closed cycle (finalists, decisions, roadmap) and one running cycle.

Admin: admin@demo.com / demo1234 · Users: ana@demo.com … (password demo1234)
"""
import json
import random
import time

from .db import transaction, q1, val, ex
from . import core, auth

NAMES = ["Ana", "Bruno", "Carla", "Diego", "Eva", "Facundo", "Gabi", "Hernán", "Inés", "Julián", "Karen", "Lucas",
         "Mora", "Nico"]


def seed():
    with transaction():
        if val("SELECT COUNT(*) FROM boards"):
            print("[seed] database already has a board — skipping")
            return
        random.seed(7)
        t0 = time.time()
        org = ex("INSERT INTO organizations (name) VALUES ('Acme')")
        settings = json.loads(json.dumps(core.DEFAULT_SETTINGS))
        bid = ex("INSERT INTO boards (organization_id, name, slug, language, timezone, settings) VALUES (?,?,?,?,?,?)",
                 org, "Acme App", "acme-app", "es", "America/Argentina/Buenos_Aires", json.dumps(settings))
        board = q1("SELECT * FROM boards WHERE id=?", bid)
        pw = auth.hash_password("demo1234")

        def user(name, email, role="usuario"):
            uid = ex("INSERT INTO users (email, password_hash, email_verified, name, lang, created_at) VALUES (?,?,1,?,?,?)",
                     email, pw, name, "es", t0 - 50 * 86400)
            ex("INSERT INTO memberships (user_id, board_id, role) VALUES (?,?,?)", uid, bid, role)
            return uid

        admin = user("Carla (PM)", "admin@demo.com", "admin")
        users = [user(n, n.lower().replace("é", "e").replace("á", "a") + "@demo.com") for n in NAMES]

        from datetime import datetime, timedelta
        start = (datetime.now(core.tz(board)) - timedelta(days=40)).strftime("%Y-%m-%d")
        c1 = core.create_cycle(board, core.local_midnight(board, start), "activo")

        def idea(kind, author, title, desc, cat, cycle, created):
            iid = ex("""INSERT INTO ideas (board_id, type, author_id, title, description, category, status,
                        current_cycle_id, score_changed_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                     bid, kind, author, title, desc, cat, "en_votacion", cycle["id"], created, created)
            ex("INSERT INTO status_changes (idea_id, from_status, to_status, user_id, created_at) VALUES (?,?,?,?,?)",
               iid, None, "en_votacion", author, created)
            core.follow(author, iid)
            if kind == "B":
                ex("INSERT INTO roadmap_items (idea_id, period, status, cycle_won_id, created_at) VALUES (?,?,?,?,?)",
                   iid, core.period_for(board, cycle["starts_at"], cycle["kind"]), "planificada", cycle["id"], created)
            return iid

        def votes(iid, cycle, spec, when):
            """spec: list of (value, count). Voters exclude the author."""
            author = val("SELECT author_id FROM ideas WHERE id=?", iid)
            pool = [u for u in users if u != author]
            random.shuffle(pool)
            k = 0
            for value, n in spec:
                for _ in range(n):
                    reason = random.choice([None, "Me preocupa que complique la app", "No lo usaría"]) if value == "down" else None
                    ex("INSERT INTO votes (user_id, idea_id, cycle_id, value, reason, created_at) VALUES (?,?,?,?,?,?)",
                       pool[k], iid, cycle["id"], value, reason, when + k * 60)
                    k += 1
            ex("UPDATE ideas SET score_changed_at=? WHERE id=?", when + k * 60, iid)

        # ------------------------------------------------ cycle 1 (closed)
        d = c1["starts_at"] + 86400
        c_ideas = [
            ("Modo oscuro", "Un tema oscuro para usar la app de noche sin cansar la vista.", "UX / Diseño", [("up", 11), ("down", 1)]),
            ("Exportar reportes a Excel", "Poder descargar los reportes mensuales en .xlsx para compartirlos.", "Funcionalidad", [("up", 9), ("down", 1)]),
            ("Integración con Google Calendar", "Sincronizar vencimientos con mi calendario.", "Integraciones", [("up", 8), ("down", 2)]),
            ("Atajos de teclado", "Atajos para crear, buscar y navegar sin mouse.", "UX / Diseño", [("up", 5), ("down", 2)]),
            ("Plantillas de proyectos", "Arrancar un proyecto nuevo desde una plantilla guardada.", "Funcionalidad", [("up", 4), ("down", 1)]),
            ("Widget para la pantalla de inicio", "Ver mis pendientes sin abrir la app.", "Funcionalidad", [("up", 3), ("down", 3)]),
            ("Avatares animados", "Que los avatares tengan animaciones divertidas.", "Otro", [("up", 1), ("down", 5)]),
        ]
        ids1 = []
        for n, (title, desc, cat, spec) in enumerate(c_ideas):
            iid = idea("C", users[n], title, desc, cat, c1, d + n * 3600)
            votes(iid, c1, spec, d + 86400 + n * 7200)
            ids1.append(iid)
        a1 = idea("A", admin, "Rediseñar el onboarding en 3 pasos",
                  "Queremos reducir el onboarding actual de 7 pantallas a 3. ¿Qué tan importante es para vos?", "UX / Diseño", c1, d)
        votes(a1, c1, [("importante", 9), ("deseable", 3), ("no_importante", 1)], d + 3600)
        a2 = idea("A", admin, "Chat en vivo con soporte",
                  "Evaluamos sumar un chat en vivo dentro de la app.", "Funcionalidad", c1, d)
        votes(a2, c1, [("importante", 3), ("deseable", 4), ("no_importante", 4)], d + 3600)
        b1 = idea("B", admin, "App nativa para Android",
                  "Ya está confirmada: vamos a lanzar la app nativa para Android. Contanos cuánto te importa.", "Funcionalidad", c1, d)
        votes(b1, c1, [("importante", 10), ("no_importante", 2)], d + 3600)
        ex("INSERT INTO comments (idea_id, user_id, body, created_at) VALUES (?,?,?,?)", ids1[0], users[3],
           "¡Sí por favor! Uso la app todas las noches.", d + 2 * 86400)
        ex("INSERT INTO comments (idea_id, user_id, body, is_official, created_at) VALUES (?,?,?,?,?)", ids1[0], admin,
           "¡Gracias por proponerlo! Lo vamos a evaluar al cierre del ciclo.", 1, d + 3 * 86400)

        core.close_cycle(board, q1("SELECT * FROM cycles WHERE id=?", c1["id"]))
        c2 = core.active_cycle(bid)

        # Decisions on cycle 1
        adm = q1("SELECT * FROM users WHERE id=?", admin)
        get = lambda i: q1("SELECT * FROM ideas WHERE id=?", i)
        ex("UPDATE prioritizations SET effort=2, revenue=3, criticality=3 WHERE idea_id=?", ids1[0])
        ex("UPDATE prioritizations SET effort=2, revenue=4, criticality=3 WHERE idea_id=?", ids1[1])
        ex("UPDATE prioritizations SET effort=4, revenue=3, criticality=2 WHERE idea_id=?", ids1[2])
        ex("UPDATE prioritizations SET effort=3, revenue=4 WHERE idea_id=?", a1)
        core.decide(board, adm, get(ids1[0]), "aceptar")
        core.decide(board, adm, get(ids1[2]), "rechazar",
                    reason="Por ahora priorizamos la app de Android; revisaremos integraciones de calendario el próximo trimestre.")
        core.decide(board, adm, get(a1), "aceptar")
        item = q1("SELECT * FROM roadmap_items WHERE idea_id=?", ids1[0])
        core.update_roadmap(board, adm, item, status="en_desarrollo")
        item = q1("SELECT * FROM roadmap_items WHERE idea_id=?", b1)
        core.update_roadmap(board, adm, item, status="en_desarrollo")

        # ------------------------------------------------ cycle 2 (running)
        d2 = c2["starts_at"] + 3600
        c2_ideas = [
            ("Recordatorios por WhatsApp", "Recibir los recordatorios de vencimientos por WhatsApp.", "Integraciones", [("up", 8), ("down", 1)]),
            ("Buscador con filtros avanzados", "Filtrar por fecha, etiqueta y responsable al mismo tiempo.", "Funcionalidad", [("up", 6), ("down", 0)]),
            ("Etiquetas de colores", "Asignar colores a las etiquetas para distinguirlas rápido.", "UX / Diseño", [("up", 5), ("down", 1)]),
            ("Modo offline", "Poder usar la app sin conexión y sincronizar después.", "Rendimiento", [("up", 4), ("down", 2)]),
            ("Compartir tableros con clientes", "Invitar a un cliente con permisos de solo lectura.", "Funcionalidad", [("up", 2), ("down", 0)]),
            ("Sonidos al completar tareas", "Un sonidito de celebración al terminar una tarea.", "Otro", [("up", 1), ("down", 3)]),
        ]
        for n, (title, desc, cat, spec) in enumerate(c2_ideas):
            iid = idea("C", users[(n + 6) % len(users)], title, desc, cat, c2, d2 + n * 3600)
            votes(iid, c2, spec, d2 + 7200 + n * 3600)
        a3 = idea("A", admin, "Plan familiar con varias cuentas",
                  "Estamos pensando en un plan para compartir la suscripción con hasta 5 personas.", "Funcionalidad", c2, d2)
        votes(a3, c2, [("importante", 5), ("deseable", 2), ("no_importante", 1)], d2 + 3600)
        ex("INSERT INTO comments (idea_id, user_id, body, created_at) VALUES (?,?,?,?)", a3, users[1],
           "Lo usaría con mi pareja, pero depende del precio.", d2 + 7200)
        ex("INSERT INTO comments (idea_id, user_id, body, is_official, created_at) VALUES (?,?,?,?,?)", a3, admin,
           "El precio sería menor que dos suscripciones individuales.", 1, d2 + 9000)
        b2 = idea("B", admin, "Nuevo diseño del panel principal",
                  "Confirmado para este trimestre. ¿Qué tan importante es para vos?", "UX / Diseño", c2, d2)
        votes(b2, c2, [("importante", 2), ("no_importante", 4)], d2 + 3600)
        core.check_b_alert(board, get(b2), core.idea_stats(get(b2)), c2)

        # A claim in progress on a non-finalist (2 of 5 supports)
        nf = ids1[3]
        core.claim(board, q1("SELECT * FROM users WHERE id=?", users[8]), get(nf))
        core.support(board, q1("SELECT * FROM users WHERE id=?", users[9]), get(nf))

        ex("INSERT INTO reports (object_type, object_id, user_id, reason, created_at) VALUES ('idea',?,?,?,?)",
           ids1[6], users[2], "Parece una broma, no es una idea seria.", t0 - 86400)

        ex("DELETE FROM notifications")  # start with a clean dev mailbox
        print("[seed] demo board ready — admin@demo.com / demo1234 (users: ana@demo.com … / demo1234)")
