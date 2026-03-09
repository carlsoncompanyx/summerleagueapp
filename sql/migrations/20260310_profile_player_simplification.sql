-- Simplify identity and season participation model around profiles + players

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

-- Backfill first/last name from display_name best-effort for existing rows.
update public.profiles
set
  first_name = coalesce(nullif(split_part(display_name, ' ', 1), ''), first_name, 'Unknown'),
  last_name = coalesce(
    nullif(trim(regexp_replace(display_name, '^\S+\s*', '')), ''),
    last_name,
    ''
  )
where first_name is null or last_name is null;

alter table public.profiles
  alter column display_name drop not null;

alter table public.players
  add column if not exists season_id uuid references public.seasons(id) on delete cascade;

-- Backfill season_id from team where possible.
update public.players p
set season_id = t.season_id
from public.teams t
where p.team_id = t.id
  and p.season_id is null;

create index if not exists idx_players_season_id on public.players(season_id);
create index if not exists idx_players_user_season on public.players(user_id, season_id);

create unique index if not exists uniq_players_user_season_nonnull
  on public.players(user_id, season_id)
  where user_id is not null and season_id is not null;

-- Nickname is deprecated in simplified model; keep column for compatibility but nullable/unused.
alter table public.players
  alter column nickname drop not null;
