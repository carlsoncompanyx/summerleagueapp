-- MVP betting cleanup: keep game-based weekly markets only.
-- Add enum values for spread/total and prevent new legacy prop-style bets.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'bet_type' and e.enumlabel = 'spread'
  ) then
    alter type public.bet_type add value 'spread';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'bet_type' and e.enumlabel = 'total'
  ) then
    alter type public.bet_type add value 'total';
  end if;
end $$;

alter table public.bets
  drop constraint if exists bets_game_weekly_markets_only;

alter table public.bets
  add constraint bets_game_weekly_markets_only
  check (bet_type in ('moneyline', 'spread', 'total')) not valid;
