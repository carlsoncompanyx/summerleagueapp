-- Demo stabilization schema sync for DFS defaults + trade payload compatibility.

alter table public.slates
  add column if not exists is_default_weekly boolean not null default false,
  add column if not exists week_start_date date,
  add column if not exists source_game_date date;

alter table public.contests
  add column if not exists is_default_weekly boolean not null default false;

-- Ensure trades payload columns expected by current trade workflow exist.
alter table public.trades
  add column if not exists players_out uuid[] not null default '{}',
  add column if not exists players_in uuid[] not null default '{}';

-- Best-effort backfill from older single-player trade column patterns if present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trades' and column_name = 'player_id'
  ) then
    execute $$
      update public.trades
      set players_out = case
        when coalesce(array_length(players_out, 1), 0) = 0 and player_id is not null then array[player_id]
        else players_out
      end,
      players_in = case
        when coalesce(array_length(players_in, 1), 0) = 0 and player_id is not null then array[player_id]
        else players_in
      end
    $$;
  end if;
end
$$;

create index if not exists idx_slates_default_source_date
  on public.slates(season_id, source_game_date)
  where is_default_weekly = true and source_game_date is not null;

create index if not exists idx_contests_default_flag on public.contests(is_default_weekly);
