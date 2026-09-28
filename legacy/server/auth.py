"""Passwords, sessions, email verification / magic links and rate limiting."""
import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque

from .db import q1, ex
from .core import ApiError
from . import mail

SESSION_DAYS = 30
VERIFY_TTL = 24 * 3600
MAGIC_TTL = 30 * 60
ITERATIONS = 200_000


def hash_password(pw):
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), ITERATIONS).hex()
    return "pbkdf2$%d$%s$%s" % (ITERATIONS, salt, dk)


def check_password(pw, stored):
    if not stored:
        return False
    try:
        _, it, salt, dk = stored.split("$")
    except ValueError:
        return False
    calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), int(it)).hex()
    return hmac.compare_digest(calc, dk)


def create_session(user_id):
    token = secrets.token_urlsafe(32)
    ex("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)", token, user_id,
       time.time() + SESSION_DAYS * 86400)
    return token


def session_user(token):
    if not token:
        return None
    return q1("""SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
                 WHERE s.token=? AND s.expires_at>?""", token, time.time())


def destroy_session(token):
    ex("DELETE FROM sessions WHERE token=?", token)


def send_token(user, kind, board):
    token = secrets.token_urlsafe(32)
    ttl = VERIFY_TTL if kind == "verify" else MAGIC_TTL
    ex("INSERT INTO auth_tokens (token, user_id, kind, expires_at) VALUES (?,?,?,?)",
       token, user["id"], kind, time.time() + ttl)
    mail.notify([user["id"]], kind, board=board["name"], link=mail.link("/auth?token=" + token))


def consume_token(token):
    row = q1("SELECT * FROM auth_tokens WHERE token=?", token or "")
    if not row or row["used"]:
        raise ApiError("invalid_token")
    if row["expires_at"] < time.time():
        raise ApiError("token_expired")
    ex("UPDATE auth_tokens SET used=1 WHERE token=?", token)
    # Both links prove ownership of the email.
    ex("UPDATE users SET email_verified=1 WHERE id=?", row["user_id"])
    return row["user_id"]


# ---------------------------------------------------------------- rate limiting

_hits = defaultdict(deque)
_rl_lock = threading.Lock()

LIMITS = {
    "vote": (60, 60),          # 60 votes per minute
    "register": (5, 3600),     # 5 sign-ups per hour
    "login": (20, 600),        # 20 attempts per 10 min
    "magic": (5, 600),
    "post": (10, 600),         # 10 ideas per 10 min
    "comment": (30, 600),
    "report": (20, 3600),
}


def rate_limit(bucket, key):
    limit, window = LIMITS[bucket]
    t = time.time()
    with _rl_lock:
        dq = _hits[(bucket, key)]
        while dq and dq[0] < t - window:
            dq.popleft()
        if len(dq) >= limit:
            raise ApiError("rate_limited", 429)
        dq.append(t)
