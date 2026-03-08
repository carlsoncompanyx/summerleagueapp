# API / RPC Reference

## Next.js API routes

### `POST /api/stripe/create-checkout-session`
Body:
```json
{ "packageId": "<uuid>", "userId": "<uuid>" }
```
Returns:
```json
{ "url": "https://checkout.stripe.com/..." }
```

### `POST /api/stripe/webhook`
Stripe webhook endpoint with signature verification + idempotency.

## Supabase RPC functions

### `compute_odds(p_game_id uuid)`
Returns `{ home_odds, away_odds }` currently fixed at 1.90/1.90.

### `place_bet(...)`
Debits wallet, validates lock time, inserts bet.

### `settle_bets(p_game_id uuid)`
Settles all open bets when game is FINAL/CANCELED and credits wallet.

### `credit_wallet(...)`
Webhook-safe wallet credit using idempotency key.
