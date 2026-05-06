# AGENTS.md

## Project

Emerald Coast Roller League / summer roller hockey app.

This app should become a functional league-management platform, not a bare MVP. It combines TeamLinkt-style league management, ESPN-style rosters/schedules/standings/stats, DraftKings-style weekly fantasy/DFS, captain trade management, and admin tools for seasons, teams, players, scores, imports, registrations, trades, and DFS.

## Stack

- Next.js App Router
- React 19
- TypeScript
- Supabase
- Vercel

## Product Priorities

Prioritize admin functionality and real usability over cosmetic-only changes.

Highest-priority workflows:

1. Current season handling
2. Admin dashboard usability
3. Player import
4. Schedule import
5. Score/stat entry
6. Team/player editing
7. Trade review
8. DFS slate/contest management

## Admin UX Rules

Do not use giant always-open admin forms.

Admin edit actions should use modal dialogs near the current context. Admins should not need to scroll up to find the form they are editing.

Modal-based workflows are required for:

- Add/edit season
- Add/edit team
- Add/edit player
- Add/edit game
- Import players
- Import schedule
- Enter/update score
- Review trade

Admin tables should remain visible behind modals.

Every mutation should show pending/loading state, validation errors, and useful success/failure messages. Do not allow silent failure.

The admin dashboard should default to the current working season, not all seasons.

Mobile admin layout must be usable: tables may scroll horizontally, modals should fit mobile screens, and buttons need pointer cursor, hover, and focus states.

## Supabase And Security Rules

Keep service-role or secret Supabase keys server-only.

Do not import server/admin Supabase clients into client components.

Client fetch calls must check `res.ok`.

Route handlers must return useful errors.

Do not silently swallow Supabase errors.

Admin API routes must enforce server-side admin authorization. Client-side hiding is not enough.

## Role Enum Rules

`profiles.user_id` is the primary key for profiles.

`profiles.role` is an `app_role` enum with uppercase values only:

- `FAN`
- `PLAYER`
- `CAPTAIN`
- `ADMIN`

Do not rename database enum values.

Admin UI may allow promoting linked players between `PLAYER` and `CAPTAIN`, but must not promote users to `ADMIN` from player or team editing workflows.

When assigning a team captain, update the linked profile to `CAPTAIN` unless that user is already `ADMIN`.

## Current Season Rules

The app should consistently resolve a current working season.

Resolution priority:

1. Explicit `season_id` from UI/request
2. Admin selected season if not `all`
3. Season with currently open registration window
4. Season where today is between `start_date` and `end_date`
5. Most recent season by `start_date`
6. Clear error if no season exists

CSV imports default to the current/selected season and should not require a season column when the UI/app already knows the target season.

## CSV Import Rules

Player import must default to the selected/current working season.

Schedule import must default to the selected/current working season.

CSV imports need:

- Preview/dry-run mode
- Manual field mapping when auto-detection misses
- Row-level validation
- Row-level errors
- Inserted count
- Updated count
- Skipped count
- Error count

Player CSV flexible headers include:

- `name`
- `player_name`
- `full_name`
- `first_name` + `last_name`
- `team`
- `team_name`
- `jersey`
- `jersey_number`
- `number`
- `no`
- `no.`
- `#`
- `position`
- `pos`
- `email`
- `user_email`
- `user_id`
- `grade`
- `notes`

Schedule CSV flexible headers include:

- `scheduled_at`
- `scheduled at`
- `date`
- `game date`
- `time`
- `start time`
- `home_team`
- `home team`
- `home`
- `away_team`
- `away team`
- `away`
- `location`
- `rink`
- `status`

Team matching should be scoped to the selected/current season, case-insensitive, whitespace-trimmed, and tolerant of simple punctuation differences.

Blank team for player import should create an unassigned player in the target season.

Player imports should support append-only, upsert/update existing, and replace-all modes. Replace-all must require explicit confirmation and must preflight dependencies before deleting players.

Schedule imports should support append, replace non-final games, and cancel non-final games. Do not delete final games, bets, wallet records, historical stats, DFS entries, trades, or team memberships silently.

## Score Entry Rules

Score entry should open in a modal.

If a game already has stats, preload existing `game_stats`.

If no stats exist, preload rostered players from the home and away teams.

Skaters:

- GP
- Goals
- Assists

Goalies:

- GP
- Goals against

Saving scores should update game score, save stats, mark final when appropriate, avoid accidental stat wipes, and use a transaction/RPC if available.

Do not insert or select `game_stats.team_id` unless a migration proves it exists in the deployed schema.

## DFS Rules

Current lineup:

- Captain
- 4 skaters
- 1 goalie

Captain:

- 1.5x fantasy points
- 1.5x salary

Skaters:

- Goal = 3
- Assist = 2
- Weekly real point bonus: +5 at 5 points
- Additional weekly real point bonus: +5 at 10 points

Goalies:

- Win = 8
- Goal against = -1

Normal users should default to the next open/playable contest. Do not make a contest dropdown the main first interaction unless there are multiple meaningful contests.

DFS contest scoring must not depend on `game_stats.team_id`; derive team and goalie win context from `players` and `games` when needed.

## Code Organization Rules

Prefer small, focused components over one large component.

The old giant `AdminClient` should be a thin shell/wrapper or be replaced by an admin shell plus manager components.

Preferred admin structure:

- `components/admin/AdminShell.tsx`
- `components/admin/AdminTabs.tsx`
- `components/admin/AdminModal.tsx`
- `components/admin/ConfirmDialog.tsx`
- `components/admin/AdminDashboardHome.tsx`
- `components/admin/SeasonManager.tsx`
- `components/admin/TeamManager.tsx`
- `components/admin/PlayerManager.tsx`
- `components/admin/GameManager.tsx`
- `components/admin/ScoreEntryModal.tsx`
- `components/admin/CsvImportModal.tsx`
- `components/admin/TradeReviewPanel.tsx`
- `components/admin/DfsAdminPanel.tsx`

Avoid duplicate business logic paths. Trades should not have competing execution paths.

## Build And Verification

Major tasks must attempt:

- `npm run lint`
- `npm run build`
- `npx tsc --noEmit`

If a command cannot run because of environment/dependency issues, report the exact command and exact error.

## Codex Execution Expectations

For substantial implementation tasks, do not optimize for a 5-10 minute patch. Work through internal milestones in the same run.

Do not respond with scope negotiation unless there is a hard technical blocker. If a task is large, complete the highest-priority milestones first and report Done / Partial / Blocked at the end.

Do not satisfy major app-overhaul prompts with tiny helper-only diffs or placeholder UI. Visible product behavior must change.

## Done When

A major admin task is not complete unless:

1. The requested UI behavior is visible.
2. Admin edit actions use modals instead of scroll-up forms.
3. Player import defaults to selected/current season.
4. Schedule import defaults to selected/current season.
5. Score entry opens in a modal and preloads existing stats where available.
6. Server-side validation exists for mutations touched by the task.
7. Build/lint/type commands are attempted.
8. Final response lists changed files by feature.
9. Final response marks acceptance criteria Done, Partially Done, or Blocked.
