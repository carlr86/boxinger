"""JSON API: routes, permission checks and serialization by visibility rules."""
import json
import os
import re
import time
from datetime import datetime

from .db import q, q1, val, ex
from . import core, auth, mail
from .core import ApiError, now

DEV = os.environ.get("IB_DEV", "1") == "1"
ROUTES = []


def route(method, pattern, level=None):
    """level: None (public), 'user' (logged in), 'admin'."""
    def deco(fn):
        ROUTES.append((method, re.compile("^" + pattern + "$"), fn, level))
        return fn
    return deco


class Req:
    def __init__(self, method, path, query, body, token, ip):
        self.method, self.path, self.query, self.body, self.token, self.ip = method, path, query, body, token, ip
        self.board = core.get_board()
        self.user = auth.session_user(token)
        self.role = None
        if self.user and self.board:
            self.role = val("SELECT role FROM memberships WHERE user_id=? AND board_id=?", self.user["id"], self.board["id"])
        self.set_cookie = None  # (token, max_age)

    @property
    def admin(self):
        return self.role == "admin"

    @property
    def uid(self):
        return self.user["id"] if self.user else None

    def arg(self, key, default=None):
        v = self.body.get(key, default)
        return v.strip() if isinstance(v, str) else v


def dispatch(req):
    for method, rx, fn, level in ROUTES:
        m = rx.match(req.path)
        if m and method == req.method:
            if fn.__name__ != "setup" and fn.__name__ != "state" and not req.board:
                raise ApiError("setup_needed", 409)
            if level and not req.user:
                raise ApiError("login_required", 401)
            if level == "admin" and not req.admin:
                raise ApiError("forbidden", 403)
            return fn(req, *[int(g) if g.isdigit() else g for g in m.groups()])
    raise ApiError("not_found", 404)


# ---------------------------------------------------------------- helpers

def require_verified(req):
    if not req.user:
        raise ApiError("login_required", 401)
    if not req.user["email_verified"]:
        raise ApiError("email_not_verified", 403)


def get_idea(req, idea_id, allow_hidden=False):
    idea = q1("SELECT * FROM ideas WHERE id=? AND board_id=?", idea_id, req.board["id"])
    if not idea or (idea["hidden"] and not req.admin and not allow_hidden):
        raise ApiError("not_found", 404)
    return idea


def user_name(uid):
    return val("SELECT name FROM users WHERE id=?", uid) if uid else None


def me_payload(req):
    if not req.user:
        return None
    u = req.user
    return {"id": u["id"], "email": u["email"], "name": u["name"], "lang": u["lang"],
            "verified": bool(u["email_verified"]), "role": req.role or "usuario",
            "prefs": {k: json.loads(u["notif_prefs"] or "{}").get(k, True) for k in mail.PREF_TYPES}}


def cycle_meta(cycle_id):
    c = q1("SELECT id, number, kind, starts_at, ends_at FROM cycles WHERE id=?", cycle_id) if cycle_id else None
    return dict(c) if c else None


def visible_comments_sql(req, idea):
    """Comments on A ideas: users only see their own plus official answers."""
    if req.admin:
        return "", ()
    if idea["type"] == "A":
        return " AND c.hidden=0 AND (c.is_official=1 OR c.user_id=?)", (req.uid or -1,)
    return " AND c.hidden=0", ()


def serialize_idea(req, idea, cycle=None, detail=False, rank=None):
    s = core.settings(req.board)
    uid = req.uid
    my = None
    if uid and idea["current_cycle_id"]:
        my = q1("SELECT value, reason FROM votes WHERE user_id=? AND idea_id=? AND cycle_id=?",
                uid, idea["id"], idea["current_cycle_id"])
    st = core.idea_stats(idea) if idea["current_cycle_id"] else None
    is_author = uid is not None and idea["author_id"] == uid
    if req.admin:
        show = True
    elif idea["type"] == "C":
        show = not (idea["status"] == "en_votacion" and s["c_show_after_vote"] and not my and not is_author)
    elif idea["type"] == "B":
        show = bool(s["b_public_counts"])
    else:
        show = False
    extra_sql, extra_args = visible_comments_sql(req, idea)
    out = {
        "id": idea["id"], "type": idea["type"], "title": idea["title"], "description": idea["description"],
        "category": idea["category"], "status": idea["status"],
        "origin": "comunidad" if idea["type"] == "C" else "equipo",
        "author": {"id": idea["author_id"], "name": user_name(idea["author_id"])},
        "created_at": idea["created_at"], "hidden": bool(idea["hidden"]), "merged_into": idea["merged_into"],
        "counts": st if show else None, "counts_hidden_until_vote": (not show and idea["type"] == "C"),
        "my_vote": my["value"] if my else None,
        "can_vote": bool(core.can_vote_idea(idea, cycle)) and not (idea["type"] == "C" and is_author),
        "is_author": is_author, "rank": rank,
        "comments_count": val("SELECT COUNT(*) FROM comments c WHERE c.idea_id=?" + extra_sql, idea["id"], *extra_args),
        "following": bool(uid and val("SELECT 1 FROM follows WHERE user_id=? AND idea_id=?", uid, idea["id"])),
        "reject_reason": idea["reject_reason"],
        "cycle": cycle_meta(idea["current_cycle_id"]),
    }
    if idea["status"] in ("reclamada",):
        out["claim"] = core.claim_info(idea["id"], uid)
    if idea["type"] == "C":  # history stays visible, also when an idea competes again
        last = q1("""SELECT e.*, c.number, c.starts_at, c.kind FROM idea_cycle_entries e JOIN cycles c ON c.id=e.cycle_id
                     WHERE e.idea_id=? ORDER BY c.number DESC LIMIT 1""", idea["id"])
        out["last_entry"] = _entry(req, idea, last) if last else None
        out["cycles_without_claim"] = idea["cycles_without_claim"]
    item = core.roadmap_item(idea["id"])
    if item:
        out["roadmap"] = {"status": item["status"], "period": item["period"]}
    if detail:
        out["history"] = [_entry(req, idea, e) for e in q(
            """SELECT e.*, c.number, c.starts_at, c.kind FROM idea_cycle_entries e JOIN cycles c ON c.id=e.cycle_id
               WHERE e.idea_id=? ORDER BY c.number DESC""", idea["id"])]
        out["comments"] = [{
            "id": c["id"], "body": c["body"], "official": bool(c["is_official"]), "hidden": bool(c["hidden"]),
            "author": {"id": c["user_id"], "name": c["uname"]}, "mine": c["user_id"] == uid,
            "created_at": c["created_at"],
            "private": idea["type"] == "A" and not c["is_official"],
        } for c in q("""SELECT c.*, u.name AS uname FROM comments c LEFT JOIN users u ON u.id=c.user_id
                        WHERE c.idea_id=?""" + extra_sql + " ORDER BY c.is_official DESC, c.created_at ASC",
                     idea["id"], *extra_args)]
        out["status_log"] = [dict(r) for r in q(
            "SELECT from_status, to_status, created_at FROM status_changes WHERE idea_id=? ORDER BY id", idea["id"])]
        if req.admin:
            out["voters"] = [dict(r) for r in q(
                """SELECT u.name, u.email, v.value, v.reason, v.created_at FROM votes v JOIN users u ON u.id=v.user_id
                   WHERE v.idea_id=? AND v.cycle_id=? ORDER BY v.created_at DESC""", idea["id"], idea["current_cycle_id"])]
            p = q1("SELECT * FROM prioritizations WHERE idea_id=?", idea["id"])
            out["prioritization"] = dict(p) if p else None
            if idea["type"] == "A" and idea["current_cycle_id"]:
                c = q1("SELECT * FROM cycles WHERE id=?", idea["current_cycle_id"])
                out["threshold"] = {"pct": c["a_threshold_pct"], "min": c["a_min_responses"],
                                    "validated": core.a_is_validated(st, c)}
    return out


def _entry(req, idea, e):
    d = {"cycle_number": e["number"], "cycle_start": e["starts_at"], "cycle_kind": e["kind"],
         "result": e["result"], "position": e["position"]}
    if idea["type"] == "C":
        d.update(up=e["up"], down=e["down"], score=e["score_final"])
    elif req.admin or (idea["type"] == "B" and core.settings(req.board)["b_public_counts"]):
        d.update(importante=e["importante"], deseable=e["deseable"], no_importante=e["no_importante"],
                 responses=e["responses"], score=e["score_final"])
    return d


def text_filter(rows, req):
    cat = req.query.get("category")
    term = (req.query.get("q") or "").lower().strip()
    out = []
    for r in rows:
        if cat and r["category"] != cat:
            continue
        if term and term not in (r["title"] + " " + (r["description"] or "")).lower():
            continue
        out.append(r)
    return out


# ---------------------------------------------------------------- state / setup / auth

@route("GET", "/api/state")
def state(req):
    if not req.board:
        return {"setup_needed": True, "dev": DEV}
    b = req.board
    s = core.settings(b)
    return {
        "setup_needed": False, "dev": DEV,
        "board": {"id": b["id"], "name": b["name"], "slug": b["slug"], "logo_url": b["logo_url"],
                  "language": b["language"], "timezone": b["timezone"],
                  "settings": {"c_show_after_vote": s["c_show_after_vote"], "b_public_counts": s["b_public_counts"],
                               "categories": s["categories"]}},
        "cycle": core.cycle_public(core.current_cycle(b["id"])),
        "me": me_payload(req),
        "server_time": now(),
    }


@route("POST", "/api/setup")
def setup(req):
    if req.board:
        raise ApiError("already_setup", 409)
    email = (req.arg("email") or "").lower()
    pw, name = req.arg("password") or "", req.arg("name") or ""
    board_name, org = req.arg("board_name") or "", req.arg("org_name") or req.arg("board_name") or ""
    _validate_account(email, pw, name)
    if len(board_name) < 2:
        raise ApiError("invalid_board_name")
    lang = req.arg("language") if req.arg("language") in ("es", "en") else "es"
    tzname = req.arg("timezone") or "America/Argentina/Buenos_Aires"
    _check_tz(tzname)
    org_id = ex("INSERT INTO organizations (name) VALUES (?)", org)
    slug = _slugify(req.arg("slug") or board_name)
    settings = json.loads(json.dumps(core.DEFAULT_SETTINGS))
    if req.arg("kind") in ("mensual", "trimestral"):
        settings["cycle"]["kind"] = req.arg("kind")
    bid = ex("INSERT INTO boards (organization_id, name, slug, language, timezone, settings) VALUES (?,?,?,?,?,?)",
             org_id, board_name, slug, lang, tzname, json.dumps(settings))
    board = q1("SELECT * FROM boards WHERE id=?", bid)
    uid = ex("INSERT INTO users (email, password_hash, email_verified, name, lang, created_at) VALUES (?,?,1,?,?,?)",
             email, auth.hash_password(pw), name, lang, now())
    ex("INSERT INTO memberships (user_id, board_id, role) VALUES (?,?,'admin')", uid, bid)
    start = req.arg("start_date")
    starts_at = core.local_midnight(board, start) if start else core.default_first_start(board)
    core.create_cycle(board, starts_at, "activo" if starts_at <= now() else "programado")
    req.set_cookie = (auth.create_session(uid), auth.SESSION_DAYS * 86400)
    return {"ok": True}


def _slugify(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60] or "board"


def _check_tz(name):
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(name)
    except Exception:
        raise ApiError("invalid_timezone")


def _validate_account(email, pw, name, need_pw=True):
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email or ""):
        raise ApiError("invalid_email")
    if need_pw and len(pw) < 8:
        raise ApiError("password_too_short")
    if not name or len(name) > 80:
        raise ApiError("invalid_name")


def _ensure_membership(uid, board):
    ex("INSERT OR IGNORE INTO memberships (user_id, board_id, role) VALUES (?,?,'usuario')", uid, board["id"])


@route("POST", "/api/auth/register")
def register(req):
    auth.rate_limit("register", req.ip)
    email = (req.arg("email") or "").lower()
    pw, name = req.arg("password") or "", req.arg("name") or ""
    _validate_account(email, pw, name)
    existing = q1("SELECT * FROM users WHERE email=?", email)
    if existing and existing["password_hash"]:
        raise ApiError("email_taken", 409)
    lang = req.arg("lang") if req.arg("lang") in ("es", "en") else req.board["language"]
    if existing:  # created earlier through a magic link: set the password
        ex("UPDATE users SET password_hash=?, name=? WHERE id=?", auth.hash_password(pw), name, existing["id"])
        uid = existing["id"]
    else:
        uid = ex("INSERT INTO users (email, password_hash, name, lang, created_at) VALUES (?,?,?,?,?)",
                 email, auth.hash_password(pw), name, lang, now())
    _ensure_membership(uid, req.board)
    user = q1("SELECT * FROM users WHERE id=?", uid)
    if not user["email_verified"]:
        auth.send_token(user, "verify", req.board)
    req.set_cookie = (auth.create_session(uid), auth.SESSION_DAYS * 86400)
    return {"ok": True}


@route("POST", "/api/auth/login")
def login(req):
    auth.rate_limit("login", req.ip)
    user = q1("SELECT * FROM users WHERE email=?", (req.arg("email") or "").lower())
    if not user or not auth.check_password(req.arg("password") or "", user["password_hash"]):
        raise ApiError("invalid_credentials", 401)
    _ensure_membership(user["id"], req.board)
    req.set_cookie = (auth.create_session(user["id"]), auth.SESSION_DAYS * 86400)
    return {"ok": True}


@route("POST", "/api/auth/magic")
def magic(req):
    auth.rate_limit("magic", req.ip)
    email = (req.arg("email") or "").lower()
    user = q1("SELECT * FROM users WHERE email=?", email)
    if not user:
        name = req.arg("name") or email.split("@")[0]
        _validate_account(email, "", name, need_pw=False)
        uid = ex("INSERT INTO users (email, name, lang, created_at) VALUES (?,?,?,?)",
                 email, name, req.arg("lang") if req.arg("lang") in ("es", "en") else req.board["language"], now())
        user = q1("SELECT * FROM users WHERE id=?", uid)
    _ensure_membership(user["id"], req.board)
    auth.send_token(user, "magic", req.board)
    return {"ok": True}


@route("POST", "/api/auth/consume")
def consume(req):
    uid = auth.consume_token(req.arg("token"))
    _ensure_membership(uid, req.board)
    req.set_cookie = (auth.create_session(uid), auth.SESSION_DAYS * 86400)
    return {"ok": True}


@route("POST", "/api/auth/resend", "user")
def resend(req):
    auth.rate_limit("magic", req.ip)
    if req.user["email_verified"]:
        return {"ok": True}
    auth.send_token(req.user, "verify", req.board)
    return {"ok": True}


@route("POST", "/api/auth/logout")
def logout(req):
    if req.token:
        auth.destroy_session(req.token)
    req.set_cookie = ("", 0)
    return {"ok": True}


@route("PATCH", "/api/me", "user")
def update_me(req):
    u = req.user
    name = req.arg("name") or u["name"]
    lang = req.arg("lang") if req.arg("lang") in ("es", "en") else u["lang"]
    prefs = json.loads(u["notif_prefs"] or "{}")
    for k, v in (req.body.get("prefs") or {}).items():
        if k in mail.PREF_TYPES:
            prefs[k] = bool(v)
    ex("UPDATE users SET name=?, lang=?, notif_prefs=? WHERE id=?", name[:80], lang, json.dumps(prefs), u["id"])
    return {"ok": True}


@route("GET", "/api/me/activity", "user")
def my_activity(req):
    ideas = [{"id": i["id"], "title": i["title"], "type": i["type"], "status": i["status"], "created_at": i["created_at"]}
             for i in q("SELECT * FROM ideas WHERE author_id=? AND board_id=? AND merged_into IS NULL ORDER BY created_at DESC",
                        req.uid, req.board["id"])]
    votes = [dict(r) for r in q("""SELECT v.value, v.created_at, i.id AS idea_id, i.title, i.type, i.status, c.number AS cycle_number
                                    FROM votes v JOIN ideas i ON i.id=v.idea_id JOIN cycles c ON c.id=v.cycle_id
                                    WHERE v.user_id=? AND i.board_id=? ORDER BY v.created_at DESC LIMIT 200""",
                                 req.uid, req.board["id"])]
    return {"ideas": ideas, "votes": votes}


# ---------------------------------------------------------------- ideas

@route("GET", "/api/ideas")
def list_ideas(req):
    b = req.board
    cycle = core.active_cycle(b["id"])
    tab = req.query.get("tab", "comunidad")
    hidden_sql = "" if req.admin else " AND hidden=0"
    if tab == "comunidad":
        rows = core.ranking(b["id"], cycle["id"]) if cycle else []
        if req.admin and cycle:
            rows = list(rows) + list(q("SELECT * FROM ideas WHERE board_id=? AND type='C' AND status='en_votacion' AND hidden=1 AND merged_into IS NULL",
                                       b["id"]))
        rows = text_filter(rows, req)
        if req.query.get("sort") == "recientes":
            rows = sorted(rows, key=lambda r: -r["created_at"])
        ranked = {r["id"]: n for n, r in enumerate(core.ranking(b["id"], cycle["id"]) if cycle else [], start=1)}
        items = [serialize_idea(req, r, cycle, rank=ranked.get(r["id"])) for r in rows]
    elif tab == "equipo":
        rows = text_filter(q("""SELECT * FROM ideas WHERE board_id=? AND type IN ('A','B') AND status='en_votacion'
                                AND merged_into IS NULL""" + hidden_sql + " ORDER BY created_at DESC", b["id"]), req)
        items = [serialize_idea(req, r, cycle) for r in rows]
    elif tab == "nofinalistas":
        rows = text_filter(q("""SELECT * FROM ideas WHERE board_id=? AND type='C' AND status IN ('no_finalista','reclamada')
                                AND merged_into IS NULL""" + hidden_sql + " ORDER BY status='reclamada' DESC, created_at DESC",
                             b["id"]), req)
        items = [serialize_idea(req, r, cycle) for r in rows]
    else:
        raise ApiError("invalid_tab")
    return {"items": items, "cycle": core.cycle_public(core.current_cycle(b["id"]))}


@route("GET", "/api/ideas/similar")
def similar(req):
    return {"items": core.similar(req.board["id"], req.query.get("q", ""))}


@route("GET", r"/api/ideas/(\d+)")
def idea_detail(req, idea_id):
    idea = get_idea(req, idea_id)
    return serialize_idea(req, idea, core.active_cycle(req.board["id"]), detail=True)


@route("POST", "/api/ideas", "user")
def create_idea(req):
    require_verified(req)
    auth.rate_limit("post", req.uid)
    b = req.board
    cycle = core.active_cycle(b["id"])
    if not cycle:
        raise ApiError("no_active_cycle", 409)
    kind = req.arg("type") or "C"
    if kind not in ("A", "B", "C") or (kind != "C" and not req.admin):
        raise ApiError("forbidden", 403)
    title, desc, cat = req.arg("title") or "", req.arg("description") or "", req.arg("category") or None
    if not 5 <= len(title) <= 120:
        raise ApiError("invalid_title")
    if len(desc) > 4000:
        raise ApiError("description_too_long")
    if cat and cat not in core.settings(b)["categories"]:
        raise ApiError("invalid_category")
    t = now()
    iid = ex("""INSERT INTO ideas (board_id, type, author_id, title, description, category, status, current_cycle_id,
                score_changed_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)""",
             b["id"], kind, req.uid, title, desc, cat, "en_votacion", cycle["id"], t, t)
    ex("INSERT INTO status_changes (idea_id, from_status, to_status, user_id, created_at) VALUES (?,?,?,?,?)",
       iid, None, "en_votacion", req.uid, t)
    core.follow(req.uid, iid)
    if kind == "B":  # confirmed: goes to the roadmap no matter what
        ex("INSERT INTO roadmap_items (idea_id, period, status, cycle_won_id, created_at) VALUES (?,?,?,?,?)",
           iid, core.period_for(b, cycle["starts_at"], cycle["kind"]), "planificada", cycle["id"], t)
    return {"id": iid}


@route("POST", r"/api/ideas/(\d+)/vote", "user")
def vote(req, idea_id):
    auth.rate_limit("vote", "%s|%s" % (req.uid, req.ip))
    idea = get_idea(req, idea_id)
    core.cast_vote(req.board, req.user, idea, req.body.get("value") or None, req.arg("reason"))
    idea = get_idea(req, idea_id)
    return serialize_idea(req, idea, core.active_cycle(req.board["id"]))


@route("POST", r"/api/ideas/(\d+)/comments", "user")
def comment(req, idea_id):
    require_verified(req)
    auth.rate_limit("comment", req.uid)
    idea = get_idea(req, idea_id)
    body = req.arg("body") or ""
    if not 1 <= len(body) <= 2000:
        raise ApiError("invalid_comment")
    official = 1 if req.admin else 0
    ex("INSERT INTO comments (idea_id, user_id, body, is_official, created_at) VALUES (?,?,?,?,?)",
       idea_id, req.uid, body, official, now())
    core.follow(req.uid, idea_id)
    link = mail.link("/idea/%d" % idea_id)
    snippet = body if len(body) < 400 else body[:400] + "…"
    if official:
        mail.notify(core.interested_ids(idea), "official_reply", idea_id, exclude={req.uid},
                    title=idea["title"], text=snippet, link=link)
    elif idea["author_id"] != req.uid:
        mail.notify([idea["author_id"]], "comment_on_idea", idea_id, actor=req.user["name"],
                    title=idea["title"], text=snippet, link=link)
    return {"ok": True}


@route("POST", r"/api/ideas/(\d+)/follow", "user")
def follow(req, idea_id):
    get_idea(req, idea_id)
    if req.body.get("follow", True):
        core.follow(req.uid, idea_id)
    else:
        ex("DELETE FROM follows WHERE user_id=? AND idea_id=?", req.uid, idea_id)
    return {"ok": True}


@route("POST", r"/api/ideas/(\d+)/claim", "user")
def claim(req, idea_id):
    core.claim(req.board, req.user, get_idea(req, idea_id))
    return serialize_idea(req, get_idea(req, idea_id), core.active_cycle(req.board["id"]))


@route("POST", r"/api/ideas/(\d+)/support", "user")
def support(req, idea_id):
    core.support(req.board, req.user, get_idea(req, idea_id))
    return serialize_idea(req, get_idea(req, idea_id), core.active_cycle(req.board["id"]))


@route("POST", "/api/reports", "user")
def report(req):
    require_verified(req)
    auth.rate_limit("report", req.uid)
    otype, oid, reason = req.arg("object_type"), req.body.get("object_id"), req.arg("reason") or ""
    if otype == "idea":
        obj = get_idea(req, int(oid))
        text = obj["title"]
    elif otype == "comment":
        obj = q1("SELECT c.* FROM comments c JOIN ideas i ON i.id=c.idea_id WHERE c.id=? AND i.board_id=?",
                 int(oid), req.board["id"])
        if not obj:
            raise ApiError("not_found", 404)
        text = obj["body"][:200]
    else:
        raise ApiError("invalid_report")
    if not 3 <= len(reason) <= 500:
        raise ApiError("invalid_reason")
    ex("INSERT INTO reports (object_type, object_id, user_id, reason, created_at) VALUES (?,?,?,?,?)",
       otype, int(oid), req.uid, reason, now())
    mail.notify(core.admin_ids(req.board["id"]), "new_report", actor=req.user["name"],
                object=lambda l: {"idea": "idea", "comment": "comentario" if l == "es" else "comment"}[otype],
                text=text, reason=reason, board=req.board["name"], link=mail.link("/admin/moderacion"))
    return {"ok": True}


# ---------------------------------------------------------------- finalists / roadmap

PUBLIC_FINAL_STATE = {"finalista": "en_evaluacion", "pospuesta": "en_evaluacion", "aceptada": "aceptada",
                      "en_roadmap": "aceptada", "lanzada": "aceptada", "rechazada": "rechazada"}


@route("GET", "/api/finalists")
def finalists(req):
    groups = []
    for c in q("SELECT * FROM cycles WHERE board_id=? AND status='cerrado' ORDER BY number DESC", req.board["id"]):
        items = []
        for e in q("""SELECT e.*, i.title, i.status, i.reject_reason, i.hidden, i.merged_into FROM idea_cycle_entries e
                      JOIN ideas i ON i.id=e.idea_id WHERE e.cycle_id=? AND e.result='finalista' ORDER BY e.position""", c["id"]):
            if e["hidden"] and not req.admin and not e["merged_into"]:
                continue
            item = core.roadmap_item(e["idea_id"])
            items.append({"id": e["idea_id"], "title": e["title"], "position": e["position"], "score": e["score_final"],
                          "up": e["up"], "down": e["down"],
                          "state": PUBLIC_FINAL_STATE.get(e["status"], "en_evaluacion"),
                          "reason": e["reject_reason"] if e["status"] == "rechazada" else None,
                          "roadmap": {"status": item["status"], "period": item["period"]} if item else None})
        groups.append({"cycle": core.cycle_public(c), "items": items})
    return {"groups": groups}


@route("GET", "/api/roadmap")
def roadmap(req):
    f = {k: req.query.get(k) for k in ("origin", "status", "period")}
    f["include_hidden"] = req.admin
    rows = core.roadmap_rows(req.board, f)
    cycle = core.active_cycle(req.board["id"])
    s = core.settings(req.board)
    for r in rows:
        if r["type"] == "B":
            idea = q1("SELECT * FROM ideas WHERE id=?", r["idea_id"])
            my = q1("SELECT value FROM votes WHERE user_id=? AND idea_id=? AND cycle_id=?",
                    req.uid or -1, idea["id"], idea["current_cycle_id"])
            r["my_vote"] = my["value"] if my else None
            r["can_vote"] = core.can_vote_idea(idea, cycle)
            if req.admin or s["b_public_counts"]:
                r["counts"] = core.idea_stats(idea)
    periods = sorted({r["period"] for r in core.roadmap_rows(req.board, {"include_hidden": req.admin})})
    return {"items": rows, "periods": periods}


# ---------------------------------------------------------------- admin

@route("GET", "/api/admin/dashboard", "admin")
def dashboard(req):
    b = req.board
    cycle = core.active_cycle(b["id"])
    out = {"cycle": core.cycle_public(cycle or core.current_cycle(b["id"])),
           "reports_pending": val("SELECT COUNT(*) FROM reports WHERE status='pendiente'"),
           "prioritization_pending": len([r for r in core.prioritization_rows(b) if r["status"] != "pospuesta"]),
           "users": val("SELECT COUNT(*) FROM memberships WHERE board_id=?", b["id"])}
    if not cycle:
        return out
    cid, start = cycle["id"], cycle["starts_at"]
    out["new_ideas"] = val("SELECT COUNT(*) FROM ideas WHERE board_id=? AND created_at>=?", b["id"], start)
    out["votes"] = val("SELECT COUNT(*) FROM votes WHERE cycle_id=?", cid)
    out["participants"] = val("""SELECT COUNT(*) FROM (
            SELECT user_id FROM votes WHERE cycle_id=?
            UNION SELECT author_id FROM ideas WHERE board_id=? AND created_at>=?
            UNION SELECT c.user_id FROM comments c JOIN ideas i ON i.id=c.idea_id WHERE i.board_id=? AND c.created_at>=?)""",
                              cid, b["id"], start, b["id"], start)
    out["top"] = [{"id": r["id"], "title": r["title"], "up": r["up"], "down": r["down"], "score": r["score"]}
                  for r in core.ranking(b["id"], cid)[:5]]
    a_list = []
    for i in q("SELECT * FROM ideas WHERE board_id=? AND type='A' AND status='en_votacion' AND current_cycle_id=?", b["id"], cid):
        st = core.idea_stats(i)
        ok = core.a_is_validated(st, cycle)
        near = not ok and (st["pct_importante"] >= cycle["a_threshold_pct"] - 15 or
                           st["responses"] >= cycle["a_min_responses"] - 3)
        a_list.append({"id": i["id"], "title": i["title"], "stats": st, "validated": ok, "near": near})
    out["a_ideas"] = sorted(a_list, key=lambda x: -x["stats"]["pct_importante"])
    out["threshold"] = {"pct": cycle["a_threshold_pct"], "min": cycle["a_min_responses"], "b_alert": cycle["b_alert_pct"]}
    alerts = []
    for i in q("SELECT * FROM ideas WHERE board_id=? AND type='B' AND status IN ('en_votacion','en_roadmap') AND merged_into IS NULL",
               b["id"]):
        st = core.idea_stats(i)
        c = q1("SELECT b_alert_pct FROM cycles WHERE id=?", i["current_cycle_id"])
        if st["responses"] >= core.B_ALERT_MIN_RESPONSES and st["pct_no_importante"] > (c["b_alert_pct"] if c else 50):
            alerts.append({"id": i["id"], "title": i["title"], "stats": st})
    out["b_alerts"] = alerts
    return out


@route("GET", "/api/admin/team", "admin")
def team_ideas(req):
    items = []
    for i in q("""SELECT * FROM ideas WHERE board_id=? AND type IN ('A','B') AND merged_into IS NULL
                  ORDER BY status='en_votacion' DESC, created_at DESC""", req.board["id"]):
        d = serialize_idea(req, i, core.active_cycle(req.board["id"]))
        if i["type"] == "A" and i["current_cycle_id"]:
            c = q1("SELECT * FROM cycles WHERE id=?", i["current_cycle_id"])
            d["threshold"] = {"pct": c["a_threshold_pct"], "min": c["a_min_responses"],
                              "validated": core.a_is_validated(d["counts"], c)}
        d["all_comments"] = val("SELECT COUNT(*) FROM comments WHERE idea_id=?", i["id"])
        items.append(d)
    return {"items": items}


@route("POST", r"/api/admin/ideas/(\d+)/relaunch", "admin")
def relaunch(req, idea_id):
    idea = get_idea(req, idea_id)
    cycle = core.active_cycle(req.board["id"])
    if idea["status"] != "no_validada" or not cycle:
        raise ApiError("cannot_relaunch", 409)
    core.set_status(idea, "en_votacion", req.uid, current_cycle_id=cycle["id"], score_changed_at=now())
    return {"ok": True}


@route("POST", r"/api/admin/ideas/(\d+)/archive", "admin")
def archive(req, idea_id):
    idea = get_idea(req, idea_id)
    core.set_status(idea, "archivada", req.uid)
    return {"ok": True}


@route("PATCH", r"/api/admin/ideas/(\d+)", "admin")
def edit_idea(req, idea_id):
    idea = get_idea(req, idea_id)
    fields = {}
    if "title" in req.body:
        if not 5 <= len(req.arg("title")) <= 120:
            raise ApiError("invalid_title")
        fields["title"] = req.arg("title")
    if "description" in req.body:
        fields["description"] = (req.arg("description") or "")[:4000]
    if "category" in req.body:
        fields["category"] = req.arg("category") or None
    if "hidden" in req.body:
        fields["hidden"] = 1 if req.body["hidden"] else 0
    if fields:
        ex("UPDATE ideas SET %s WHERE id=?" % ", ".join("%s=?" % k for k in fields), *fields.values(), idea["id"])
    return {"ok": True}


@route("DELETE", r"/api/admin/ideas/(\d+)", "admin")
def delete_idea(req, idea_id):
    get_idea(req, idea_id)
    ex("UPDATE ideas SET merged_into=NULL WHERE merged_into=?", idea_id)
    ex("DELETE FROM reports WHERE object_type='idea' AND object_id=?", idea_id)
    ex("DELETE FROM ideas WHERE id=?", idea_id)
    return {"ok": True}


@route("POST", r"/api/admin/ideas/(\d+)/merge", "admin")
def merge(req, idea_id):
    source = get_idea(req, idea_id)
    target = get_idea(req, int(req.body.get("target_id") or 0))
    core.merge(source, target)
    return {"ok": True, "target_id": target["id"]}


@route("PATCH", r"/api/admin/comments/(\d+)", "admin")
def edit_comment(req, cid):
    c = q1("SELECT c.* FROM comments c JOIN ideas i ON i.id=c.idea_id WHERE c.id=? AND i.board_id=?", cid, req.board["id"])
    if not c:
        raise ApiError("not_found", 404)
    if "hidden" in req.body:
        ex("UPDATE comments SET hidden=? WHERE id=?", 1 if req.body["hidden"] else 0, cid)
    if req.arg("body"):
        ex("UPDATE comments SET body=? WHERE id=?", req.arg("body")[:2000], cid)
    return {"ok": True}


@route("DELETE", r"/api/admin/comments/(\d+)", "admin")
def delete_comment(req, cid):
    ex("DELETE FROM reports WHERE object_type='comment' AND object_id=?", cid)
    ex("DELETE FROM comments WHERE id=? AND idea_id IN (SELECT id FROM ideas WHERE board_id=?)", cid, req.board["id"])
    return {"ok": True}


@route("GET", "/api/admin/moderation", "admin")
def moderation(req):
    reports = []
    for r in q("SELECT r.*, u.name AS reporter FROM reports r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.status='pendiente' DESC, r.created_at DESC LIMIT 200"):
        d = dict(r)
        if r["object_type"] == "idea":
            o = q1("SELECT id, title, hidden FROM ideas WHERE id=?", r["object_id"])
            d["object"] = {"idea_id": o["id"], "text": o["title"], "hidden": bool(o["hidden"])} if o else None
        else:
            o = q1("SELECT id, idea_id, body, hidden FROM comments WHERE id=?", r["object_id"])
            d["object"] = {"idea_id": o["idea_id"], "text": o["body"], "hidden": bool(o["hidden"])} if o else None
        reports.append(d)
    ideas = [{"id": i["id"], "title": i["title"], "type": i["type"], "status": i["status"], "hidden": bool(i["hidden"]),
              "category": i["category"], "description": i["description"], "author": user_name(i["author_id"]),
              "created_at": i["created_at"]}
             for i in q("SELECT * FROM ideas WHERE board_id=? AND merged_into IS NULL ORDER BY created_at DESC LIMIT 300",
                        req.board["id"])]
    hidden_comments = [dict(c) for c in q("""SELECT c.id, c.idea_id, c.body, u.name AS author FROM comments c
                                            JOIN ideas i ON i.id=c.idea_id LEFT JOIN users u ON u.id=c.user_id
                                            WHERE i.board_id=? AND c.hidden=1""", req.board["id"])]
    return {"reports": reports, "ideas": ideas, "hidden_comments": hidden_comments}


@route("POST", r"/api/admin/reports/(\d+)", "admin")
def update_report(req, rid):
    status = req.arg("status")
    if status not in ("pendiente", "resuelto", "descartado"):
        raise ApiError("invalid_status")
    ex("UPDATE reports SET status=? WHERE id=?", status, rid)
    return {"ok": True}


@route("GET", "/api/admin/close-preview", "admin")
def close_preview(req):
    cycle = core.active_cycle(req.board["id"])
    if not cycle:
        return {"cycle": core.cycle_public(core.current_cycle(req.board["id"])), "inactive": True}
    return core.close_preview(req.board, cycle)


@route("POST", "/api/admin/close-cycle", "admin")
def close_cycle(req):
    cycle = core.active_cycle(req.board["id"])
    if not cycle:
        raise ApiError("cycle_not_active", 409)
    return core.close_cycle(req.board, cycle, req.uid)


@route("PATCH", "/api/admin/cycle", "admin")
def edit_cycle(req):
    """Change the end date of the running cycle, or the start of a scheduled one."""
    c = core.current_cycle(req.board["id"])
    if not c:
        raise ApiError("not_found", 404)
    zone = core.tz(req.board)
    parse = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M").replace(tzinfo=zone).timestamp()
    try:
        if req.arg("ends_at"):
            ends = parse(req.arg("ends_at"))
            if ends <= max(now(), c["starts_at"]):
                raise ApiError("invalid_date")
            ex("UPDATE cycles SET ends_at=?, reminder_sent=0 WHERE id=?", ends, c["id"])
        if req.arg("starts_at") and c["status"] == "programado":
            st = parse(req.arg("starts_at"))
            ex("UPDATE cycles SET starts_at=?, ends_at=? WHERE id=?", st, core.cycle_end(req.board, st, c["kind"]), c["id"])
    except ValueError:
        raise ApiError("invalid_date")
    return {"ok": True}


@route("GET", "/api/admin/prioritization", "admin")
def prioritization(req):
    rows = core.prioritization_rows(req.board)
    decided = [dict(r) for r in q("""SELECT i.id, i.title, i.type, i.status, p.decision, p.reason, p.decided_at
                                     FROM prioritizations p JOIN ideas i ON i.id=p.idea_id
                                     WHERE i.board_id=? AND p.decision IN ('aceptada','rechazada')
                                     ORDER BY p.decided_at DESC LIMIT 50""", req.board["id"])]
    cyc = core.active_cycle(req.board["id"])
    default_period = core.period_for(req.board, cyc["starts_at"] if cyc else now(), core.settings(req.board)["cycle"]["kind"])
    return {"rows": rows, "decided": decided, "default_period": default_period}


@route("PATCH", r"/api/admin/prioritization/(\d+)", "admin")
def edit_prioritization(req, idea_id):
    fields = {}
    for k in ("impact", "effort", "revenue", "criticality"):
        if k in req.body:
            v = req.body[k]
            if v in (None, ""):
                fields[k] = None
            else:
                v = int(v)
                if not 1 <= v <= 5:
                    raise ApiError("invalid_scale")
                fields[k] = v
    if fields:
        ex("UPDATE prioritizations SET %s WHERE idea_id=?" % ", ".join("%s=?" % k for k in fields), *fields.values(), idea_id)
    return {"ok": True}


@route("POST", r"/api/admin/prioritization/(\d+)/decide", "admin")
def decide(req, idea_id):
    core.decide(req.board, req.user, get_idea(req, idea_id), req.arg("decision"), req.arg("reason"), req.arg("period"))
    return {"ok": True}


@route("PATCH", r"/api/admin/roadmap/(\d+)", "admin")
def edit_roadmap(req, item_id):
    item = q1("SELECT r.* FROM roadmap_items r JOIN ideas i ON i.id=r.idea_id WHERE r.id=? AND i.board_id=?",
              item_id, req.board["id"])
    if not item:
        raise ApiError("not_found", 404)
    period = req.arg("period")
    if period and not re.match(r"^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$", period):
        raise ApiError("invalid_period")
    core.update_roadmap(req.board, req.user, item, req.arg("status"), period)
    return {"ok": True}


@route("GET", "/api/admin/settings", "admin")
def get_settings(req):
    b = req.board
    return {"name": b["name"], "slug": b["slug"], "logo_url": b["logo_url"], "language": b["language"],
            "timezone": b["timezone"], "settings": core.settings(b),
            "cycle": core.cycle_public(core.current_cycle(b["id"])),
            "base_url": mail.BASE_URL}


@route("PATCH", "/api/admin/settings", "admin")
def patch_settings(req):
    b = req.board
    s = core.settings(b)
    name = req.arg("name") or b["name"]
    slug = _slugify(req.arg("slug") or b["slug"])
    lang = req.arg("language") if req.arg("language") in ("es", "en") else b["language"]
    tzname = req.arg("timezone") or b["timezone"]
    _check_tz(tzname)
    logo = req.arg("logo_url") if "logo_url" in req.body else b["logo_url"]
    cyc = req.body.get("cycle") or {}
    ints = {"top_n": (1, 50), "supports_required": (1, 1000), "cycles_to_archive": (1, 24),
            "a_min_responses": (1, 100000), "a_threshold_pct": (0, 100), "b_alert_pct": (0, 100)}
    for k, (lo, hi) in ints.items():
        if k in cyc:
            v = float(cyc[k]) if k.endswith("pct") else int(cyc[k])
            if not lo <= v <= hi:
                raise ApiError("invalid_setting", field=k)
            s["cycle"][k] = v
    if cyc.get("kind") in ("mensual", "trimestral"):
        s["cycle"]["kind"] = cyc["kind"]
    for k in ("c_show_after_vote", "b_public_counts"):
        if k in req.body:
            s[k] = bool(req.body[k])
    if isinstance(req.body.get("categories"), list):
        s["categories"] = [c.strip()[:40] for c in req.body["categories"] if isinstance(c, str) and c.strip()][:30]
    ex("UPDATE boards SET name=?, slug=?, language=?, timezone=?, logo_url=?, settings=? WHERE id=?",
       name, slug, lang, tzname, logo, json.dumps(s), b["id"])
    # The running cycle keeps its rules; a scheduled one takes the new ones.
    sched = q1("SELECT * FROM cycles WHERE board_id=? AND status='programado'", b["id"])
    if sched:
        c = s["cycle"]
        ex("""UPDATE cycles SET kind=?, top_n=?, supports_required=?, cycles_to_archive=?, a_threshold_pct=?,
              a_min_responses=?, b_alert_pct=?, ends_at=? WHERE id=?""",
           c["kind"], c["top_n"], c["supports_required"], c["cycles_to_archive"], c["a_threshold_pct"],
           c["a_min_responses"], c["b_alert_pct"], core.cycle_end(b, sched["starts_at"], c["kind"]), sched["id"])
    return {"ok": True}


# ---------------------------------------------------------------- dev mailbox

@route("GET", "/api/dev/mail")
def dev_mail(req):
    if not DEV:
        raise ApiError("not_found", 404)
    email = (req.query.get("email") or "").lower()
    rows = q("SELECT * FROM notifications WHERE (?='' OR email=?) ORDER BY id DESC LIMIT 100", email, email)
    return {"items": [dict(r) for r in rows]}
