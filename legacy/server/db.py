"""SQLite connection and schema. One shared connection guarded by a lock:
every request and background job runs inside `transaction()`."""
import os
import sqlite3
import threading
from contextlib import contextmanager

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("IB_DB", os.path.join(ROOT, "data", "insight.db"))

LOCK = threading.RLock()
_conn = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'gratis'
);
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'es',
  notif_prefs TEXT NOT NULL DEFAULT '{}',
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','usuario')),
  PRIMARY KEY (user_id, board_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify','magic')),
  expires_at REAL NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('mensual','trimestral')),
  starts_at REAL NOT NULL,
  ends_at REAL NOT NULL,
  top_n INTEGER NOT NULL,
  supports_required INTEGER NOT NULL,
  cycles_to_archive INTEGER NOT NULL,
  a_threshold_pct REAL NOT NULL,
  a_min_responses INTEGER NOT NULL,
  b_alert_pct REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('programado','activo','cerrado')),
  closed_at REAL,
  reminder_sent INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_cycle ON cycles(board_id) WHERE status = 'activo';
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('A','B','C')),
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT,
  status TEXT NOT NULL,
  current_cycle_id INTEGER REFERENCES cycles(id),
  cycles_without_claim INTEGER NOT NULL DEFAULT 0,
  merged_into INTEGER REFERENCES ideas(id) ON DELETE SET NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  score_changed_at REAL,
  b_alert_sent INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS idea_cycle_entries (
  id INTEGER PRIMARY KEY,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  up INTEGER, down INTEGER, score_final REAL,
  importante INTEGER, deseable INTEGER, no_importante INTEGER, responses INTEGER,
  position INTEGER,
  result TEXT NOT NULL,
  UNIQUE (idea_id, cycle_id)
);
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  value TEXT NOT NULL CHECK (value IN ('importante','deseable','no_importante','up','down')),
  reason TEXT,
  created_at REAL NOT NULL,
  UNIQUE (user_id, idea_id, cycle_id)
);
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  started_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  supports_required INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('abierto','cumplido','vencido')),
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS claim_supports (
  claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at REAL NOT NULL,
  PRIMARY KEY (claim_id, user_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_official INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS follows (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, idea_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  object_type TEXT NOT NULL CHECK (object_type IN ('idea','comment')),
  object_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','resuelto','descartado')),
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS prioritizations (
  id INTEGER PRIMARY KEY,
  idea_id INTEGER NOT NULL UNIQUE REFERENCES ideas(id) ON DELETE CASCADE,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id),
  impact INTEGER, effort INTEGER, revenue INTEGER, criticality INTEGER,
  decision TEXT NOT NULL DEFAULT 'pendiente' CHECK (decision IN ('pendiente','aceptada','rechazada','pospuesta')),
  reason TEXT,
  decided_at REAL
);
CREATE TABLE IF NOT EXISTS roadmap_items (
  id INTEGER PRIMARY KEY,
  idea_id INTEGER NOT NULL UNIQUE REFERENCES ideas(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planificada' CHECK (status IN ('planificada','en_desarrollo','lanzada')),
  cycle_won_id INTEGER REFERENCES cycles(id),
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS status_changes (
  id INTEGER PRIMARY KEY,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  type TEXT NOT NULL,
  idea_id INTEGER REFERENCES ideas(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at REAL NOT NULL,
  sent_at REAL
);
CREATE INDEX IF NOT EXISTS votes_idea ON votes(idea_id, cycle_id);
CREATE INDEX IF NOT EXISTS ideas_board ON ideas(board_id, type, status);
CREATE INDEX IF NOT EXISTS comments_idea ON comments(idea_id);
"""


def conn():
    global _conn
    if _conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA foreign_keys = ON")
        _conn.execute("PRAGMA journal_mode = WAL")
        _conn.executescript(SCHEMA)
    return _conn


@contextmanager
def transaction():
    """Serialize access and commit/rollback atomically."""
    with LOCK:
        c = conn()
        try:
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise


def q(sql, *args):
    return conn().execute(sql, args).fetchall()


def q1(sql, *args):
    return conn().execute(sql, args).fetchone()


def val(sql, *args):
    row = conn().execute(sql, args).fetchone()
    return row[0] if row else None


def ex(sql, *args):
    return conn().execute(sql, args).lastrowid
