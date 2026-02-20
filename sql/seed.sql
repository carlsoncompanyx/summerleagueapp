insert into public.seasons (id, name, start_date, end_date, rules)
values ('00000000-0000-0000-0000-000000000001', 'ECRL Summer 2026', '2026-05-01', '2026-08-31', 'Beach roller hockey rules')
on conflict do nothing;

insert into public.teams (id, season_id, name)
values
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','Shoreline Snipers'),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','Gulf Coast Grinders'),
('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','Sandbar Slapshots'),
('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000001','Emerald Enforcers')
on conflict do nothing;

insert into public.games (season_id, home_team, away_team, scheduled_at, location)
values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','2026-05-10 18:00:00-05','Pensacola Beach Court A'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000104','2026-05-10 19:30:00-05','Pensacola Beach Court B')
on conflict do nothing;

insert into public.beer_bucks_packages (name, beer_bucks_amount, price_usd_cents, active)
values ('Starter 100',100,500,true),('Value 250',250,1000,true),('Whale 700',700,2500,true)
on conflict do nothing;
