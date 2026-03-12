alter table public.player_valuation_inputs
  add column if not exists player_grade text not null default 'C',
  add column if not exists notes text;

alter table public.player_valuation_inputs
  drop constraint if exists player_valuation_inputs_player_grade_check;

alter table public.player_valuation_inputs
  add constraint player_valuation_inputs_player_grade_check
  check (player_grade in ('A', 'B', 'C', 'D', 'F'));

update public.player_valuation_inputs
set player_grade = coalesce(nullif(upper(player_grade), ''), 'C')
where player_grade is distinct from coalesce(nullif(upper(player_grade), ''), 'C');
