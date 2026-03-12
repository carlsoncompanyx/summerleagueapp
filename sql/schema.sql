-- ECRL schema + RLS (Supabase Postgres)
create extension if not exists pgcrypto;

create type public.app_role as enum ('ADMIN','CAPTAIN','PLAYER','FAN');
create type public.game_status as enum ('SCHEDULED','LIVE','FINAL','CANCELED');
create type public.trade_status as enum ('proposed','accepted_by_other','declined','admin_approved','admin_declined','completed');
create type public.bet_type as enum ('moneyline','player_goals_over_0_5','player_points_over_0_5');
create type public.bet_status as enum ('open','won','lost','voided');
create type public.wallet_tx_type as enum ('credit','debit','purchase','bet','settlement','refund','manual_adjustment');

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  contact text,
  role public.app_role not null default 'FAN',
  team_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  waiver_text text,
  rules text,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,
  logo_url text,
  captain_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_team_fk foreign key (team_id) references public.teams(id) on delete set null;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(season_id, user_id)
);


alter table public.registrations
add column if not exists preferred_positions text[];

alter table public.registrations
add column if not exists experience text;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  jersey int,
  position text,
  nickname text,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  primary key(team_id, user_id)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  home_team uuid not null references public.teams(id),
  away_team uuid not null references public.teams(id),
  scheduled_at timestamptz not null,
  location text,
  status public.game_status not null default 'SCHEDULED',
  home_score int not null default 0,
  away_score int not null default 0,
  finalized_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);


create table if not exists public.game_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  season_id uuid,
  team_id uuid references public.teams(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  position text,
  games_played int not null default 0,
  goals int not null default 0,
  assists int not null default 0,
  goals_against int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  type text not null,
  player_id uuid references public.players(id),
  assist_player_id uuid references public.players(id),
  minutes int,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_int int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.wallet_tx_type not null,
  amount_int int not null,
  ref_type text,
  ref_id text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.beer_bucks_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  beer_bucks_amount int not null,
  price_usd_cents int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  bet_type public.bet_type not null,
  target_team_id uuid references public.teams(id),
  target_player_id uuid references public.players(id),
  line numeric(6,2),
  odds numeric(6,2) not null,
  stake_int int not null,
  status public.bet_status not null default 'open',
  payout_int int,
  created_at timestamptz not null default now()
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  from_team_id uuid not null references public.teams(id),
  to_team_id uuid not null references public.teams(id),
  proposed_by uuid not null references auth.users(id),
  players_out uuid[] not null,
  players_in uuid[] not null,
  message text,
  status public.trade_status not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  message text not null,
  reported boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  reported_by uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

create or replace function public.current_role() returns public.app_role language sql stable as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean language sql stable as $$
  select public.current_role() = 'ADMIN'::public.app_role
$$;

create or replace function public.credit_wallet(
  p_user_id uuid,
  p_amount int,
  p_ref_type text,
  p_ref_id text,
  p_idempotency_key text
) returns void language plpgsql security definer as $$
begin
  insert into public.wallet(user_id, balance_int) values (p_user_id, 0)
  on conflict(user_id) do nothing;

  insert into public.wallet_transactions(user_id, type, amount_int, ref_type, ref_id, idempotency_key)
  values (p_user_id, 'purchase', p_amount, p_ref_type, p_ref_id, p_idempotency_key)
  on conflict(idempotency_key) do nothing;

  if found then
    update public.wallet set balance_int = balance_int + p_amount, updated_at = now() where user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.compute_odds(p_game_id uuid)
returns table(home_odds numeric, away_odds numeric) language sql stable as $$
  select 1.90::numeric, 1.90::numeric
$$;

create or replace function public.place_bet(
  p_game_id uuid,
  p_bet_type public.bet_type,
  p_target_team_id uuid,
  p_target_player_id uuid,
  p_line numeric,
  p_odds numeric,
  p_stake_int int
) returns uuid language plpgsql security definer as $$
declare
  v_game public.games;
  v_id uuid;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.scheduled_at <= now() then raise exception 'Bets are locked'; end if;

  update public.wallet set balance_int = balance_int - p_stake_int where user_id = auth.uid() and balance_int >= p_stake_int;
  if not found then raise exception 'Insufficient balance'; end if;

  insert into public.wallet_transactions(user_id, type, amount_int, ref_type, ref_id)
  values (auth.uid(), 'bet', -p_stake_int, 'game', p_game_id::text);

  insert into public.bets(user_id, game_id, bet_type, target_team_id, target_player_id, line, odds, stake_int)
  values (auth.uid(), p_game_id, p_bet_type, p_target_team_id, p_target_player_id, p_line, p_odds, p_stake_int)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.settle_bets(p_game_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.bets b
  set status = case
    when g.status = 'CANCELED' then 'voided'::public.bet_status
    when b.bet_type = 'moneyline' and ((g.home_score > g.away_score and b.target_team_id = g.home_team) or (g.away_score > g.home_score and b.target_team_id = g.away_team)) then 'won'::public.bet_status
    else 'lost'::public.bet_status
  end,
  payout_int = case
    when g.status = 'CANCELED' then b.stake_int
    when b.bet_type = 'moneyline' and ((g.home_score > g.away_score and b.target_team_id = g.home_team) or (g.away_score > g.home_score and b.target_team_id = g.away_team)) then floor(b.stake_int * b.odds)::int
    else 0
  end
  from public.games g
  where b.game_id = g.id and b.game_id = p_game_id and b.status = 'open';

  insert into public.wallet_transactions(user_id, type, amount_int, ref_type, ref_id)
  select user_id,
         case when status = 'voided' then 'refund'::public.wallet_tx_type else 'settlement'::public.wallet_tx_type end,
         payout_int,
         'bet',
         id::text
  from public.bets where game_id = p_game_id and payout_int > 0;

  update public.wallet w
  set balance_int = balance_int + x.total
  from (select user_id, coalesce(sum(payout_int),0)::int as total from public.bets where game_id = p_game_id group by user_id) x
  where w.user_id = x.user_id;
end;
$$;



-- Canonical model updates from later migrations:
-- Active participation model: players (season_id + user_id) is source-of-truth.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;
alter table public.profiles
  alter column display_name drop not null;

alter table public.players
  add column if not exists season_id uuid references public.seasons(id) on delete cascade;

create index if not exists idx_players_season_id on public.players(season_id);
create unique index if not exists uniq_players_user_season_nonnull
  on public.players(user_id, season_id)
  where user_id is not null and season_id is not null;

-- Legacy/de-emphasized tables kept for compatibility:
-- registrations, team_members, and profiles.team_id are no longer authoritative roster truth.

create table if not exists public.trade_status_history (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  from_status public.trade_status,
  to_status public.trade_status not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

create table if not exists public.player_projection_overrides (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  projection_points numeric(8,2) not null,
  salary_override int,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, player_id)
);

create table if not exists public.slates (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,
  lock_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','published','locked','complete')),
  created_by uuid references auth.users(id),
  week_start_date date,
  source_game_date date,
  is_default_weekly boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.slate_games (
  id uuid primary key default gen_random_uuid(),
  slate_id uuid not null references public.slates(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  unique(slate_id, game_id)
);

create table if not exists public.slate_players (
  id uuid primary key default gen_random_uuid(),
  slate_id uuid not null references public.slates(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  position text,
  salary int not null,
  projection_points numeric(8,2) not null,
  baseline_points numeric(8,2) not null default 0,
  availability_status text not null default 'AVAILABLE' check (availability_status in ('AVAILABLE','QUESTIONABLE','OUT')),
  availability_projection_backup numeric(8,2),
  created_at timestamptz not null default now(),
  unique(slate_id, player_id)
);

create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  slate_id uuid not null references public.slates(id) on delete cascade,
  name text not null,
  entry_fee_cents int not null default 1000,
  salary_cap int not null default 50000,
  max_entries int not null default 5,
  lock_at timestamptz,
  roster_config jsonb not null default '{"CAPTAIN":1,"SKATER":4,"GOALIE":1}'::jsonb,
  status text not null default 'open',
  created_by uuid references auth.users(id),
  is_default_weekly boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lineup_name text,
  salary_used int not null default 0,
  projected_points numeric(8,2) not null default 0,
  actual_points numeric(8,2),
  created_at timestamptz not null default now()
);

create table if not exists public.contest_entry_players (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.contest_entries(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  slate_player_id uuid references public.slate_players(id) on delete set null,
  slot text not null,
  salary_snapshot int not null,
  projection_snapshot numeric(8,2) not null,
  created_at timestamptz not null default now(),
  unique(entry_id, slot)
);

create table if not exists public.contest_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  entry_id uuid not null references public.contest_entries(id) on delete cascade,
  rank int not null,
  projected_points numeric(8,2) not null default 0,
  actual_points numeric(8,2) not null default 0,
  created_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now(),
  unique(normalized_player_name, season_label, source)
);

create table if not exists public.player_valuation_inputs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  min_sample_games int not null default 2,
  fallback_position_baseline numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(season_id, player_id)
);

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.teams enable row level security;
alter table public.registrations enable row level security;
alter table public.players enable row level security;
alter table public.team_members enable row level security;
alter table public.games enable row level security;
alter table public.game_events enable row level security;
alter table public.game_stats enable row level security;
alter table public.wallet enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.beer_bucks_packages enable row level security;
alter table public.bets enable row level security;
alter table public.trades enable row level security;
alter table public.chat_messages enable row level security;
alter table public.message_reports enable row level security;

create policy profiles_select_all on public.profiles for select to authenticated using (true);
create policy profiles_insert_self on public.profiles for insert to authenticated with check (auth.uid() = user_id or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

create policy seasons_read on public.seasons for select to authenticated using (true);
create policy seasons_admin_write on public.seasons for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy teams_read on public.teams for select to authenticated using (true);
create policy teams_admin_write on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());


create policy registrations_select_self on public.registrations for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy registrations_insert_self on public.registrations for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy registrations_update_self_or_admin on public.registrations for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy players_read on public.players for select to authenticated using (true);
create policy players_update_self_or_captain_or_admin on public.players for update to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or (
    public.current_role() = 'CAPTAIN'::public.app_role and
    exists (select 1 from public.teams t where t.id = players.team_id and t.captain_user_id = auth.uid())
  )
)
with check (
  public.is_admin()
  or user_id = auth.uid()
  or (
    public.current_role() = 'CAPTAIN'::public.app_role and
    exists (select 1 from public.teams t where t.id = players.team_id and t.captain_user_id = auth.uid())
  )
);

create policy games_read on public.games for select to authenticated using (true);
create policy games_admin_write on public.games for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy events_read on public.game_events for select to authenticated using (true);
create policy events_admin_write on public.game_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy game_stats_read on public.game_stats for select to authenticated using (true);
create policy game_stats_admin_write on public.game_stats for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy wallet_select_self on public.wallet for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy wallet_tx_select_self on public.wallet_transactions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy bets_rw_self on public.bets for all to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy packages_read on public.beer_bucks_packages for select to authenticated using (true);
create policy packages_admin_write on public.beer_bucks_packages for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy trades_select on public.trades for select to authenticated using (true);
create policy trades_captain_insert on public.trades for insert to authenticated
with check (
  public.current_role() = 'CAPTAIN'::public.app_role and
  exists (select 1 from public.teams t where t.id = from_team_id and t.captain_user_id = auth.uid())
);
create policy trades_update_target_captain_or_admin on public.trades for update to authenticated
using (
  public.is_admin() or exists (select 1 from public.teams t where t.id = trades.to_team_id and t.captain_user_id = auth.uid())
)
with check (
  public.is_admin() or exists (select 1 from public.teams t where t.id = trades.to_team_id and t.captain_user_id = auth.uid())
);

create policy chat_read on public.chat_messages for select to authenticated using (true);
create policy chat_insert_auth on public.chat_messages for insert to authenticated with check (auth.uid() = user_id);
create policy chat_delete_admin on public.chat_messages for delete to authenticated using (public.is_admin());

create policy reports_insert on public.message_reports for insert to authenticated with check (reported_by = auth.uid());
create policy reports_select_admin on public.message_reports for select to authenticated using (public.is_admin());
