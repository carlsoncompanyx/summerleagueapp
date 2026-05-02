create table if not exists public.game_betting_lines (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  home_moneyline numeric(6,2) not null,
  away_moneyline numeric(6,2) not null,
  home_spread numeric(5,1) not null,
  away_spread numeric(5,1) not null,
  total numeric(5,1) not null,
  source text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id)
);

alter table public.game_betting_lines enable row level security;

create policy if not exists game_betting_lines_read_all
  on public.game_betting_lines for select
  using (true);

create policy if not exists game_betting_lines_admin_write
  on public.game_betting_lines for all
  using (public.is_admin())
  with check (public.is_admin());
