-- DFS + fantasy research upgrade: historical season totals + valuation inputs + lifecycle statuses

create extension if not exists unaccent;

create or replace function public.normalize_player_name(input text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(unaccent(coalesce(input,''))), '[^a-z0-9]+', ' ', 'g'))
$$;

create table if not exists public.player_historical_season_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete set null,
  player_name_raw text not null,
  normalized_player_name text not null,
  season_label text not null,
  goals int not null default 0,
  assists int not null default 0,
  points int generated always as (goals + assists) stored,
  source text not null default 'csv_import',
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hist_player_name on public.player_historical_season_stats(normalized_player_name);
create index if not exists idx_hist_player_id on public.player_historical_season_stats(player_id);
create unique index if not exists idx_hist_unique_source_row
  on public.player_historical_season_stats(normalized_player_name, season_label, source);

create table if not exists public.player_valuation_inputs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  min_sample_games int not null default 2,
  fallback_position_baseline numeric(8,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(season_id, player_id)
);

alter table public.slates
  add column if not exists status text not null default 'draft';

alter table public.contests
  add column if not exists status text not null default 'draft';

alter table public.contests
  add column if not exists projected_payout_json jsonb default '{}'::jsonb;

create table if not exists public.contest_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  entry_id uuid not null references public.contest_entries(id) on delete cascade,
  rank int not null,
  projected_points numeric(8,2) not null default 0,
  actual_points numeric(8,2) not null default 0,
  snapshot_at timestamptz not null default now(),
  unique(contest_id, entry_id, snapshot_at)
);

alter table public.player_historical_season_stats enable row level security;
alter table public.player_valuation_inputs enable row level security;
alter table public.contest_leaderboard_snapshots enable row level security;

create policy hist_stats_read on public.player_historical_season_stats
  for select to authenticated using (true);
create policy hist_stats_admin_write on public.player_historical_season_stats
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy valuation_inputs_read on public.player_valuation_inputs
  for select to authenticated using (true);
create policy valuation_inputs_admin_write on public.player_valuation_inputs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy leaderboard_snapshots_read on public.contest_leaderboard_snapshots
  for select to authenticated using (true);
create policy leaderboard_snapshots_admin_write on public.contest_leaderboard_snapshots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
