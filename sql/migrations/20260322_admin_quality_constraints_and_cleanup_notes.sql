-- Product-quality safety constraints for admin imports, DFS grading, and score entry.
-- This migration is intentionally non-destructive: it skips unique indexes if existing
-- duplicate rows need manual review, and it does not drop obsolete tables.

alter table public.contests
  alter column roster_config set default '{"CAPTAIN":1,"SKATER":4,"GOALIE":1}'::jsonb;

do $$
begin
  if exists (
    select 1
    from public.player_valuation_inputs
    group by season_id, player_id
    having count(*) > 1
  ) then
    raise notice 'Skipped unique index on player_valuation_inputs(season_id, player_id): duplicate rows exist.';
  else
    create unique index if not exists uniq_player_valuation_inputs_season_player_idx
      on public.player_valuation_inputs(season_id, player_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from public.game_stats
    where player_id is not null
    group by game_id, player_id
    having count(*) > 1
  ) then
    raise notice 'Skipped unique index on game_stats(game_id, player_id): duplicate rows exist.';
  else
    create unique index if not exists uniq_game_stats_game_player_idx
      on public.game_stats(game_id, player_id)
      where player_id is not null;
  end if;
end $$;

create index if not exists idx_games_season_scheduled_teams
  on public.games(season_id, scheduled_at, home_team, away_team);

comment on table public.forum_threads is 'Deferred cleanup candidate: legacy forum table. Keep until Chat-only replacement is confirmed in production.';
comment on table public.forum_posts is 'Deferred cleanup candidate: legacy forum table. Keep until Chat-only replacement is confirmed in production.';
comment on table public.game_events is 'Deferred cleanup candidate: currently unused by score/stat entry. Do not drop until event workflow is audited.';
comment on table public.beer_bucks_packages is 'Deferred cleanup candidate: wallet/betting commerce table not currently surfaced in the product UI.';
comment on table public.wallet is 'Deferred cleanup candidate: wallet tables are retained for historical betting/payment references.';
comment on table public.wallet_transactions is 'Deferred cleanup candidate: wallet tables are retained for historical betting/payment references.';
comment on table public.bets is 'Deferred cleanup candidate: betting persistence exists, while current UI remains picks-only/not real money.';
