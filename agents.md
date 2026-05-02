# AGENTS.md

## Project

Emerald Coast Roller League / summer roller hockey app.

This app should become a functional league-management platform, not a bare MVP. It combines:
- TeamLinkt-style league management
- ESPN-style rosters, schedules, standings, and stats
- DraftKings-style weekly fantasy/DFS
- Captain trade management
- Admin tools for seasons, teams, players, scores, imports, registrations, trades, and DFS

## Stack

- Next.js App Router
- React 19
- TypeScript
- Supabase
- Vercel

## Highest product priorities

Prioritize admin functionality and real usability over cosmetic-only changes.

Most important workflows:
1. Current season handling
2. Admin dashboard usability
3. Player import
4. Schedule import
5. Score/stat entry
6. Team/player editing
7. Trade review
8. DFS slate/contest management

## Admin UX rules

Do not use giant always-open admin forms.

Edit actions must open modal dialogs near the current context. Do not make admins scroll up to find the form they are editing.

Required modal-based workflows:
- Add/edit season
- Add/edit team
- Add/edit player
- Add/edit game
- Import players
- Import schedule
- Enter/update score
- Review trade

Admin tables should remain visible behind modals.

Every mutation should show:
- pending/loading state
- validation errors
- useful success/failure message
- no silent failure

The admin dashboard should default to the current working season, not all seasons.

Mobile admin layout must be usable:
- tables may scroll horizontally
- modals should fit mobile screens
- buttons need pointer cursor, hover, and focus states

## Season rules

The app should consistently resolve a current working season.

Resolution priority:
1. Explicit season_id from UI/request
2. Admin selected season if not "all"
3. Season with currently open registration window
4. Season where today is between start_date and end_date
5. Most recent season by start_date
6. Clear error if no season exists

CSV imports should not require a season column when the UI/app already knows the current or selected season.

## CSV import rules

Player import must default to the selected/current working season.

Schedule import must default to the selected/current working season.

CSV imports need:
- preview/dry-run mode
- row-level validation
- row-level errors
- inserted count
- updated count
- skipped count
- error count

Player CSV flexible headers:
- name
- player_name
- full_name
- first_name + last_name
- team
- team_name
- jersey
- jersey_number
- number
- no
- position
- pos
- email
- user_email
- grade
- notes

Schedule CSV flexible headers:
- date
- time
- scheduled_at
- home_team
- away_team
- home
- away
- location
- status

Team matching should be:
- scoped to selected/current season
- case-insensitive
- whitespace-trimmed
- tolerant of simple punctuation differences

Blank team for player import should create an unassigned player in the target season.

## Score entry rules

Score entry should open in a modal.

If a game already has stats, preload existing game_stats.

If no stats exist, preload rostered players from the home and away teams.

Skaters:
- GP
- goals
- assists

Goalies:
- GP
- goals against

Saving scores should:
- update game score
- save stats
- mark final when appropriate
- avoid accidental stat wipes
- use a transaction/RPC if available

## DFS rules

Current lineup:
- Captain
- 4 skaters
- 1 goalie

Captain:
- 1.5x fantasy points
- 1.5x salary

Skaters:
- goal = 3
- assist = 2
- weekly real point bonus: +5 at 5 points
- additional weekly real point bonus: +5 at 10 points

Goalies:
- win = 8
- goal against = -1

Normal users should default to the next open/playable contest. Do not make a contest dropdown the main first interaction unless there are multiple meaningful contests.

## Supabase and security rules

Keep service-role or secret Supabase keys server-only.

Do not import server/admin Supabase clients into client components.

Client fetch calls must check res.ok.

Route handlers must return useful errors.

Do not silently swallow Supabase errors.

Admin API routes must enforce server-side admin authorization. Client-side hiding is not enough.

## Code organization rules

Prefer small, focused components over one large component.

The old giant AdminClient should become a thin shell/wrapper or be replaced by an admin shell plus manager components.

Preferred admin structure:
- components/admin/AdminShell.tsx
- components/admin/AdminTabs.tsx
- components/admin/AdminModal.tsx
- components/admin/ConfirmDialog.tsx
- components/admin/AdminDashboardHome.tsx
- components/admin/SeasonManager.tsx
- components/admin/TeamManager.tsx
- components/admin/PlayerManager.tsx
- components/admin/GameManager.tsx
- components/admin/ScoreEntryModal.tsx
- components/admin/CsvImportModal.tsx
- components/admin/TradeReviewPanel.tsx
- components/admin/DfsAdminPanel.tsx

Avoid duplicate business logic paths. Trades should not have competing execution paths.

## Build and verification

Attempt these before finishing major tasks:
- npm run lint
- npm run build
- npx tsc --noEmit if available

If a command cannot run because of environment/dependency issues, report the exact command and error.

## Done means

A major admin task is not complete unless:
1. The requested UI behavior is visible.
2. Admin edit actions use modals instead of scroll-up forms.
3. Player import defaults to selected/current season.
4. Schedule import defaults to selected/current season when changed.
5. Score entry opens in a modal and preloads existing stats where available.
6. Server-side validation exists for mutations touched by the task.
7. Build/lint/test commands are attempted.
8. Final response lists changed files by feature.
9. Final response marks acceptance criteria Done, Partially Done, or Blocked.

Do not satisfy major app-overhaul prompts by only adding helper files or making tiny route changes. For admin-overhaul tasks, meaningful component refactoring and visible workflow improvement are required.
