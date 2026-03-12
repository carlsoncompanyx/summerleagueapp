alter table public.slate_players
  add column if not exists availability_status text not null default 'AVAILABLE',
  add column if not exists availability_projection_backup numeric(8,2);

alter table public.slate_players
  drop constraint if exists slate_players_availability_status_check;

alter table public.slate_players
  add constraint slate_players_availability_status_check
  check (availability_status in ('AVAILABLE', 'QUESTIONABLE', 'OUT'));

update public.slate_players
set availability_status = coalesce(nullif(upper(availability_status), ''), 'AVAILABLE')
where availability_status is distinct from coalesce(nullif(upper(availability_status), ''), 'AVAILABLE');

update public.slate_players
set availability_projection_backup = coalesce(availability_projection_backup, projection_points)
where availability_projection_backup is null;

create index if not exists idx_slate_players_availability
  on public.slate_players (slate_id, availability_status);
