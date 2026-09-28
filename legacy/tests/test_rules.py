"""Business rules from the PRD, exercised through the API layer.

    python3 -m unittest discover tests
"""
import json
import os
import tempfile
import time
import unittest

_tmp = tempfile.mkdtemp()
os.environ["IB_DB"] = os.path.join(_tmp, "test.db")

from server import db, core, auth, api  # noqa: E402
from server.core import ApiError  # noqa: E402


def call(method, path, token=None, body=None, query=None):
    with db.transaction():
        req = api.Req(method, path, query or {}, body or {}, token, "127.0.0.1")
        return api.dispatch(req)


class Board:
    """A fresh board with an admin, N verified users and an active cycle."""

    def __init__(self, users=12, **cycle):
        db._conn = None
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(os.environ["IB_DB"] + suffix)
            except FileNotFoundError:
                pass
        auth._hits.clear()
        with db.transaction():
            s = json.loads(json.dumps(core.DEFAULT_SETTINGS))
            s["cycle"].update(cycle)
            org = db.ex("INSERT INTO organizations (name) VALUES ('T')")
            bid = db.ex("INSERT INTO boards (organization_id, name, slug, settings) VALUES (?,?,?,?)",
                        org, "Test", "test", json.dumps(s))
            self.board = db.q1("SELECT * FROM boards WHERE id=?", bid)
            self.admin = self._user("admin@t.com", "admin")
            self.users = [self._user("u%d@t.com" % i) for i in range(users)]
            self.unverified = self._user("nv@t.com", verified=False)
            core.create_cycle(self.board, time.time() - 86400, "activo")

    def _user(self, email, role="usuario", verified=True):
        uid = db.ex("INSERT INTO users (email, email_verified, name, created_at) VALUES (?,?,?,?)",
                    email, 1 if verified else 0, email.split("@")[0], time.time())
        db.ex("INSERT INTO memberships (user_id, board_id, role) VALUES (?,?,?)", uid, self.board["id"], role)
        return auth.create_session(uid)

    def idea(self, token, title="Una idea de prueba", kind="C"):
        return call("POST", "/api/ideas", token, {"title": title, "type": kind})["id"]

    def vote(self, token, idea_id, value, reason=None):
        return call("POST", "/api/ideas/%d/vote" % idea_id, token, {"value": value, "reason": reason})

    def votes(self, idea_id, spec):
        """Cast votes from distinct users, skipping the idea's author."""
        with db.transaction():
            author = db.val("SELECT author_id FROM ideas WHERE id=?", idea_id)
            voters = [tok for tok in self.users if auth.session_user(tok)["id"] != author]
        n = 0
        for value, count in spec:
            for _ in range(count):
                self.vote(voters[n], idea_id, value)
                n += 1

    def close(self):
        return call("POST", "/api/admin/close-cycle", self.admin)

    def status(self, idea_id):
        with db.transaction():
            return db.val("SELECT status FROM ideas WHERE id=?", idea_id)


class VotingRules(unittest.TestCase):
    def test_author_cannot_vote_own_c_idea(self):
        b = Board()
        i = b.idea(b.users[0])
        with self.assertRaises(ApiError) as e:
            b.vote(b.users[0], i, "up")
        self.assertEqual(e.exception.code, "cannot_vote_own_idea")

    def test_unverified_cannot_vote_or_publish(self):
        b = Board()
        i = b.idea(b.users[0])
        for fn in (lambda: b.vote(b.unverified, i, "up"), lambda: b.idea(b.unverified)):
            with self.assertRaises(ApiError) as e:
                fn()
            self.assertEqual(e.exception.code, "email_not_verified")

    def test_one_vote_per_user_editable_and_removable(self):
        b = Board()
        i = b.idea(b.users[0])
        self.assertEqual(b.vote(b.users[1], i, "up")["counts"]["score"], 1)
        self.assertEqual(b.vote(b.users[1], i, "down")["counts"], {"up": 0, "down": 1, "score": -1})
        self.assertEqual(b.vote(b.users[1], i, None)["counts"]["score"], 0)

    def test_only_type_specific_values(self):
        b = Board()
        a = b.idea(b.admin, kind="A")
        with self.assertRaises(ApiError):
            b.vote(b.users[0], a, "up")
        b.vote(b.users[0], a, "deseable")

    def test_users_cannot_publish_team_ideas(self):
        b = Board()
        with self.assertRaises(ApiError) as e:
            b.idea(b.users[0], kind="A")
        self.assertEqual(e.exception.code, "forbidden")

    def test_tie_break_first_to_reach_score_wins(self):
        b = Board()
        first, second = b.idea(b.users[0], "Primera idea"), b.idea(b.users[1], "Segunda idea")
        b.vote(b.users[2], second, "up")
        time.sleep(0.01)
        b.vote(b.users[3], first, "up")
        items = call("GET", "/api/ideas", query={"tab": "comunidad"})["items"]
        self.assertEqual([x["id"] for x in items], [second, first])


class Visibility(unittest.TestCase):
    def test_a_counts_and_user_comments_are_private(self):
        b = Board()
        a = b.idea(b.admin, kind="A")
        b.vote(b.users[0], a, "importante")
        call("POST", "/api/ideas/%d/comments" % a, b.users[0], {"body": "privado de u0"})
        call("POST", "/api/ideas/%d/comments" % a, b.admin, {"body": "respuesta oficial"})
        other = call("GET", "/api/ideas/%d" % a, b.users[1])
        self.assertIsNone(other["counts"])
        self.assertEqual([c["body"] for c in other["comments"]], ["respuesta oficial"])
        mine = call("GET", "/api/ideas/%d" % a, b.users[0])
        self.assertEqual(len(mine["comments"]), 2)
        admin = call("GET", "/api/ideas/%d" % a, b.admin)
        self.assertEqual(admin["counts"]["importante"], 1)
        self.assertTrue(admin["comments"][0]["official"])

    def test_c_counts_after_vote_option(self):
        b = Board()
        with db.transaction():
            s = core.settings(b.board)
            s["c_show_after_vote"] = True
            db.ex("UPDATE boards SET settings=? WHERE id=?", json.dumps(s), b.board["id"])
        i = b.idea(b.users[0])
        self.assertIsNone(call("GET", "/api/ideas/%d" % i, b.users[1])["counts"])
        self.assertIsNotNone(b.vote(b.users[1], i, "up")["counts"])

    def test_down_reason_only_for_admin(self):
        b = Board()
        i = b.idea(b.users[0])
        b.vote(b.users[1], i, "down", "me preocupa")
        self.assertNotIn("voters", call("GET", "/api/ideas/%d" % i, b.users[2]))
        voters = call("GET", "/api/ideas/%d" % i, b.admin)["voters"]
        self.assertEqual(voters[0]["reason"], "me preocupa")


class CycleClose(unittest.TestCase):
    def test_close_assigns_finalists_validation_and_opens_next(self):
        b = Board(top_n=2, a_min_responses=3, a_threshold_pct=60)
        c = [b.idea(b.users[10 + (n % 2)], "Idea numero %d" % n) for n in range(3)]
        b.votes(c[0], [("up", 5)])
        b.votes(c[1], [("up", 3)])
        b.votes(c[2], [("up", 1)])
        a_ok, a_no, bb = b.idea(b.admin, "Validable", "A"), b.idea(b.admin, "No validable", "A"), b.idea(b.admin, "Confirmada", "B")
        b.votes(a_ok, [("importante", 3), ("deseable", 1)])
        b.votes(a_no, [("importante", 1), ("no_importante", 3)])
        b.close()
        self.assertEqual([b.status(x) for x in c], ["finalista", "finalista", "no_finalista"])
        self.assertEqual((b.status(a_ok), b.status(a_no), b.status(bb)), ("validada", "no_validada", "en_roadmap"))
        with self.assertRaises(ApiError):  # votes are frozen
            b.vote(b.users[9], c[2], "up")
        with db.transaction():
            self.assertEqual(core.active_cycle(b.board["id"])["number"], 2)
            prio = {r["id"] for r in core.prioritization_rows(b.board)}
        self.assertEqual(prio, {c[0], c[1], a_ok})
        groups = call("GET", "/api/finalists")["groups"]
        self.assertEqual([i["id"] for i in groups[0]["items"]], [c[0], c[1]])

    def test_claim_reaching_supports_competes_again_from_zero(self):
        b = Board(top_n=1, supports_required=3)
        win, lose = b.idea(b.users[0], "Ganadora"), b.idea(b.users[1], "Perdedora")
        b.votes(win, [("up", 4)])
        b.vote(b.users[5], lose, "up")
        b.close()
        claimed = call("POST", "/api/ideas/%d/claim" % lose, b.users[2])
        self.assertEqual(claimed["claim"]["missing"], 2)
        with self.assertRaises(ApiError):
            call("POST", "/api/ideas/%d/support" % lose, b.users[2])  # one support per user
        call("POST", "/api/ideas/%d/support" % lose, b.users[3])
        back = call("POST", "/api/ideas/%d/support" % lose, b.users[4])
        self.assertEqual(back["status"], "en_votacion")
        self.assertEqual(back["counts"]["score"], 0)
        self.assertEqual(back["last_entry"]["up"], 1)  # history stays visible

    def test_unfulfilled_claim_expires_and_idea_archives_after_n_cycles(self):
        b = Board(top_n=1, supports_required=5, cycles_to_archive=3)
        win, lose = b.idea(b.users[0], "Ganadora"), b.idea(b.users[1], "Perdedora")
        b.votes(win, [("up", 2)])
        b.close()  # lose → no_finalista, counter 0
        call("POST", "/api/ideas/%d/claim" % lose, b.users[2])
        b.close()  # claim expires, back to no_finalista, cycle had a claim → counter stays 0
        self.assertEqual(b.status(lose), "no_finalista")
        with db.transaction():
            self.assertEqual(db.val("SELECT status FROM claims WHERE idea_id=?", lose), "vencido")
        b.close()
        b.close()
        self.assertEqual(b.status(lose), "no_finalista")
        b.close()
        self.assertEqual(b.status(lose), "archivada")


class DecisionsAndModeration(unittest.TestCase):
    def test_reject_requires_public_reason_and_accept_creates_roadmap_item(self):
        b = Board(top_n=2)
        x, y = b.idea(b.users[0], "Primera finalista"), b.idea(b.users[1], "Segunda finalista")
        b.votes(x, [("up", 2)])
        b.close()
        with self.assertRaises(ApiError) as e:
            call("POST", "/api/admin/prioritization/%d/decide" % y, b.admin, {"decision": "rechazar", "reason": " "})
        self.assertEqual(e.exception.code, "reason_required")
        call("POST", "/api/admin/prioritization/%d/decide" % y, b.admin, {"decision": "rechazar", "reason": "No encaja"})
        call("POST", "/api/admin/prioritization/%d/decide" % x, b.admin, {"decision": "aceptar", "period": "2026-11"})
        items = call("GET", "/api/finalists")["groups"][0]["items"]
        self.assertEqual({i["id"]: (i["state"], i["reason"]) for i in items},
                         {x: ("aceptada", None), y: ("rechazada", "No encaja")})
        rm = call("GET", "/api/roadmap")["items"]
        self.assertEqual([(r["idea_id"], r["period"], r["origin"]) for r in rm], [(x, "2026-11", "comunidad")])

    def test_merge_sums_votes_without_duplicating_users(self):
        b = Board()
        src, dst = b.idea(b.users[0], "Modo oscuro"), b.idea(b.users[1], "Tema oscuro")
        for u in (2, 3, 4):
            b.vote(b.users[u], src, "up")
        for u in (3, 5):
            b.vote(b.users[u], dst, "up")
        b.vote(b.users[1], src, "up")  # author of dst voted src: must not count on their own idea
        call("POST", "/api/admin/ideas/%d/merge" % src, b.admin, {"target_id": dst})
        self.assertEqual(call("GET", "/api/ideas/%d" % dst)["counts"]["up"], 4)  # users 2,3,4,5

    def test_similar_suggestions(self):
        b = Board()
        i = b.idea(b.users[0], "Exportar reportes a Excel")
        self.assertEqual([x["id"] for x in call("GET", "/api/ideas/similar", query={"q": "exportar a excel"})["items"]], [i])

    def test_admin_routes_require_admin(self):
        b = Board()
        with self.assertRaises(ApiError) as e:
            call("GET", "/api/admin/dashboard", b.users[0])
        self.assertEqual(e.exception.code, "forbidden")


if __name__ == "__main__":
    unittest.main()
