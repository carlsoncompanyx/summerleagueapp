# Supabase Product Surface Mapping (MVP)

This document reflects the **current public product model** (league-first, DFS contests, community, weekly betting).

## Core public reads

| Surface | Primary tables/views |
|---|---|
| Home / Games / Standings | `seasons`, `teams`, `games` |
| Statistics | `players`, `game_stats`, `fantasy_points_v` (for DFS context only) |
| DFS Contest Lobby + Builder | `slates`, `contests`, `slate_games`, `slate_players`, `contest_entries`, `contest_entry_slots` |
| Community (Chat + Forums) | `chat_messages`, `forum_threads`, `forum_posts`, `profiles` |
| Betting (weekly game markets) | `games`, `game_betting_lines` |

## Core public writes

| Surface | Writes |
|---|---|
| DFS | submit/update lineup via `/api/dfs` into `contest_entries` + `contest_entry_slots` |
| Community Chat | `chat_messages` inserts |
| Community Forums | `forum_threads` and `forum_posts` inserts |
| Betting lines admin overrides | `game_betting_lines` (admin only) |

## Productized betting model (MVP)

Active market types are game-based only:
- `moneyline`
- `spread`
- `total`

Legacy player-prop enum values are considered deprecated in product flow and blocked for new bet writes by constraint migration.

## Deprecated public flows

These routes are now deprecated for MVP clarity:
- Catch-all route preview page (`app/[...slug]`) removed in favor of true 404 behavior.
- Legacy public leaders/wallet pages are redirected to current product surfaces.

## Operational note

Admin/testing convenience remains intact through existing test-mode behavior in API routes and layout session bootstrap.
