# Codex Admin Overhaul Execution Plan

## 1) Current Architecture Summary

### Admin dashboard surface
- `app/admin/page.tsx` gates server-rendered access using Supabase auth + profile role check, with `ADMIN_TEST_MODE` bypass outside production.
- `components/AdminClient.tsx` is a monolithic client component that:
  - Loads all admin datasets from a single `GET /api/admin/dashboard` call.
  - Executes all mutations through one `POST /api/admin/dashboard` endpoint using `action` strings.
  - Contains tab UI, forms, CSV import flow, score entry modal state, DFS tooling, and local filtering in one file.
- `app/api/admin/dashboard/route.ts` is currently a broad command-handler route that performs season/team/player/game/trade/registration mutations, score submission, and CSV imports.

### CSV import flow
- CSV parsing is client-side in `components/AdminClient.tsx` via `lib/csv/parse.ts`.
- Mapping is UI-driven and posted as normalized rows to `POST /api/admin/dashboard` actions:
  - `import_players_csv`
  - `import_games_csv`
- Server route resolves season/team identifiers using a mix of explicit row fields, season-name maps, and `resolveCurrentSeason` fallback.

### Score entry flow
- Score entry is initiated in `AdminClient` (`scores` tab) and posted via `game_score_submit` action.
- Server route updates `games` (`home_score`, `away_score`, `status='FINAL'`), deletes prior `game_stats`, and inserts replacement stat rows.
- No explicit transaction wrapper is present around update/delete/insert sequence.

### Season handling
- `lib/seasons/current.ts` provides `resolveCurrentSeason` with priority:
  1. explicit season id
  2. admin season filter
  3. registration window
  4. date-in-season window
  5. latest start date
- Current season is returned by `/api/admin/dashboard` and used by `AdminClient` to initialize season filter.
- Other routes (DFS/trades/open season endpoints) appear to use independent retrieval patterns rather than a unified season resolver contract.

### Trades flow
- `app/api/trades/route.ts` handles read/write for captain/admin trade lifecycle:
  - `propose`
  - `captain_response`
  - `admin_review`
- Status transition checks exist in-route (`ALLOWED_TRANSITIONS`) with history writes to `trade_status_history`.
- Final admin approval calls RPC `execute_trade_if_valid`.
- Admin dashboard also includes legacy trade mutation actions (`trade_propose`, `trade_approve`, `trade_reject`) in `app/api/admin/dashboard/route.ts`, creating duplicated responsibilities.

### DFS default contest flow
- `app/api/dfs/route.ts` handles slate/contest data retrieval and action-based mutations.
- Supports automated default slate generation (`auto_generate_default_next_slate_day` / `auto_generate_weekly_default`) and repricing through `buildSlateValuations`.
- `components/DfsClient.tsx` picks default contest client-side and drives lineup submission/update.
- Default flow currently couples contest recommendation, slate recommendation, and UI selection logic in one client component.

---

## 2) Files That Must Change

### Must update (existing)
1. `components/AdminClient.tsx`
   - Split monolithic concerns (tabs/forms/import/scoring/DFS controls) into composed components.
2. `app/api/admin/dashboard/route.ts`
   - Reduce command-surface; move to focused admin routes by domain.
3. `app/admin/page.tsx`
   - Keep auth gate, but align with new dashboard data bootstrapping contract.
4. `app/api/trades/route.ts`
   - Be the single authoritative trade mutation path; remove duplicated trade mutations from admin dashboard route.
5. `app/api/dfs/route.ts`
   - Separate default slate/contest generation operations from general GET/POST actions.
6. `lib/seasons/current.ts`
   - Harden and standardize resolver output for all relevant flows (admin, imports, trades/dfs defaults where applicable).
7. `lib/csv/parse.ts`
   - Add strict header normalization helper contract for imports.
8. `docs/supabase-field-mapping.md`
   - Update with final CSV schema/import assumptions and season/team resolution rules.

### Likely supporting updates
- `app/api/games/[gameId]/stats/route.ts` (align score/stat consistency contracts with admin score submission behavior).
- `app/dfs/page.tsx`, `components/DfsClient.tsx` (default contest UX alignment).
- `app/trades/page.tsx` (if UI currently depends on deprecated admin-dashboard trade actions).

---

## 3) Components That Must Be Created

Create the following under `components/admin/` (or equivalent folder):

1. `AdminDashboardShell.tsx`
   - Owns tab state, top-level role/testMode banners, and common season/team filters.
2. `AdminSeasonManager.tsx`
   - CRUD UI for seasons.
3. `AdminTeamManager.tsx`
   - CRUD UI for teams and captain assignment.
4. `AdminPlayerManager.tsx`
   - CRUD UI for players with team-season integrity prompts.
5. `AdminRegistrationManager.tsx`
   - Registration status updates and registration→player assignment.
6. `AdminScheduleManager.tsx`
   - Game create/update/delete UI.
7. `AdminScoreEntryManager.tsx`
   - Score + player stat entry UI with validation preview.
8. `AdminTradeReviewManager.tsx`
   - Read-only or actioned admin review wired to `/api/trades` only.
9. `AdminCsvImportModal.tsx`
   - Shared CSV upload/mapping/validation UI for players/games imports.
10. `AdminDfsOpsManager.tsx`
   - Admin DFS operations (slate generation, valuation/reprice controls).
11. `admin/hooks/useAdminDashboardData.ts`
   - Query/refetch helper for baseline admin datasets.
12. `admin/api.ts`
   - Typed client request wrappers replacing ad-hoc fetch calls.

---

## 4) API Routes That Must Change

### Refactor away from one giant mutation endpoint
- Keep `GET /api/admin/dashboard` for aggregated read model only.
- Decompose `POST /api/admin/dashboard` into domain routes:

1. `/api/admin/seasons` (POST/PATCH/DELETE)
2. `/api/admin/teams` (POST/PATCH/DELETE)
3. `/api/admin/players` (POST/PATCH/DELETE)
4. `/api/admin/registrations` (PATCH for status + assignment action)
5. `/api/admin/games` (POST/PATCH/DELETE)
6. `/api/admin/games/[gameId]/score` (POST transactional score/stat submission)
7. `/api/admin/import/players` (POST)
8. `/api/admin/import/games` (POST)
9. `/api/admin/dfs/defaults` (POST for default slate/day generation)

### Trade ownership
- Remove `trade_propose`, `trade_approve`, `trade_reject` action handlers from `app/api/admin/dashboard/route.ts`.
- Use `/api/trades` actions exclusively for all trade state transitions.

### Shared middleware/guards
- Introduce reusable admin guard helper for all `/api/admin/*` routes to avoid repeated role logic.

---

## 5) Database / Migration Risks

1. **Trade status consistency risk**
   - Two mutation surfaces currently exist (`/api/trades` and admin dashboard actions).
   - Risk: divergent status values/history entries and skipped RPC validation.

2. **Score submission atomicity risk**
   - Update game + delete stats + insert stats is not transactional.
   - Risk: partial writes (e.g., game finalized but stats missing).
   - Mitigation: create SQL function or transactional RPC for score submit.

3. **CSV import referential risk**
   - Season/team resolution may map incorrectly with duplicate names or stale filters.
   - Mitigation: strict validation report and dry-run mode response before insert.

4. **Season resolver drift risk**
   - If routes use different resolver logic, current-season behavior diverges across admin/DFS/trades.
   - Mitigation: centralize resolver usage and document precedence.

5. **DFS default generation race risk**
   - Concurrent default-slate generation may duplicate or reprice conflicting slates.
   - Mitigation: unique constraint on season/source date default flag + idempotent upsert path.

6. **Migration compatibility risk**
   - New routes may rely on constraints/indexes absent in older environments.
   - Mitigation: ship schema guard migrations first; deploy code after migration success.

---

## 6) Exact Implementation Phases

### Phase 0 — Baseline & Contract Lock
1. Snapshot current route payload/response contracts (admin dashboard, trades, dfs).
2. Add typed DTOs/interfaces for admin read model and mutations.
3. Write migration checklist and feature-flag plan.

### Phase 1 — Admin API Decomposition (No UI change yet)
1. Create `/api/admin/*` domain routes for seasons/teams/players/registrations/games/import.
2. Move score submission into `/api/admin/games/[gameId]/score`.
3. Keep old `POST /api/admin/dashboard` route temporarily as compatibility shim (delegating to new handlers).
4. Add shared admin auth guard utility.

### Phase 2 — Trades Consolidation
1. Remove trade mutation actions from admin dashboard POST handler.
2. Update admin UI trade actions to call `/api/trades` only.
3. Verify status transition history writes are preserved.

### Phase 3 — CSV Import Hardening
1. Implement server-side dry-run validation mode (`validate_only=true`).
2. Return structured error payloads (row index, field, reason, suggested fix).
3. Enforce deterministic season/team resolution precedence.
4. Add optional "target season required" mode for production safety.

### Phase 4 — Score Entry Reliability
1. Replace in-route multi-step write with transactional RPC/function.
2. Validate roster-team-season integrity for submitted stat rows.
3. Add idempotency key or optimistic check against stale edits.

### Phase 5 — Admin UI Modularization
1. Extract `AdminClient` into shell + manager components.
2. Introduce `useAdminDashboardData` hook and typed api client wrappers.
3. Move CSV/Score/DFS admin controls into dedicated components.

### Phase 6 — DFS Default Contest Flow Stabilization
1. Move default selection heuristics to API response (server recommended contest/slate pair).
2. Add explicit endpoint for default slate generation/reprice operations.
3. Ensure DfsClient consumes recommended IDs deterministically.

### Phase 7 — Season Handling Unification
1. Reuse `resolveCurrentSeason` (or improved successor) across admin import, open-season APIs, DFS defaults.
2. Add resolver reason telemetry in debug/admin responses.
3. Document and test edge windows (registration overlap, no active season).

### Phase 8 — Cleanup & Removal
1. Remove compatibility shim action handlers from `POST /api/admin/dashboard`.
2. Delete dead code paths and unused client state.
3. Final docs update and release notes.

---

## 7) Acceptance Criteria

1. Admin dashboard data load works for admin users and returns 403 for non-admin.
2. All admin CRUD/import/score actions execute via domain `/api/admin/*` routes (not action-switch monolith).
3. Trade lifecycle is handled exclusively through `/api/trades`; no duplicate mutation code remains.
4. Score submit is atomic: game finalization and stats upsert succeed/fail together.
5. CSV imports provide row-level deterministic validation and optional dry-run.
6. Season resolution behavior is consistent across dashboard defaults, imports, and DFS default generation.
7. DFS lobby receives a server-recommended contest/slate pair and uses it without client-side ambiguity.
8. `components/AdminClient.tsx` no longer exceeds shell responsibilities (modularized managers in place).
9. Docs describe new route contracts and CSV field expectations.

---

## 8) Test / Build Commands

Run in this order during implementation PR(s):

1. `npm ci`
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm run build`
5. `npm run test:e2e` (if Playwright configured in environment)
6. Targeted route tests (to be added):
   - admin route auth/403 checks
   - csv validation dry-run cases
   - score submission atomicity case
   - trade transition matrix checks
   - dfs recommended contest/slate selection

Recommended ad-hoc verification commands:
- `rg "action === 'trade_" app/api/admin/dashboard/route.ts`
- `rg "POST\s*\(/api/admin/dashboard|/api/admin/" -n components app`

---

## 9) Risks and Rollback Notes

### Primary risks
- Breaking existing admin UI during route decomposition.
- Incomplete migration ordering causing runtime SQL errors.
- Silent behavior changes in season resolution affecting imports/defaults.
- DFS default flow regressions causing no contest selection.

### Rollback strategy
1. Keep compatibility shim in `POST /api/admin/dashboard` until Phase 8.
2. Feature flag new admin endpoints/UI path (`ADMIN_API_V2=true`) with fallback to legacy path.
3. Deploy migrations first; verify DB health before enabling new code path.
4. Preserve prior stable commit hash for fast redeploy rollback.
5. Add monitoring on admin 4xx/5xx, import failure rates, and DFS contest load anomalies for first 24h after release.

### Operational notes
- Rollback must include both app code and any forward-only migration implications.
- If transactional score RPC is introduced, keep old non-transactional path behind emergency flag for one release window only.
