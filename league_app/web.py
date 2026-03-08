from __future__ import annotations

from html import escape
from urllib.parse import parse_qs, urlencode

from .db import get_connection, init_db
from .services import (
    ValidationError,
    add_game,
    add_player_stat,
    get_fantasy_lineups,
    get_player_leaderboard,
    get_standings,
    list_players,
    register_player,
    set_fantasy_lineup,
)


def _render_options(players):
    return "".join(
        f'<option value="{p["id"]}">{escape(p["name"])} ({escape(p["team"])})</option>' for p in players
    )


def render_index(db_path: str, week: int = 1, message: str = "", error: str = "") -> str:
    with get_connection(db_path) as conn:
        players = get_player_leaderboard(conn)
        standings = get_standings(conn)
        lineups = get_fantasy_lineups(conn, week=week)
        all_players = list_players(conn)
        all_games = conn.execute("SELECT id, week, team_home, team_away FROM games ORDER BY id DESC").fetchall()

    leaderboard_rows = "".join(
        f"<tr><td>{escape(p['name'])}</td><td>{escape(p['team'])}</td><td>{escape(p['position'])}</td><td>{p['goals']}</td><td>{p['assists']}</td><td>{p['saves']}</td><td>{p['points']}</td></tr>"
        for p in players
    ) or '<tr><td colspan="7">No player stats yet.</td></tr>'

    standings_rows = "".join(
        f"<tr><td>{escape(t['team'])}</td><td>{t['wins']}</td><td>{t['losses']}</td><td>{t['ties']}</td><td>{t['points']}</td><td>{t['goals_for']}</td><td>{t['goals_against']}</td><td>{t['goal_diff']}</td></tr>"
        for t in standings
    ) or '<tr><td colspan="8">No games recorded.</td></tr>'

    lineup_rows = "".join(
        f"<tr><td>{escape(l['manager_name'])}</td><td>{l['slot']}</td><td>{escape(l['player_name'])}</td><td>{escape(l['team'])}</td></tr>"
        for l in lineups
    ) or '<tr><td colspan="4">No lineups submitted yet.</td></tr>'

    game_options = "".join(
        f'<option value="{g["id"]}">Week {g["week"]}: {escape(g["team_home"])} vs {escape(g["team_away"])} </option>' for g in all_games
    )
    player_options = _render_options(all_players)

    return f"""<!doctype html><html><head><title>Roller Hockey League Manager</title></head><body>
    <h1>Roller Hockey League Manager</h1>
    {f'<div>{escape(message)}</div>' if message else ''}
    {f'<div>{escape(error)}</div>' if error else ''}
    <div><a href='#registration'>Registration</a> | <a href='#stats'>Player Stats</a> | <a href='#standings'>Standings</a> | <a href='#fantasy'>Fantasy Weekly Lineup</a></div>

    <section id='registration'><h2>Registration</h2>
      <form method='post' action='/players'><input name='name' required><input name='team' required><input name='position' required><button>Register Player</button></form>
      <form method='post' action='/games'><input name='team_home' required><input name='team_away' required><input type='number' name='home_goals' min='0' required><input type='number' name='away_goals' min='0' required><input type='number' name='week' min='1' required><button>Record Game</button></form>
    </section>

    <section id='stats'><h2>Player Stats</h2>
      <form method='post' action='/stats'><select name='player_id' required><option value=''>Select Player</option>{player_options}</select>
      <select name='game_id' required><option value=''>Select Game</option>{game_options}</select>
      <input type='number' min='0' value='0' name='goals'><input type='number' min='0' value='0' name='assists'><input type='number' min='0' value='0' name='saves'><button>Save Stats</button></form>
      <table><thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>Goals</th><th>Assists</th><th>Saves</th><th>Points</th></tr></thead><tbody>{leaderboard_rows}</tbody></table>
    </section>

    <section id='standings'><h2>Standings</h2><table><thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th>GF</th><th>GA</th><th>GD</th></tr></thead><tbody>{standings_rows}</tbody></table></section>
    <section id='fantasy'><h2>Fantasy Weekly Lineup</h2>
      <form method='post' action='/fantasy'><input name='manager_name' required><input type='number' name='week' value='{week}' min='1' required>
      <select name='center' required><option value=''>Center</option>{player_options}</select><select name='wing' required><option value=''>Wing</option>{player_options}</select><select name='goalie' required><option value=''>Goalie</option>{player_options}</select><button>Save Weekly Lineup</button></form>
      <table><thead><tr><th>Manager</th><th>Slot</th><th>Player</th><th>Team</th></tr></thead><tbody>{lineup_rows}</tbody></table>
    </section>
    </body></html>"""


def app(environ, start_response, db_path: str):
    method = environ["REQUEST_METHOD"]
    path = environ.get("PATH_INFO", "/")

    if method == "GET" and path == "/":
        query = parse_qs(environ.get("QUERY_STRING", ""))
        week = int(query.get("week", [1])[0])
        msg = query.get("message", [""])[0]
        err = query.get("error", [""])[0]
        body = render_index(db_path, week=week, message=msg, error=err).encode()
        start_response("200 OK", [("Content-Type", "text/html; charset=utf-8"), ("Content-Length", str(len(body)))])
        return [body]

    if method == "POST" and path in {"/players", "/games", "/stats", "/fantasy"}:
        size = int(environ.get("CONTENT_LENGTH") or 0)
        raw = environ["wsgi.input"].read(size).decode()
        data = {k: v[0] for k, v in parse_qs(raw).items()}
        query = {"message": "Updated"}
        try:
            with get_connection(db_path) as conn:
                if path == "/players":
                    register_player(conn, data["name"], data["team"], data["position"])
                    query = {"message": "Player registered."}
                elif path == "/games":
                    add_game(conn, data["team_home"], data["team_away"], int(data["home_goals"]), int(data["away_goals"]), int(data["week"]))
                    query = {"message": "Game recorded."}
                elif path == "/stats":
                    add_player_stat(conn, int(data["player_id"]), int(data["game_id"]), int(data.get("goals", 0)), int(data.get("assists", 0)), int(data.get("saves", 0)))
                    query = {"message": "Player stats updated."}
                elif path == "/fantasy":
                    set_fantasy_lineup(conn, data["manager_name"], int(data["week"]), {"C": int(data["center"]), "W": int(data["wing"]), "G": int(data["goalie"])})
                    query = {"message": "Fantasy lineup saved.", "week": data["week"]}
        except ValidationError as exc:
            query = {"error": exc.message}

        start_response("303 See Other", [("Location", "/?" + urlencode(query))])
        return [b""]

    start_response("404 Not Found", [("Content-Type", "text/plain")])
    return [b"Not found"]


def init(db_path: str):
    init_db(db_path)
