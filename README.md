# Emerald Coast Roller League (ECRL) MVP

Mobile-first Next.js + Supabase app focused on:
- League HQ (Home, Games, Standings, Statistics)
- Contest-first DFS lineup play
- Community (Chat + Forums)
- Weekly game betting lines (moneyline/spread/total)

## Product surfaces
- `/` Home dashboard
- `/schedule` Games
- `/standings` Standings
- `/statistics` Statistics
- `/dfs` DFS contest lobby + dedicated lineup builder
- `/chat` Community
- `/betting` Weekly betting markets

## Core backend
- Supabase Postgres + RLS
- Next.js server/client Supabase integration
- SQL migrations under `sql/migrations`

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional Stripe vars (kept for future purchase flows, not public MVP focus in this sprint)

## Local development
1. Run schema + seed in Supabase SQL editor (`sql/schema.sql`, `sql/seed.sql`).
2. Configure `.env.local`.
3. `npm install`
4. `npm run dev`

## Testing
- Type-check: `npx tsc --noEmit`
- E2E (optional): `npm run test:e2e`


## Product notes
- Public date/time display is standardized with a shared formatter (`America/Chicago`).
- DFS auto-loads the next active contest (no public contest dropdown).
- Goalie salary baseline is normalized for MVP slate pricing fairness.
- Deprecated public routes: `/leaders` redirects to `/statistics`, `/wallet` redirects to `/betting`.

- Session-aware server auth now uses Supabase SSR helpers + middleware so server role checks (including Admin) use real signed-in sessions.
- Public/Admin/DFS date-time display and slate-day grouping now consistently use league timezone (`America/Chicago`).
