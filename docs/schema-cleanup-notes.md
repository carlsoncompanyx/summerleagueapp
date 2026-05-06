# Schema Cleanup Notes

This pass did not drop tables.

Confirmed current runtime expectations:

- DFS roster config is Captain + 4 skaters + 1 goalie. Migration `20260322_admin_quality_constraints_and_cleanup_notes.sql` updates the `contests.roster_config` default to that shape.
- `player_valuation_inputs` is intended to be unique by `season_id, player_id`. The current code no longer depends on an upsert conflict target for valuation imports/admin grading, and the migration adds the unique index only if duplicate data is not already present.
- `game_stats` is intended to have at most one row per game/player. The migration adds a partial unique index only when duplicate rows are not already present.
- `games.scheduled_at` is the single required timestamp; imports may map either `scheduled_at` directly or `date` plus `time`, which the server combines.

Deferred cleanup candidates, intentionally retained:

- `forum_threads` / `forum_posts`: legacy forum tables if Chat is the only active communication surface.
- `game_events`: unused by current score/stat entry.
- `beer_bucks_packages`, `wallet`, `wallet_transactions`, `bets`: not currently wired to a real-money flow; current betting UI remains picks-only.
