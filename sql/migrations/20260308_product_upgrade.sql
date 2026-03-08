-- Product sprint upgrade: real stats, DFS scaffolding, trade workflow history, community forum

create table if not exists public.player_projection_overrides (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  projection_points numeric(8,2) not null,
  salary_override int,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (season_id, player_id)
);

create table if not exists public.trade_status_history (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  from_status public.trade_status,
  to_status public.trade_status not null,
  changed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.slates (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,
  lock_at timestamptz not null,
  status text not null default 'open',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.slate_games (
  id uuid primary key default gen_random_uuid(),
  slate_id uuid not null references public.slates(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
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
  baseline_points numeric(8,2) not null,
  created_at timestamptz not null default now(),
  unique(slate_id, player_id)
);

create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  slate_id uuid not null references public.slates(id) on delete cascade,
  name text not null,
  entry_fee_cents int not null default 0,
  salary_cap int not null default 50000,
  max_entries int not null default 5,
  roster_config jsonb not null default '{"G":1,"F":2,"D":2,"UTIL":1}',
  lock_at timestamptz not null,
  status text not null default 'open',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lineup_name text,
  projected_points numeric(8,2) not null default 0,
  actual_points numeric(8,2) not null default 0,
  salary_used int not null default 0,
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
  actual_points numeric(8,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(entry_id, slot)
);

create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace view public.player_season_stats_v as
select
  g.season_id,
  gs.player_id,
  p.team_id,
  p.name,
  p.position,
  count(distinct gs.game_id)::int as games_played,
  coalesce(sum(gs.goals),0)::int as goals,
  coalesce(sum(gs.assists),0)::int as assists,
  coalesce(sum(gs.goals_against),0)::int as goals_against,
  coalesce(sum(gs.goals),0)::int + coalesce(sum(gs.assists),0)::int as points,
  avg((coalesce(gs.goals,0)+coalesce(gs.assists,0))::numeric)::numeric(8,2) as recent_form
from public.game_stats gs
join public.games g on g.id = gs.game_id
join public.players p on p.id = gs.player_id
group by g.season_id, gs.player_id, p.team_id, p.name, p.position;

-- Simple starter fantasy formula (easy to tune):
-- skaters: 3*G + 2*A + 0.5*GP
-- goalies: 3*W + 0.4*GP - 0.6*GA
create or replace view public.fantasy_points_v as
with goalie_wins as (
  select gs.player_id, g.season_id,
         sum(case when p.position ilike '%goal%' and ((p.team_id = g.home_team and g.home_score > g.away_score) or (p.team_id = g.away_team and g.away_score > g.home_score)) then 1 else 0 end)::int as wins
  from public.game_stats gs
  join public.games g on g.id = gs.game_id
  join public.players p on p.id = gs.player_id
  group by gs.player_id, g.season_id
)
select
  ps.season_id,
  ps.player_id,
  ps.team_id,
  ps.name,
  ps.position,
  ps.games_played,
  ps.goals,
  ps.assists,
  ps.points,
  ps.goals_against,
  coalesce(gw.wins,0) as wins,
  case
    when ps.position ilike '%goal%'
      then round((coalesce(gw.wins,0) * 3.0 + ps.games_played * 0.4 - ps.goals_against * 0.6)::numeric,2)
    else round((ps.goals * 3.0 + ps.assists * 2.0 + ps.games_played * 0.5)::numeric,2)
  end as fantasy_points,
  round(
    case
      when ps.games_played > 0 then
        (case when ps.position ilike '%goal%'
          then (coalesce(gw.wins,0) * 3.0 + ps.games_played * 0.4 - ps.goals_against * 0.6)
          else (ps.goals * 3.0 + ps.assists * 2.0 + ps.games_played * 0.5)
        end) / ps.games_played
      else 0
    end
  ,2) as fantasy_points_avg
from public.player_season_stats_v ps
left join goalie_wins gw on gw.player_id = ps.player_id and gw.season_id = ps.season_id;

create or replace view public.team_season_stats_v as
with finals as (
  select * from public.games where status = 'FINAL'
),
rows as (
  select season_id, home_team as team_id, home_score as gf, away_score as ga,
         case when home_score > away_score then 1 else 0 end as wins,
         case when home_score < away_score then 1 else 0 end as losses
  from finals
  union all
  select season_id, away_team as team_id, away_score as gf, home_score as ga,
         case when away_score > home_score then 1 else 0 end,
         case when away_score < home_score then 1 else 0 end
  from finals
)
select
  r.season_id,
  r.team_id,
  t.name as team_name,
  count(*)::int as gp,
  sum(r.wins)::int as wins,
  sum(r.losses)::int as losses,
  sum(r.gf)::int as goals_for,
  sum(r.ga)::int as goals_against,
  (sum(r.gf)-sum(r.ga))::int as goal_diff,
  (sum(r.wins)*2)::int as points
from rows r
join public.teams t on t.id = r.team_id
group by r.season_id, r.team_id, t.name;

alter table public.player_projection_overrides enable row level security;
alter table public.trade_status_history enable row level security;
alter table public.slates enable row level security;
alter table public.slate_games enable row level security;
alter table public.slate_players enable row level security;
alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_entry_players enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;

create policy projection_overrides_read on public.player_projection_overrides for select to authenticated using (true);
create policy projection_overrides_admin_write on public.player_projection_overrides for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy trade_history_read on public.trade_status_history for select to authenticated using (true);
create policy trade_history_write on public.trade_status_history for insert to authenticated with check (public.is_admin() or auth.uid() = changed_by);

create policy slates_read on public.slates for select to authenticated using (true);
create policy slates_admin_write on public.slates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy slate_games_read on public.slate_games for select to authenticated using (true);
create policy slate_games_admin_write on public.slate_games for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy slate_players_read on public.slate_players for select to authenticated using (true);
create policy slate_players_admin_write on public.slate_players for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy contests_read on public.contests for select to authenticated using (true);
create policy contests_admin_write on public.contests for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy contest_entries_read on public.contest_entries for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy contest_entries_insert on public.contest_entries for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy contest_entry_players_read on public.contest_entry_players for select to authenticated using (true);
create policy contest_entry_players_insert on public.contest_entry_players for insert to authenticated with check (true);

create policy forum_threads_read on public.forum_threads for select to authenticated using (deleted_at is null);
create policy forum_threads_insert on public.forum_threads for insert to authenticated with check (auth.uid() = author_id);
create policy forum_threads_update on public.forum_threads for update to authenticated using (auth.uid() = author_id or public.is_admin()) with check (auth.uid() = author_id or public.is_admin());
create policy forum_posts_read on public.forum_posts for select to authenticated using (deleted_at is null);
create policy forum_posts_insert on public.forum_posts for insert to authenticated with check (auth.uid() = author_id);
create policy forum_posts_update on public.forum_posts for update to authenticated using (auth.uid() = author_id or public.is_admin()) with check (auth.uid() = author_id or public.is_admin());
