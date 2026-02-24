# Supabase UI/Button/Field Mapping (Current + Planned)

This document maps **buttons, fields, and views** in the current app to:
1. what is already connected to Supabase today, and
2. what table/column connections are planned.

---

## 1) Central data loader used by multiple pages

`lib/league-data.ts` currently reads these tables:

| Source file | Query | Table | Columns read | Used by pages/components |
|---|---|---|---|---|
| `lib/league-data.ts` | `from('seasons').select(...)` | `seasons` | `id, name, start_date, end_date` | Home, Registration, Games, Stats, Chat, Trades, Admin |
| `lib/league-data.ts` | `from('teams').select(...)` | `teams` | `id, name` | Home, Games, Standings, Stats, Trades, Admin |
| `lib/league-data.ts` | `from('games').select(...)` | `games` | `id, season_id, home_team, away_team, scheduled_at, location, status, home_score, away_score` | Home, Games, Admin |
| `lib/league-data.ts` | `from('players').select(...)` | `players` | `id, name, team_id, position, nickname` | Home/Stats/Trades/Admin player lists |
| `lib/league-data.ts` | `from('chat_messages').select(...)` | `chat_messages` | `id, message, created_at, role` | Shit Talk initial message board |

> Note: These are read through `getSupabaseAdminSafe() ?? getSupabaseSafe()`, so reads can happen via service role (server) or anon fallback based on env availability.

---

## 2) Stripe + wallet flows (already connected)

| Source file | Trigger | Supabase operation | Table/function | Columns/params |
|---|---|---|---|---|
| `app/api/stripe/create-checkout-session/route.ts` | Create checkout session API call | `select(...).eq('id', packageId).single()` | `beer_bucks_packages` | package lookup by `id` |
| `app/api/stripe/webhook/route.ts` | `checkout.session.completed` webhook | `select('id').eq('idempotency_key', idem).maybeSingle()` | `wallet_transactions` | idempotency check via `idempotency_key` |
| `app/api/stripe/webhook/route.ts` | `checkout.session.completed` webhook | `select('*').eq('id', packageId).single()` | `beer_bucks_packages` | package amount lookup |
| `app/api/stripe/webhook/route.ts` | `checkout.session.completed` webhook | `rpc('credit_wallet', ...)` | SQL function `credit_wallet` | `p_user_id, p_amount, p_ref_type, p_ref_id, p_idempotency_key` |

---

## 3) Registration page mapping

## Current UI fields/buttons

Location: `app/registration/page.tsx`

| UI section | Field/button | Current behavior | Planned Supabase write mapping |
|---|---|---|---|
| Account + Season Registration form | `first_name` | UI only | `profiles.display_name` composed from first/last (or add dedicated columns later) |
| Account + Season Registration form | `last_name` | UI only | same as above |
| Account + Season Registration form | `email` | UI only | `auth.users.email` via Supabase Auth sign-up |
| Account + Season Registration form | `phone` | UI only | `profiles.contact` |
| Account + Season Registration form | `position` | UI only | `players.position` (if player row created), else pending registration payload |
| Account + Season Registration form | `experience` | UI only | planned to add to `registrations` notes/metadata (requires schema field), or profile notes |
| Account + Season Registration form | **Create Account + Register for Season** | no submit handler yet | 1) Auth signup (one account/email) 2) Insert into `registrations(season_id, user_id, status)` |
| Already a Member section | **Already a member? Register for latest season** | no handler yet | Insert into `registrations(season_id, user_id, status)` only |

## Constraints already in schema
- `registrations` has `unique(season_id, user_id)`, which enforces one registration per season per user account.
- One-account-per-email is enforced by Supabase Auth user model.

---

## 4) Games tab mapping

Location: `app/schedule/page.tsx` (tab label shown as **Games**)

| UI section | Data source | Supabase mapping |
|---|---|---|
| Upcoming Games table (`Date, Home Team, Away Team, Location`) | `data.schedule.filter(status !== 'FINAL')` | From `games` + team-name joins built from `teams` |
| Completed Games table (`Date, Home Team, Away Team, Location, Home Score, Away Score`) | `data.schedule.filter(status === 'FINAL')` | `games.home_score`, `games.away_score` + team names |

No write action is wired from Games page yet.

---

## 5) Statistics mapping

Location: `components/StatisticsClient.tsx` + `app/statistics/page.tsx`

| UI section | Current source | Current status | Planned Supabase source |
|---|---|---|---|
| Leaderboard → Skaters | Derived in-memory from `data.leaders` | Mocked/derived stats today | Aggregate from `game_events` by player (goals, assists, points, GP) |
| Leaderboard → Goalies | Derived in-memory from `data.leaders` | Mocked/derived stats today | Aggregate from `games`/goalie events for wins + GAA |
| All Stats → Skaters | Same derived rows, optional team filter | Mocked/derived today | Same aggregate source, with team filter using `team_id` |
| All Stats → Goalies | Same derived rows, optional team filter | Mocked/derived today | Same aggregate source, filtered to goalie players |

### Column intent
- Skaters: `G`, `A`, `P`, `G/GP`, `P/GP`
- Goalies: `Wins`, `GAA`

---

## 6) Shit Talk mapping

Location: `components/ChatClient.tsx` + `app/chat/page.tsx`

| UI section | Field/button | Current behavior | Planned Supabase mapping |
|---|---|---|---|
| Live Chatroom | `chat-input` + **Send** | Local state append only | `insert` into `chat_messages(message, user_id, season_id, role)` |
| Live Chatroom | **Attach GIF** | Appends emoji to local input | could store GIF URL in `chat_messages.message` or new `attachments` column |
| Message Board | `board-input` + **New Post** | Local state append only | same `insert` into `chat_messages` |
| Message Board | **Refresh** | Re-renders local list | planned fetch/requery from `chat_messages` |
| Message list | initial messages | Preloaded server-side from `chat_messages` | already connected read |

### Supabase setup needed for persistent chat
1. Enable Realtime for `chat_messages` in Supabase.
2. Keep/verify `select` + `insert` policies for authenticated users.
3. Wire client insert/query (and optional realtime subscription).

---

## 7) Trades mapping

Location: `app/trades/page.tsx`

| UI section | Current source | Current behavior | Planned Supabase mapping |
|---|---|---|---|
| My Roster | `data.leaders.slice(0, 8)` | display-only; synthetic stats | Should query roster by team from `players` + `team_members` |
| My Roster status dropdown | On trade block / Open to trade / Untradeable | UI only | Add/update player trade availability (new column on `players` or separate trade_preferences table) |
| Players Available for Trade | `data.leaders.slice(8, 16)` | display-only | Query players filtered by trade-available status |
| All Players | `data.leaders` | display-only | Query all players with live stats + availability |

---

## 8) Admin mapping

Location: `components/AdminClient.tsx` + `app/admin/page.tsx`

| UI section | Field/button | Current behavior | Planned Supabase mapping |
|---|---|---|---|
| Player Information & Registration | player table | pre-populated from `data.leaders` | Query/maintain `players`, `profiles`, `registrations` |
| Schedule Management | inline fields (`date/home/away/location`) | local-only edits | `update games set ... where id = ...` |
| Schedule Management | **Select All** | local selection state | n/a |
| Schedule Management | **Delete Selected** | local-only delete | `delete from games where id in (...)` |
| Schedule Management | **Import CSV** | opens local modal | parse + `insert/upsert` into `games` |
| Import CSV modal | field mapping inputs | local-only | map CSV columns -> `games.scheduled_at/home_team/away_team/location` |
| Game Scores table | **Update Game Score** | opens local score editor | `update games set home_score, away_score, status` |
| Score modal | `Home Score`/`Away Score` | local-only | `games.home_score`, `games.away_score` |
| Score modal | goals/assists textareas | local-only | `insert` rows into `game_events` (goal + assist events) |

### Sorting currently implemented
- Unfinished games shown before final games in admin score/schedule lists.

---

## 9) What is connected right now vs planned

## Connected now (real Supabase reads/writes)
- Reads: `seasons`, `teams`, `games`, `players`, `chat_messages` via `getLeagueSnapshot`.
- Writes: Stripe purchase flow (`beer_bucks_packages`, `wallet_transactions`, `credit_wallet` RPC).

## Planned / UI-stubbed (needs handler wiring)
- Registration submit + returning member button.
- Chat send/post persistence and realtime subscription.
- Trades availability/status persistence.
- Admin schedule edits/deletes/csv import persistence.
- Admin score updates + game_events writes.
- Stats aggregation from real game events/game results.

---

## 10) Quick implementation priority (recommended)

1. Registration submit (Auth signup + registrations insert).
2. Admin score update persist (`games` + `game_events`) because it unlocks standings/stats quality.
3. Admin schedule update/delete/import persist.
4. Chat persistent insert + realtime subscribe.
5. Trades status persistence and role-guarded update rules.
6. Replace synthetic stats with true aggregates.
