import os
from wsgiref.simple_server import make_server

from league_app.web import app, init

DB_PATH = os.environ.get("DB_PATH", "data/league.db")

if __name__ == "__main__":
    init(DB_PATH)
    with make_server("0.0.0.0", 5000, lambda e, s: app(e, s, DB_PATH)) as httpd:
        print("Serving on http://0.0.0.0:5000")
        httpd.serve_forever()
