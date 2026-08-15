import sqlite3
import datetime
from contextlib import contextmanager
from config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    language TEXT NOT NULL,
    topic TEXT NOT NULL,
    level TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT
);

CREATE TABLE IF NOT EXISTS turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL,          -- 'user' or 'bot'
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    turn_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    errors INTEGER NOT NULL DEFAULT 0,
    help_needed INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    new_vocab_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (turn_id) REFERENCES turns(id)
);

CREATE TABLE IF NOT EXISTS vocab (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    word TEXT NOT NULL,
    language TEXT NOT NULL
);
"""


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA)


def create_session(language: str, topic: str, level: str) -> int:
    now = datetime.datetime.now().isoformat()
    today = datetime.date.today().isoformat()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO sessions (date, language, topic, level, started_at) VALUES (?, ?, ?, ?, ?)",
            (today, language, topic, level, now),
        )
        return cur.lastrowid


def end_session(session_id: int):
    now = datetime.datetime.now().isoformat()
    with get_db() as conn:
        conn.execute("UPDATE sessions SET ended_at = ? WHERE id = ?", (now, session_id))


def add_turn(session_id: int, role: str, text: str) -> int:
    now = datetime.datetime.now().isoformat()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO turns (session_id, role, text, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, role, text, now),
        )
        return cur.lastrowid


def add_metrics(session_id: int, turn_id: int, errors: int, help_needed: bool,
                 repetitions: int, new_vocab_count: int):
    today = datetime.date.today().isoformat()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO metrics (session_id, turn_id, date, errors, help_needed, repetitions, new_vocab_count)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (session_id, turn_id, today, errors, int(help_needed), repetitions, new_vocab_count),
        )


def add_vocab(session_id: int, language: str, words: list[str]):
    today = datetime.date.today().isoformat()
    with get_db() as conn:
        conn.executemany(
            "INSERT INTO vocab (session_id, date, word, language) VALUES (?, ?, ?, ?)",
            [(session_id, today, w, language) for w in words],
        )


def get_daily_progress(days: int = 30):
    """Returns per-day aggregated stats for the last `days` days."""
    since = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                date,
                SUM(errors) AS total_errors,
                SUM(help_needed) AS total_help,
                SUM(repetitions) AS total_repetitions,
                SUM(new_vocab_count) AS total_new_vocab,
                COUNT(DISTINCT session_id) AS sessions
            FROM metrics
            WHERE date >= ?
            GROUP BY date
            ORDER BY date ASC
            """,
            (since,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_session_summary(session_id: int):
    with get_db() as conn:
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        metrics = conn.execute(
            """SELECT SUM(errors) AS errors, SUM(help_needed) AS help_needed,
                      SUM(repetitions) AS repetitions, SUM(new_vocab_count) AS new_vocab
               FROM metrics WHERE session_id = ?""",
            (session_id,),
        ).fetchone()
        turn_count = conn.execute(
            "SELECT COUNT(*) as c FROM turns WHERE session_id = ? AND role = 'user'", (session_id,)
        ).fetchone()["c"]
        return {
            "session": dict(session) if session else None,
            "metrics": dict(metrics) if metrics else None,
            "user_turns": turn_count,
        }
