from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .db import fetch_all


@dataclass
class ValidationError(Exception):
    message: str


def register_player(conn, name: str, team: str, position: str) -> int:
    if not all([name.strip(), team.strip(), position.strip()]):
        raise ValidationError("Name, team, and position are required.")
    try:
        cur = conn.execute(
            "INSERT INTO players(name, team, position) VALUES(?, ?, ?)",
            (name.strip(), team.strip(), position.strip()),
        )
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise ValidationError("Player already exists for that team.") from exc
        raise
    return cur.lastrowid


def list_players(conn) -> list[dict[str, Any]]:
    return fetch_all(conn, "SELECT * FROM players ORDER BY team, name")


def add_game(conn, team_home: str, team_away: str, home_goals: int, away_goals: int, week: int) -> int:
    if team_home == team_away:
        raise ValidationError("Home and away team must be different.")
    if week <= 0:
        raise ValidationError("Week must be positive.")
    cur = conn.execute(
        "INSERT INTO games(team_home, team_away, home_goals, away_goals, week) VALUES(?, ?, ?, ?, ?)",
        (team_home.strip(), team_away.strip(), home_goals, away_goals, week),
    )
    return cur.lastrowid


def add_player_stat(conn, player_id: int, game_id: int, goals: int = 0, assists: int = 0, saves: int = 0) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO player_stats(player_id, game_id, goals, assists, saves) VALUES(?, ?, ?, ?, ?)",
        (player_id, game_id, goals, assists, saves),
    )


def get_standings(conn) -> list[dict[str, Any]]:
    teams = fetch_all(
        conn,
        """
        WITH all_teams AS (
            SELECT team_home AS team FROM games
            UNION
            SELECT team_away AS team FROM games
        )
        SELECT team FROM all_teams
        """,
    )

    standings: list[dict[str, Any]] = []
    for row in teams:
        team = row["team"]
        results = fetch_all(
            conn,
            """
            SELECT team_home, team_away, home_goals, away_goals FROM games
            WHERE team_home = ? OR team_away = ?
            """,
            (team, team),
        )
        wins = losses = ties = goals_for = goals_against = 0
        for game in results:
            is_home = game["team_home"] == team
            gf = game["home_goals"] if is_home else game["away_goals"]
            ga = game["away_goals"] if is_home else game["home_goals"]
            goals_for += gf
            goals_against += ga
            if gf > ga:
                wins += 1
            elif gf < ga:
                losses += 1
            else:
                ties += 1
        points = wins * 2 + ties
        standings.append(
            {
                "team": team,
                "wins": wins,
                "losses": losses,
                "ties": ties,
                "points": points,
                "goals_for": goals_for,
                "goals_against": goals_against,
                "goal_diff": goals_for - goals_against,
            }
        )

    standings.sort(key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]), reverse=True)
    return standings


def get_player_leaderboard(conn) -> list[dict[str, Any]]:
    return fetch_all(
        conn,
        """
        SELECT p.id, p.name, p.team, p.position,
               COALESCE(SUM(s.goals), 0) AS goals,
               COALESCE(SUM(s.assists), 0) AS assists,
               COALESCE(SUM(s.saves), 0) AS saves,
               COALESCE(SUM(s.goals + s.assists), 0) AS points
        FROM players p
        LEFT JOIN player_stats s ON p.id = s.player_id
        GROUP BY p.id, p.name, p.team, p.position
        ORDER BY points DESC, goals DESC, assists DESC, name ASC
        """,
    )


def set_fantasy_lineup(conn, manager_name: str, week: int, lineup: dict[str, int]) -> None:
    if len(lineup) != 3:
        raise ValidationError("Lineup must include exactly 3 slots: C, W, G.")
    if set(lineup.keys()) != {"C", "W", "G"}:
        raise ValidationError("Lineup slots must be C, W, and G.")
    if len(set(lineup.values())) != 3:
        raise ValidationError("Lineup players must be unique.")
    conn.execute("DELETE FROM fantasy_lineups WHERE manager_name = ? AND week = ?", (manager_name, week))
    for slot, player_id in lineup.items():
        conn.execute(
            "INSERT INTO fantasy_lineups(manager_name, week, player_id, slot) VALUES(?, ?, ?, ?)",
            (manager_name.strip(), week, player_id, slot),
        )


def get_fantasy_lineups(conn, week: int) -> list[dict[str, Any]]:
    return fetch_all(
        conn,
        """
        SELECT f.manager_name, f.week, f.slot, p.name AS player_name, p.team
        FROM fantasy_lineups f
        JOIN players p ON p.id = f.player_id
        WHERE f.week = ?
        ORDER BY f.manager_name, f.slot
        """,
        (week,),
    )
