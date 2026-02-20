# Emerald Coast Roller League (ECRL) MVP

Mobile-first PWA-first Next.js app with Supabase auth/data/realtime/storage and Stripe Beer Bucks purchase flow.

## Features shipped
- Stripe is feature-flagged off by default to avoid preview/runtime failures until payment launch.
- Role model: `ADMIN`, `CAPTAIN`, `PLAYER`, `FAN` with UI gating helpers.
- Tabs: Home, Schedule, Standings, Leaders, Betting, Wallet, Trades, Shit Talk, Admin.
- PWA basics: `manifest.json`, service worker registration, install prompt helper.
- Stripe routes:
  - `POST /api/stripe/create-checkout-session`
  - `POST /api/stripe/webhook` (signature verification + idempotency)
- Supabase SQL deliverables:
  - Full schema DDL
  - RLS enabled for all tables
  - policies for admin-only score/stats control and role restrictions
  - seed data for season/teams/games/packages
- Betting RPCs: compute odds, place bet, settle bets.

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `APP_BASE_URL`
- `STRIPE_ENABLED` (`false` by default; set `true` to activate checkout/webhook processing)

## Local dev
1. Create a Supabase project.
2. Run `sql/schema.sql` then `sql/seed.sql` in SQL Editor.
3. Add env vars to `.env.local`.
4. Install and run:
   - `npm install`
   - `npm run dev`
5. Open `http://localhost:3000`.

## Deployment (Vercel + Supabase)
1. Push repo to Git provider.
2. Import into Vercel.
3. Configure all env vars.
4. Deploy.
5. Configure Stripe webhook URL to `https://<your-domain>/api/stripe/webhook`.

## Notes on auth/realtime/storage
- Auth: Supabase email/password, optional magic link.
- Realtime chat: subscribe to `chat_messages` via Supabase Realtime client.
- Storage: user avatars/logos in Supabase Storage buckets.

## Timezone
All league scheduling and display assumptions are `America/Chicago`.

## Output tree
See repository tree from `find . -maxdepth 3 -type f` (excluding `node_modules`).
