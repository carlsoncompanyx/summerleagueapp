import sqlite3
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    team TEXT NOT NULL,
    position TEXT NOT NULL,
    UNIQUE(name, team)
);

CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_home TEXT NOT NULL,
    team_away TEXT NOT NULL,
    home_goals INTEGER NOT NULL CHECK(home_goals >= 0),
    away_goals INTEGER NOT NULL CHECK(away_goals >= 0),
    week INTEGER NOT NULL CHECK(week > 0)
);

CREATE TABLE IF NOT EXISTS player_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    goals INTEGER NOT NULL DEFAULT 0 CHECK(goals >= 0),
    assists INTEGER NOT NULL DEFAULT 0 CHECK(assists >= 0),
    saves INTEGER NOT NULL DEFAULT 0 CHECK(saves >= 0),
    FOREIGN KEY(player_id) REFERENCES players(id),
    FOREIGN KEY(game_id) REFERENCES games(id),
    UNIQUE(player_id, game_id)
);

CREATE TABLE IF NOT EXISTS fantasy_lineups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manager_name TEXT NOT NULL,
    week INTEGER NOT NULL CHECK(week > 0),
    player_id INTEGER NOT NULL,
    slot TEXT NOT NULL,
    FOREIGN KEY(player_id) REFERENCES players(id),
    UNIQUE(manager_name, week, slot)
);
"""


def get_connection(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: str) -> None:
    with get_connection(db_path) as conn:
        conn.executescript(SCHEMA)


def fetch_all(conn: sqlite3.Connection, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(query, params).fetchall()]
