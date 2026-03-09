-- Align DFS default-slate identity with next upcoming game day and keep fantasy scoring consistent.

alter table public.slates
  add column if not exists source_game_date date;

create index if not exists idx_slates_source_game_date on public.slates(source_game_date);

create unique index if not exists uniq_default_slate_by_source_game_date
  on public.slates(season_id, source_game_date)
  where is_default_weekly = true and source_game_date is not null;

-- Keep fantasy_points_v aligned with current DFS contest scoring model:
-- skater: 3*G + 2*A + weekly aggregate bonus (+5 at >=5 real points, +10 total at >=10)
-- goalie: 8*W - GA
create or replace view public.fantasy_points_v as
with goalie_wins as (
  select
    gs.player_id,
    g.season_id,
    sum(
      case
        when p.position ilike '%goal%'
         and ((gs.team_id = g.home_team and g.home_score > g.away_score)
           or (gs.team_id = g.away_team and g.away_score > g.home_score))
        then 1 else 0
      end
    )::int as wins
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
      then round((coalesce(gw.wins,0) * 8.0 - ps.goals_against)::numeric,2)
    else round((
      ps.goals * 3.0
      + ps.assists * 2.0
      + case when ps.points >= 10 then 10 when ps.points >= 5 then 5 else 0 end
    )::numeric,2)
  end as fantasy_points,
  round(
    case
      when ps.games_played > 0 then
        (case
          when ps.position ilike '%goal%'
            then (coalesce(gw.wins,0) * 8.0 - ps.goals_against)
          else (ps.goals * 3.0 + ps.assists * 2.0 + case when ps.points >= 10 then 10 when ps.points >= 5 then 5 else 0 end)
        end) / ps.games_played
      else 0
    end
  ,2) as fantasy_points_avg
from public.player_season_stats_v ps
left join goalie_wins gw on gw.player_id = ps.player_id and gw.season_id = ps.season_id;
