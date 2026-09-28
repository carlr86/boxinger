"""Domain logic: boards, cycles, votes, claims, cycle close, prioritization, roadmap."""
import calendar
import json
import math
import re
import time
import unicodedata
from datetime import datetime, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from .db import q, q1, val, ex
from . import mail


class ApiError(Exception):
    def __init__(self, code, status=400, **extra):
        super().__init__(code)
        self.code, self.status, self.extra = code, status, extra


DEFAULT_SETTINGS = {
    "cycle": {
        "kind": "mensual",
        "top_n": 3,
        "supports_required": 5,
        "cycles_to_archive": 3,
        "a_threshold_pct": 60,
        "a_min_responses": 10,
        "b_alert_pct": 50,
    },
    "c_show_after_vote": False,
    "b_public_counts": False,
    "categories": ["Funcionalidad", "UX / Diseño", "Integraciones", "Rendimiento", "Otro"],
}
B_ALERT_MIN_RESPONSES = 5  # avoid alerting on the very first "No importante"

VOTE_VALUES = {
    "A": ("importante", "deseable", "no_importante"),
    "B": ("importante", "no_importante"),
    "C": ("up", "down"),
}
OPEN_STATUSES_FOR_PRIORITIZATION = ("finalista", "validada", "pospuesta")


def now():
    return time.time()


# ---------------------------------------------------------------- board / time

def get_board():
    return q1("SELECT * FROM boards ORDER BY id LIMIT 1")


def settings(board):
    s = json.loads(json.dumps(DEFAULT_SETTINGS))
    stored = json.loads(board["settings"] or "{}")
    s["cycle"].update(stored.get("cycle", {}))
    for k, v in stored.items():
        if k != "cycle":
            s[k] = v
    return s


def tz(board):
    try:
        return ZoneInfo(board["timezone"]) if ZoneInfo else timezone.utc
    except Exception:
        return timezone.utc


def add_months(dt, n):
    m = dt.month - 1 + n
    y = dt.year + m // 12
    m = m % 12 + 1
    return dt.replace(year=y, month=m, day=min(dt.day, calendar.monthrange(y, m)[1]))


def months_for(kind):
    return 3 if kind == "trimestral" else 1


def local_midnight(board, date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return d.replace(tzinfo=tz(board)).timestamp()


def cycle_end(board, starts_at, kind):
    start = datetime.fromtimestamp(starts_at, tz(board))
    return add_months(start, months_for(kind)).timestamp()


def period_for(board, ts, kind):
    d = datetime.fromtimestamp(ts, tz(board))
    if kind == "trimestral":
        return "%d-Q%d" % (d.year, (d.month - 1) // 3 + 1)
    return "%d-%02d" % (d.year, d.month)


def default_first_start(board):
    """PRD default: first day of next month in the board timezone."""
    d = datetime.now(tz(board))
    nxt = add_months(d.replace(day=1, hour=0, minute=0, second=0, microsecond=0), 1)
    return nxt.timestamp()


# ---------------------------------------------------------------- cycles

def active_cycle(board_id):
    return q1("SELECT * FROM cycles WHERE board_id=? AND status='activo'", board_id)


def current_cycle(board_id):
    """Active cycle, or the next scheduled one."""
    return active_cycle(board_id) or q1(
        "SELECT * FROM cycles WHERE board_id=? AND status='programado' ORDER BY starts_at LIMIT 1", board_id)


def create_cycle(board, starts_at, status):
    cfg = settings(board)["cycle"]
    number = (val("SELECT MAX(number) FROM cycles WHERE board_id=?", board["id"]) or 0) + 1
    cid = ex("""INSERT INTO cycles (board_id, number, kind, starts_at, ends_at, top_n, supports_required,
                cycles_to_archive, a_threshold_pct, a_min_responses, b_alert_pct, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
             board["id"], number, cfg["kind"], starts_at, cycle_end(board, starts_at, cfg["kind"]),
             int(cfg["top_n"]), int(cfg["supports_required"]), int(cfg["cycles_to_archive"]),
             float(cfg["a_threshold_pct"]), int(cfg["a_min_responses"]), float(cfg["b_alert_pct"]), status)
    return q1("SELECT * FROM cycles WHERE id=?", cid)


def cycle_public(c):
    if not c:
        return None
    return {k: c[k] for k in ("id", "number", "kind", "starts_at", "ends_at", "status", "top_n",
                              "supports_required", "cycles_to_archive")}


# ---------------------------------------------------------------- votes / stats

def raw_counts(idea_id, cycle_id):
    return {r["value"]: r["n"] for r in q(
        "SELECT value, COUNT(*) n FROM votes WHERE idea_id=? AND cycle_id=? GROUP BY value", idea_id, cycle_id)}


def stats(idea_type, counts):
    if idea_type == "C":
        up, down = counts.get("up", 0), counts.get("down", 0)
        return {"up": up, "down": down, "score": up - down}
    imp, no = counts.get("importante", 0), counts.get("no_importante", 0)
    des = counts.get("deseable", 0) if idea_type == "A" else 0
    n = imp + des + no
    s = {"importante": imp, "no_importante": no, "responses": n,
         "pct_importante": round(100.0 * imp / n, 1) if n else 0.0,
         "pct_no_importante": round(100.0 * no / n, 1) if n else 0.0}
    if idea_type == "A":
        s["deseable"] = des
        s["index"] = round((2.0 * imp + des) / n, 2) if n else None
    return s


def idea_stats(idea):
    return stats(idea["type"], raw_counts(idea["id"], idea["current_cycle_id"]))


def a_is_validated(st, cycle):
    return st["responses"] >= cycle["a_min_responses"] and st["pct_importante"] >= cycle["a_threshold_pct"]


def roadmap_item(idea_id):
    return q1("SELECT * FROM roadmap_items WHERE idea_id=?", idea_id)


def can_vote_idea(idea, cycle):
    if idea["hidden"] or idea["merged_into"]:
        return False
    if idea["type"] == "B":
        if idea["status"] == "en_roadmap":
            item = roadmap_item(idea["id"])
            return bool(item and item["status"] != "lanzada")
        return idea["status"] == "en_votacion" and bool(cycle) and idea["current_cycle_id"] == cycle["id"]
    return idea["status"] == "en_votacion" and bool(cycle) and idea["current_cycle_id"] == cycle["id"]


def cast_vote(board, user, idea, value, reason=None):
    cycle = active_cycle(board["id"])
    if not user["email_verified"]:
        raise ApiError("email_not_verified", 403)
    if not can_vote_idea(idea, cycle):
        raise ApiError("voting_closed", 409)
    if idea["type"] == "C" and idea["author_id"] == user["id"]:
        raise ApiError("cannot_vote_own_idea", 403)
    if value is not None and value not in VOTE_VALUES[idea["type"]]:
        raise ApiError("invalid_vote")
    cycle_id = idea["current_cycle_id"]
    before = idea_stats(idea)
    if value is None:
        ex("DELETE FROM votes WHERE user_id=? AND idea_id=? AND cycle_id=?", user["id"], idea["id"], cycle_id)
    else:
        reason = (reason or "").strip()[:500] if value == "down" else None
        ex("""INSERT INTO votes (user_id, idea_id, cycle_id, value, reason, created_at) VALUES (?,?,?,?,?,?)
              ON CONFLICT(user_id, idea_id, cycle_id) DO UPDATE SET value=excluded.value, reason=excluded.reason,
              created_at=excluded.created_at""", user["id"], idea["id"], cycle_id, value, reason or None, now())
    after = idea_stats(idea)
    if idea["type"] == "C" and after["score"] != before["score"]:
        # Tie-break: the idea that reached its score first ranks higher.
        ex("UPDATE ideas SET score_changed_at=? WHERE id=?", now(), idea["id"])
    if idea["type"] == "B":
        check_b_alert(board, idea, after, cycle)
    return after


def check_b_alert(board, idea, st, cycle):
    if idea["b_alert_sent"] or st["responses"] < B_ALERT_MIN_RESPONSES:
        return
    c = q1("SELECT * FROM cycles WHERE id=?", idea["current_cycle_id"]) or cycle
    threshold = c["b_alert_pct"] if c else settings(board)["cycle"]["b_alert_pct"]
    if st["pct_no_importante"] > threshold:
        ex("UPDATE ideas SET b_alert_sent=1 WHERE id=?", idea["id"])
        mail.notify(admin_ids(board["id"]), "b_alert", idea["id"], title=idea["title"],
                    pct=st["pct_no_importante"], n=st["responses"], link=mail.link("/admin/equipo"))


# ---------------------------------------------------------------- people

def admin_ids(board_id):
    return [r["user_id"] for r in q("SELECT user_id FROM memberships WHERE board_id=? AND role='admin'", board_id)]


def board_user_ids(board_id):
    return [r["user_id"] for r in q("SELECT user_id FROM memberships WHERE board_id=?", board_id)]


def interested_ids(idea):
    """Author, voters (any cycle) and followers."""
    ids = [idea["author_id"]]
    ids += [r["user_id"] for r in q("SELECT DISTINCT user_id FROM votes WHERE idea_id=?", idea["id"])]
    ids += [r["user_id"] for r in q("SELECT user_id FROM follows WHERE idea_id=?", idea["id"])]
    return ids


def follow(user_id, idea_id):
    ex("INSERT OR IGNORE INTO follows (user_id, idea_id) VALUES (?,?)", user_id, idea_id)


# ---------------------------------------------------------------- status

def set_status(idea, new_status, actor_id=None, notify=True, extra=None, **fields):
    old = idea["status"]
    sets = ["status=?"] + ["%s=?" % k for k in fields]
    ex("UPDATE ideas SET %s WHERE id=?" % ", ".join(sets), new_status, *fields.values(), idea["id"])
    ex("INSERT INTO status_changes (idea_id, from_status, to_status, user_id, created_at) VALUES (?,?,?,?,?)",
       idea["id"], old, new_status, actor_id, now())
    if notify and old != new_status:
        notify_status(idea, new_status, actor_id, extra)


def notify_status(idea, label_status, actor_id=None, extra=None):
    mail.notify(interested_ids(idea), "status_change", idea["id"], exclude={actor_id},
                title=idea["title"], status=lambda l: mail.status_label(label_status, l),
                extra=(lambda l: extra(l)) if callable(extra) else (extra or ""),
                link=mail.link("/idea/%d" % idea["id"]))


# ---------------------------------------------------------------- ranking

def ranking(board_id, cycle_id):
    return q("""
        SELECT i.*, COALESCE(SUM(v.value='up'),0) AS up, COALESCE(SUM(v.value='down'),0) AS down,
               COALESCE(SUM(v.value='up'),0) - COALESCE(SUM(v.value='down'),0) AS score
        FROM ideas i LEFT JOIN votes v ON v.idea_id=i.id AND v.cycle_id=i.current_cycle_id
        WHERE i.board_id=? AND i.type='C' AND i.status='en_votacion' AND i.current_cycle_id=?
              AND i.hidden=0 AND i.merged_into IS NULL
        GROUP BY i.id
        ORDER BY score DESC, i.score_changed_at ASC, i.id ASC""", board_id, cycle_id)


# ---------------------------------------------------------------- claims

def open_claim(idea_id):
    return q1("SELECT * FROM claims WHERE idea_id=? AND status='abierto' ORDER BY id DESC LIMIT 1", idea_id)


def claim_info(idea_id, viewer_id=None):
    c = open_claim(idea_id)
    if not c:
        return None
    n = val("SELECT COUNT(*) FROM claim_supports WHERE claim_id=?", c["id"])
    return {"id": c["id"], "supports": n, "required": c["supports_required"],
            "missing": max(0, c["supports_required"] - n),
            "supported": bool(viewer_id and val("SELECT 1 FROM claim_supports WHERE claim_id=? AND user_id=?",
                                                c["id"], viewer_id)),
            "started_by": val("SELECT name FROM users WHERE id=?", c["started_by"])}


def claim(board, user, idea):
    cycle = active_cycle(board["id"])
    if not user["email_verified"]:
        raise ApiError("email_not_verified", 403)
    if idea["type"] != "C" or idea["status"] != "no_finalista" or idea["hidden"] or not cycle:
        raise ApiError("cannot_claim", 409)
    cid = ex("INSERT INTO claims (idea_id, started_by, cycle_id, supports_required, status, created_at) VALUES (?,?,?,?,?,?)",
             idea["id"], user["id"], cycle["id"], cycle["supports_required"], "abierto", now())
    set_status(idea, "reclamada", user["id"], notify=False)
    _add_support(board, cid, user["id"], idea)


def support(board, user, idea):
    if not user["email_verified"]:
        raise ApiError("email_not_verified", 403)
    c = open_claim(idea["id"])
    if idea["status"] != "reclamada" or not c:
        raise ApiError("cannot_support", 409)
    if val("SELECT 1 FROM claim_supports WHERE claim_id=? AND user_id=?", c["id"], user["id"]):
        raise ApiError("already_supported", 409)
    _add_support(board, c["id"], user["id"], idea)


def _add_support(board, claim_id, user_id, idea):
    ex("INSERT INTO claim_supports (claim_id, user_id, created_at) VALUES (?,?,?)", claim_id, user_id, now())
    follow(user_id, idea["id"])
    c = q1("SELECT * FROM claims WHERE id=?", claim_id)
    n = val("SELECT COUNT(*) FROM claim_supports WHERE claim_id=?", claim_id)
    if n >= c["supports_required"]:
        cycle = active_cycle(board["id"])
        ex("UPDATE claims SET status='cumplido' WHERE id=?", claim_id)
        # Back to voting in the running cycle; votes start from zero (keyed by cycle).
        ex("DELETE FROM votes WHERE idea_id=? AND cycle_id=?", idea["id"], cycle["id"])
        set_status(q1("SELECT * FROM ideas WHERE id=?", idea["id"]), "en_votacion", user_id, notify=False,
                   current_cycle_id=cycle["id"], score_changed_at=now(), cycles_without_claim=0)
        supporters = [r["user_id"] for r in q("SELECT user_id FROM claim_supports WHERE claim_id=?", claim_id)]
        mail.notify(supporters + [idea["author_id"]], "claim_back", idea["id"], title=idea["title"],
                    link=mail.link("/idea/%d" % idea["id"]))


# ---------------------------------------------------------------- cycle close

def close_preview(board, cycle):
    rank = ranking(board["id"], cycle["id"])
    top = [dict(r) for r in rank[:cycle["top_n"]]]
    rest = [dict(r) for r in rank[cycle["top_n"]:]]
    a_ideas = []
    for i in q("""SELECT * FROM ideas WHERE board_id=? AND type='A' AND status='en_votacion'
                  AND current_cycle_id=? AND merged_into IS NULL""", board["id"], cycle["id"]):
        st = idea_stats(i)
        a_ideas.append({"id": i["id"], "title": i["title"], "stats": st, "validated": a_is_validated(st, cycle)})
    b_ideas = [{"id": i["id"], "title": i["title"], "stats": idea_stats(i)} for i in q(
        """SELECT * FROM ideas WHERE board_id=? AND type='B' AND current_cycle_id=? AND merged_into IS NULL""",
        board["id"], cycle["id"])]
    expiring = [{"id": r["id"], "title": r["title"]} for r in q(
        """SELECT i.* FROM ideas i JOIN claims c ON c.idea_id=i.id AND c.status='abierto'
           WHERE i.board_id=? AND i.status='reclamada'""", board["id"])]
    to_archive = [{"id": r["id"], "title": r["title"]} for r in q(
        """SELECT * FROM ideas WHERE board_id=? AND type='C' AND status='no_finalista'
           AND cycles_without_claim + 1 >= ?""", board["id"], cycle["cycles_to_archive"])]
    strip = lambda r: {"id": r["id"], "title": r["title"], "up": r["up"], "down": r["down"], "score": r["score"]}
    return {"cycle": cycle_public(cycle), "finalists": [strip(r) for r in top],
            "non_finalists": [strip(r) for r in rest], "a_ideas": a_ideas, "b_ideas": b_ideas,
            "expiring_claims": expiring, "to_archive": to_archive}


def close_cycle(board, cycle, actor_id=None):
    if cycle["status"] != "activo":
        raise ApiError("cycle_not_active", 409)
    t = now()
    ex("UPDATE cycles SET status='cerrado', closed_at=? WHERE id=?", t, cycle["id"])
    link_finalists = mail.link("/finalistas")

    # 1-2. Community ranking → Finalist / Non-finalist.
    finalists = []
    for pos, r in enumerate(ranking(board["id"], cycle["id"]), start=1):
        is_final = pos <= cycle["top_n"]
        result = "finalista" if is_final else "no_finalista"
        ex("""INSERT OR REPLACE INTO idea_cycle_entries (idea_id, cycle_id, up, down, score_final, position, result)
              VALUES (?,?,?,?,?,?,?)""", r["id"], cycle["id"], r["up"], r["down"], r["score"], pos, result)
        set_status(r, result, actor_id, notify=False, cycles_without_claim=0)
        if is_final:
            finalists.append((pos, r))
            ex("INSERT OR IGNORE INTO prioritizations (idea_id, cycle_id) VALUES (?,?)", r["id"], cycle["id"])
            mail.notify([r["author_id"]], "cycle_result_finalist", r["id"], pref="cycle_result", n=cycle["number"],
                        title=r["title"], position=pos, score=r["score"], link=link_finalists)
        else:
            mail.notify([r["author_id"]], "cycle_result_nonfinalist", r["id"], pref="cycle_result",
                        n=cycle["number"], title=r["title"], link=mail.link("/idea/%d" % r["id"]))

    # Claims that didn't reach the supports expire; supports don't carry over.
    for i in q("""SELECT i.* FROM ideas i WHERE i.board_id=? AND i.status='reclamada'""", board["id"]):
        ex("UPDATE claims SET status='vencido' WHERE idea_id=? AND status='abierto'", i["id"])
        set_status(i, "no_finalista", actor_id, notify=False)

    # Non-finalists that weren't claimed during this cycle age by one; archive at the limit.
    claimed_now = {r["idea_id"] for r in q("SELECT idea_id FROM claims WHERE cycle_id=?", cycle["id"])}
    competed_now = {r["id"] for _, r in finalists} | {
        r["idea_id"] for r in q("SELECT idea_id FROM idea_cycle_entries WHERE cycle_id=?", cycle["id"])}
    for i in q("SELECT * FROM ideas WHERE board_id=? AND type='C' AND status='no_finalista'", board["id"]):
        if i["id"] in claimed_now or i["id"] in competed_now:
            continue
        n = i["cycles_without_claim"] + 1
        if n >= cycle["cycles_to_archive"]:
            set_status(i, "archivada", actor_id, cycles_without_claim=n)
        else:
            ex("UPDATE ideas SET cycles_without_claim=? WHERE id=?", n, i["id"])

    # 3. Team ideas A → Validated / Not validated.
    for i in q("""SELECT * FROM ideas WHERE board_id=? AND type='A' AND status='en_votacion' AND current_cycle_id=?""",
               board["id"], cycle["id"]):
        st = idea_stats(i)
        ok = a_is_validated(st, cycle)
        ex("""INSERT OR REPLACE INTO idea_cycle_entries (idea_id, cycle_id, importante, deseable, no_importante,
              responses, score_final, result) VALUES (?,?,?,?,?,?,?,?)""",
           i["id"], cycle["id"], st["importante"], st["deseable"], st["no_importante"], st["responses"],
           st["index"], "validada" if ok else "no_validada")
        set_status(i, "validada" if ok else "no_validada", actor_id, notify=ok)
        if ok:
            ex("INSERT OR IGNORE INTO prioritizations (idea_id, cycle_id) VALUES (?,?)", i["id"], cycle["id"])

    # Confirmed ideas B: freeze a snapshot of the expected impact; they stay on the roadmap.
    for i in q("""SELECT * FROM ideas WHERE board_id=? AND type='B' AND status='en_votacion' AND current_cycle_id=?""",
               board["id"], cycle["id"]):
        st = idea_stats(i)
        ex("""INSERT OR REPLACE INTO idea_cycle_entries (idea_id, cycle_id, importante, no_importante, responses,
              score_final, result) VALUES (?,?,?,?,?,?,?)""",
           i["id"], cycle["id"], st["importante"], st["no_importante"], st["responses"], st["pct_importante"],
           "medida")
        set_status(i, "en_roadmap", actor_id, notify=False)

    # 4. Open the next cycle with the current configuration.
    nxt = q1("SELECT * FROM cycles WHERE board_id=? AND status='programado' ORDER BY starts_at LIMIT 1", board["id"])
    if nxt:
        ex("UPDATE cycles SET status='activo', starts_at=? WHERE id=?", min(nxt["starts_at"], t), nxt["id"])
    else:
        start = cycle["ends_at"] if t >= cycle["ends_at"] else t
        create_cycle(board, start, "activo")

    lst = lambda l: "\n".join("%d. %s (%+d)" % (p, r["title"], r["score"]) for p, r in finalists) or "—"
    mail.notify(board_user_ids(board["id"]), "cycle_summary", n=cycle["number"], list=lst, link=link_finalists)
    return {"finalists": len(finalists)}


def tick():
    """Background job: activate scheduled cycles, auto-close, 3-day reminder."""
    t = now()
    for board in q("SELECT * FROM boards"):
        cyc = active_cycle(board["id"])
        if not cyc:
            sched = q1("SELECT * FROM cycles WHERE board_id=? AND status='programado' AND starts_at<=? ORDER BY starts_at LIMIT 1",
                       board["id"], t)
            if sched:
                ex("UPDATE cycles SET status='activo' WHERE id=?", sched["id"])
            continue
        if cyc["ends_at"] <= t:
            close_cycle(board, cyc)
        elif not cyc["reminder_sent"] and cyc["ends_at"] - t <= 3 * 86400:
            ex("UPDATE cycles SET reminder_sent=1 WHERE id=?", cyc["id"])
            date = datetime.fromtimestamp(cyc["ends_at"], tz(board)).strftime("%d/%m/%Y %H:%M")
            mail.notify(admin_ids(board["id"]), "cycle_ending", n=cyc["number"], date=date,
                        link=mail.link("/admin/cierre"))


# ---------------------------------------------------------------- prioritization

def to_scale(pct):
    """0–19 % = 1 … 80–100 % = 5."""
    return max(1, min(5, int(pct // 20) + 1))


def suggestions(board, idea):
    entry = q1("SELECT * FROM idea_cycle_entries WHERE idea_id=? AND result IN ('finalista','validada') ORDER BY cycle_id DESC LIMIT 1",
               idea["id"])
    out = {"impact": None, "criticality": None, "entry": dict(entry) if entry else None}
    if not entry:
        return out
    if idea["type"] == "C":
        scores = [r["score_final"] for r in q(
            """SELECT e.score_final FROM idea_cycle_entries e JOIN ideas i ON i.id=e.idea_id
               WHERE i.board_id=? AND e.result='finalista'""", board["id"])]
        p = sum(1 for s in scores if s <= entry["score_final"]) / float(len(scores) or 1)
        out["impact"] = max(1, min(5, int(math.ceil(p * 5))))
    elif idea["type"] == "A":
        n = entry["responses"] or 0
        pct = 100.0 * (entry["importante"] or 0) / n if n else 0
        out["criticality"] = to_scale(pct)
        out["impact"] = max(1, min(5, int(round(1 + 2 * (entry["score_final"] or 0)))))
    return out


def priority_score(impact, effort, revenue, criticality):
    if None in (impact, effort, revenue, criticality) or not effort:
        return None
    return round((impact + revenue + criticality) / float(effort), 2)


def prioritization_rows(board):
    rows = []
    for i in q("""SELECT i.*, p.impact, p.effort, p.revenue, p.criticality, p.decision, p.cycle_id AS p_cycle
                  FROM ideas i JOIN prioritizations p ON p.idea_id=i.id
                  WHERE i.board_id=? AND i.status IN ('finalista','validada','pospuesta') AND i.merged_into IS NULL""",
               board["id"]):
        sug = suggestions(board, i)
        impact = i["impact"] if i["impact"] is not None else sug["impact"]
        crit = i["criticality"] if i["criticality"] is not None else sug["criticality"]
        cyc = q1("SELECT number FROM cycles WHERE id=?", i["p_cycle"])
        rows.append({
            "id": i["id"], "type": i["type"], "title": i["title"], "status": i["status"],
            "origin": "comunidad" if i["type"] == "C" else "equipo", "cycle_number": cyc["number"] if cyc else None,
            "impact": impact, "effort": i["effort"], "revenue": i["revenue"], "criticality": crit,
            "suggested": {"impact": sug["impact"], "criticality": sug["criticality"]},
            "entry": sug["entry"],
            "score": priority_score(impact, i["effort"], i["revenue"], crit),
        })
    rows.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
    return rows


def decide(board, admin, idea, decision, reason=None, period=None):
    if idea["status"] not in OPEN_STATUSES_FOR_PRIORITIZATION:
        raise ApiError("not_in_prioritization", 409)
    t = now()
    if decision == "aceptar":
        cyc = active_cycle(board["id"])
        p = q1("SELECT * FROM prioritizations WHERE idea_id=?", idea["id"])
        period = period or period_for(board, cyc["starts_at"] if cyc else t, settings(board)["cycle"]["kind"])
        ex("UPDATE prioritizations SET decision='aceptada', decided_at=?, reason=NULL WHERE idea_id=?", t, idea["id"])
        set_status(idea, "aceptada", admin["id"], notify=False)
        ex("INSERT OR IGNORE INTO roadmap_items (idea_id, period, status, cycle_won_id, created_at) VALUES (?,?,?,?,?)",
           idea["id"], period, "planificada", p["cycle_id"] if p else None, t)
        set_status(q1("SELECT * FROM ideas WHERE id=?", idea["id"]), "en_roadmap", admin["id"], notify=False)
        notify_status(idea, "aceptada", admin["id"])
    elif decision == "rechazar":
        reason = (reason or "").strip()
        if not reason:
            raise ApiError("reason_required")
        ex("UPDATE prioritizations SET decision='rechazada', decided_at=?, reason=? WHERE idea_id=?", t, reason, idea["id"])
        set_status(idea, "rechazada", admin["id"], reject_reason=reason,
                   extra=lambda l: ("\n\nMotivo: " if l == "es" else "\n\nReason: ") + reason)
    elif decision == "posponer":
        ex("UPDATE prioritizations SET decision='pospuesta', decided_at=? WHERE idea_id=?", t, idea["id"])
        set_status(idea, "pospuesta", admin["id"])
    else:
        raise ApiError("invalid_decision")


def update_roadmap(board, admin, item, status=None, period=None):
    idea = q1("SELECT * FROM ideas WHERE id=?", item["idea_id"])
    changed = False
    if period and period != item["period"]:
        ex("UPDATE roadmap_items SET period=? WHERE id=?", period, item["id"])
        changed = True
    if status and status != item["status"]:
        if status not in ("planificada", "en_desarrollo", "lanzada"):
            raise ApiError("invalid_status")
        ex("UPDATE roadmap_items SET status=? WHERE id=?", status, item["id"])
        ex("INSERT INTO status_changes (idea_id, from_status, to_status, user_id, created_at) VALUES (?,?,?,?,?)",
           idea["id"], item["status"], status, admin["id"], now())
        new_idea_status = "lanzada" if status == "lanzada" else "en_roadmap"
        if idea["status"] != new_idea_status and idea["status"] in ("en_roadmap", "lanzada"):
            ex("UPDATE ideas SET status=? WHERE id=?", new_idea_status, idea["id"])
        changed = True
    if changed:
        label = status or item["status"]
        per = period or item["period"]
        notify_status(idea, label, admin["id"],
                      extra=lambda l: ("\nPeríodo: " if l == "es" else "\nPeriod: ") + per)


def roadmap_rows(board, filters=None):
    filters = filters or {}
    rows = []
    for r in q("""SELECT r.*, i.type, i.title, i.description, i.category, i.status AS idea_status, i.hidden,
                         c.number AS cycle_number, c.starts_at AS cycle_start
                  FROM roadmap_items r JOIN ideas i ON i.id=r.idea_id LEFT JOIN cycles c ON c.id=r.cycle_won_id
                  WHERE i.board_id=? AND i.merged_into IS NULL ORDER BY r.period, r.id""", board["id"]):
        origin = "comunidad" if r["type"] == "C" else "equipo"
        if filters.get("origin") and filters["origin"] != origin:
            continue
        if filters.get("status") and filters["status"] != r["status"]:
            continue
        if filters.get("period") and filters["period"] != r["period"]:
            continue
        if r["hidden"] and not filters.get("include_hidden"):
            continue
        rows.append({"id": r["id"], "idea_id": r["idea_id"], "type": r["type"], "title": r["title"],
                     "description": r["description"], "category": r["category"], "period": r["period"],
                     "status": r["status"], "origin": origin, "cycle_number": r["cycle_number"],
                     "cycle_start": r["cycle_start"]})
    return rows


# ---------------------------------------------------------------- moderation

def merge(source, target):
    if source["id"] == target["id"] or source["type"] != target["type"]:
        raise ApiError("invalid_merge")
    # Move votes without duplicating users (and never let the target's author vote their own idea).
    for v in q("SELECT * FROM votes WHERE idea_id=? AND cycle_id=?", source["id"], source["current_cycle_id"]):
        if v["user_id"] == target["author_id"] and target["type"] == "C":
            continue
        ex("""INSERT OR IGNORE INTO votes (user_id, idea_id, cycle_id, value, reason, created_at)
              VALUES (?,?,?,?,?,?)""", v["user_id"], target["id"], target["current_cycle_id"], v["value"],
           v["reason"], v["created_at"])
    ex("UPDATE comments SET idea_id=? WHERE idea_id=?", target["id"], source["id"])
    ex("INSERT OR IGNORE INTO follows (user_id, idea_id) SELECT user_id, ? FROM follows WHERE idea_id=?",
       target["id"], source["id"])
    if source["author_id"]:
        follow(source["author_id"], target["id"])
    ex("UPDATE ideas SET merged_into=?, hidden=1 WHERE id=?", target["id"], source["id"])
    set_status(source, "archivada", notify=False)
    ex("UPDATE ideas SET score_changed_at=? WHERE id=?", now(), target["id"])


# ---------------------------------------------------------------- similarity

STOP = set("para con los las del una uno que por como mas más sus the and for with from that this una unos unas "
           "poder puedo quiero ser tener hay idea ideas".split())


def _tokens(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return {w for w in re.findall(r"[a-z0-9]+", s) if len(w) >= 3 and w not in STOP}


def similar(board_id, text, limit=5):
    words = _tokens(text or "")
    if not words:
        return []
    scored = []
    for i in q("""SELECT id, title, status, type FROM ideas WHERE board_id=? AND type='C' AND hidden=0
                  AND merged_into IS NULL AND status!='archivada'""", board_id):
        overlap = len(words & _tokens(i["title"]))
        if overlap:
            scored.append((overlap, i))
    scored.sort(key=lambda x: -x[0])
    return [{"id": i["id"], "title": i["title"], "status": i["status"]} for _, i in scored[:limit]]
