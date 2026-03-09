-- Trade integrity hardening + canonical model cleanup

create index if not exists idx_players_team_season on public.players(team_id, season_id);
create index if not exists idx_trades_status_from_to on public.trades(status, from_team_id, to_team_id);

-- players is the source of truth for season participation for linked users
create unique index if not exists uniq_players_user_season_active
  on public.players(user_id, season_id)
  where user_id is not null and season_id is not null;

-- Atomic trade execution with roster ownership validation.
create or replace function public.execute_trade_if_valid(
  p_trade_id uuid,
  p_admin_user_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_trade public.trades;
  v_out_count int := 0;
  v_in_count int := 0;
  v_out_expected int := 0;
  v_in_expected int := 0;
begin
  select * into v_trade
  from public.trades
  where id = p_trade_id
  for update;

  if v_trade.id is null then
    raise exception 'Trade not found';
  end if;

  if v_trade.status <> 'accepted_by_other'::public.trade_status then
    raise exception 'Trade must be accepted by receiving captain before admin execution';
  end if;

  v_out_expected := coalesce(array_length(v_trade.players_out, 1), 0);
  v_in_expected := coalesce(array_length(v_trade.players_in, 1), 0);

  if v_out_expected > 0 then
    select count(*) into v_out_count
    from public.players
    where id = any(v_trade.players_out)
      and team_id = v_trade.from_team_id;
  end if;

  if v_in_expected > 0 then
    select count(*) into v_in_count
    from public.players
    where id = any(v_trade.players_in)
      and team_id = v_trade.to_team_id;
  end if;

  if v_out_count <> v_out_expected then
    raise exception 'Trade execution failed: at least one outgoing player is no longer on the source team';
  end if;

  if v_in_count <> v_in_expected then
    raise exception 'Trade execution failed: at least one incoming player is no longer on the target team';
  end if;

  if v_out_expected > 0 then
    update public.players
    set team_id = v_trade.to_team_id
    where id = any(v_trade.players_out);
  end if;

  if v_in_expected > 0 then
    update public.players
    set team_id = v_trade.from_team_id
    where id = any(v_trade.players_in);
  end if;

  update public.trades
  set status = 'completed'::public.trade_status,
      updated_at = now()
  where id = p_trade_id;

  insert into public.trade_status_history(trade_id, from_status, to_status, changed_by)
  values (p_trade_id, 'accepted_by_other'::public.trade_status, 'completed'::public.trade_status, p_admin_user_id);
end;
$$;
