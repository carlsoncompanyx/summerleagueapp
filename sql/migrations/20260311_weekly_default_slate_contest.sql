-- Weekly default slate/contest support and dedupe keys

alter table public.slates
  add column if not exists week_start_date date,
  add column if not exists is_default_weekly boolean not null default false;

alter table public.contests
  add column if not exists is_default_weekly boolean not null default false;

create index if not exists idx_slates_week_start on public.slates(week_start_date);
create index if not exists idx_contests_slate_status on public.contests(slate_id, status);

create unique index if not exists uniq_default_weekly_slate
  on public.slates(season_id, week_start_date)
  where is_default_weekly = true and week_start_date is not null;

create unique index if not exists uniq_default_weekly_contest
  on public.contests(slate_id)
  where is_default_weekly = true;
