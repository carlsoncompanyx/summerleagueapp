-- MVP goalie salary normalization: align goalie baseline pricing with skater baseline.
-- This keeps lineup construction realistic under 50k cap while valuation model evolves.

with slate_skater_avg as (
  select slate_id, avg(salary)::numeric as avg_salary
  from public.slate_players
  where lower(coalesce(position, '')) not like '%goal%'
  group by slate_id
)
update public.slate_players sp
set salary = greatest(3600, least(12400, round(ssa.avg_salary)::int))
from slate_skater_avg ssa
where sp.slate_id = ssa.slate_id
  and lower(coalesce(sp.position, '')) like '%goal%'
  and sp.salary > round(ssa.avg_salary * 1.2)::int;
