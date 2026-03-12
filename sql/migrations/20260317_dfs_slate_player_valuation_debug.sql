alter table public.slate_players
  add column if not exists valuation_source text,
  add column if not exists valuation_grade text,
  add column if not exists historical_match_name text,
  add column if not exists historical_match_confidence text,
  add column if not exists current_projection_input numeric(8,2),
  add column if not exists historical_projection_input numeric(8,2),
  add column if not exists league_average_projection_input numeric(8,2);
