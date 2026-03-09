import { createAdminSupabaseClient } from '../supabase/admin';
import { computeDfsFantasyPoints } from './scoring';

type ValuationRow = {
  slate_id: string;
  player_id: string;
  team_id: string | null;
  position: string | null;
  salary: number;
  projection_points: number;
  baseline_points: number;
};

function normalizePlayerName(name: string | null | undefined) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fallbackByPosition(position: string | null | undefined) {
  const p = (position ?? '').toLowerCase();
  if (p.includes('goal')) return 5.2;
  if (p.includes('def')) return 4.8;
  return 6.0;
}

/**
 * Projection precedence:
 * 1) manual projection override
 * 2) current-season production (same DFS scoring model as contest scoring)
 * 3) historical season-summary totals (points/season mapped to a per-game projection baseline)
 * 4) positional fallback baseline
 */
export async function buildSlateValuations({
  slateId,
  seasonId,
}: {
  slateId: string;
  seasonId?: string;
}): Promise<ValuationRow[]> {
  const admin = createAdminSupabaseClient();

  const { data: slateGames, error: slateGameError } = await admin
    .from('slate_games')
    .select('game_id,games!inner(id,season_id,home_team,away_team)')
    .eq('slate_id', slateId);
  if (slateGameError) throw slateGameError;

  const gameRows = (slateGames ?? []).map((r: any) => r.games).filter(Boolean);
  if (!gameRows.length) return [];

  const resolvedSeasonId = seasonId ?? gameRows[0].season_id;
  const eligibleTeamIds = Array.from(new Set(gameRows.flatMap((g: any) => [g.home_team, g.away_team]).filter(Boolean)));
  if (!eligibleTeamIds.length) return [];

  const [playersRes, seasonStatsRes, overridesRes, valuationInputsRes, historicalRes] = await Promise.all([
    admin.from('players').select('id,name,team_id,position').eq('season_id', resolvedSeasonId).in('team_id', eligibleTeamIds),
    admin.from('fantasy_points_v').select('*').eq('season_id', resolvedSeasonId),
    admin.from('player_projection_overrides').select('*').eq('season_id', resolvedSeasonId),
    admin.from('player_valuation_inputs').select('*').eq('season_id', resolvedSeasonId),
    admin.from('player_historical_season_stats').select('*'),
  ]);

  const players = playersRes.data ?? [];
  const seasonStats = seasonStatsRes.data ?? [];
  const overrides = overridesRes.data ?? [];
  const valuationInputs = valuationInputsRes.data ?? [];
  const historical = historicalRes.data ?? [];

  const seasonByPlayer = new Map(seasonStats.map((s: any) => [s.player_id, s]));
  const overrideByPlayer = new Map(overrides.map((o: any) => [o.player_id, o]));
  const valuationInputByPlayer = new Map(valuationInputs.map((v: any) => [v.player_id, v]));

  const historicalByPlayer = new Map<string, any[]>();
  for (const row of historical) {
    const key = row.player_id ?? row.normalized_player_name;
    if (!historicalByPlayer.has(key)) historicalByPlayer.set(key, []);
    historicalByPlayer.get(key)!.push(row);
  }

  return players.map((p: any) => {
    const seasonStat = seasonByPlayer.get(p.id);
    const override = overrideByPlayer.get(p.id);
    const valInput = valuationInputByPlayer.get(p.id);

    const minGames = Number(valInput?.min_sample_games ?? 2);
    const seasonGames = Number(seasonStat?.games_played ?? 0);
    const currentTotal = computeDfsFantasyPoints({
      position: p.position,
      goals: Number(seasonStat?.goals ?? 0),
      assists: Number(seasonStat?.assists ?? 0),
      wins: Number(seasonStat?.wins ?? 0),
      goalsAgainst: Number(seasonStat?.goals_against ?? 0),
    });
    const currentProjection = seasonGames >= minGames && seasonGames > 0
      ? Number((currentTotal / seasonGames).toFixed(2))
      : null;

    const historicalRows = [
      ...(historicalByPlayer.get(p.id) ?? []),
      ...(historicalByPlayer.get(normalizePlayerName(p.name)) ?? []),
    ];
    const dedupHistorical = Array.from(new Map(historicalRows.map((r: any) => [r.id, r])).values());
    const historicalAvgPoints = dedupHistorical.length
      ? dedupHistorical.reduce((sum: number, r: any) => sum + Number(r.points ?? (r.goals ?? 0) + (r.assists ?? 0)), 0) / dedupHistorical.length
      : null;

    // Historical totals are season summaries; convert to a conservative per-game baseline for DFS projections.
    const historicalProjection = historicalAvgPoints != null ? Math.max(3, historicalAvgPoints / 10) : null;
    const fallback = Number(valInput?.fallback_position_baseline ?? fallbackByPosition(p.position));

    const projection = Number(
      override?.projection_points
      ?? currentProjection
      ?? historicalProjection
      ?? fallback,
    );

    const salary = Number(
      override?.salary_override
      ?? Math.max(3200, Math.round(projection * 1150)),
    );

    return {
      slate_id: slateId,
      player_id: p.id,
      team_id: p.team_id,
      position: p.position,
      salary,
      projection_points: Number(projection.toFixed(2)),
      baseline_points: Number((historicalProjection ?? fallback).toFixed(2)),
    };
  });
}

export async function getFantasyPlayerDetails(playerId: string, seasonId?: string) {
  const admin = createAdminSupabaseClient();
  const { data: player } = await admin.from('players').select('id,name,team_id,position,jersey').eq('id', playerId).maybeSingle();
  if (!player) return null;

  let currentQ = admin.from('fantasy_points_v').select('*').eq('player_id', playerId);
  if (seasonId) currentQ = currentQ.eq('season_id', seasonId);

  const normalized = normalizePlayerName(player.name);
  const [current, historical, team] = await Promise.all([
    currentQ.order('season_id', { ascending: false }).limit(1).maybeSingle(),
    admin
      .from('player_historical_season_stats')
      .select('*')
      .or(`player_id.eq.${playerId},normalized_player_name.eq.${normalized}`)
      .order('season_label', { ascending: false }),
    player.team_id ? admin.from('teams').select('id,name').eq('id', player.team_id).maybeSingle() : Promise.resolve({ data: null as any }),
  ]);

  const historicalRows = historical.data ?? [];
  const histGoals = historicalRows.reduce((sum: number, r: any) => sum + Number(r.goals ?? 0), 0);
  const histAssists = historicalRows.reduce((sum: number, r: any) => sum + Number(r.assists ?? 0), 0);
  const histAvgPoints = historicalRows.length
    ? historicalRows.reduce((sum: number, r: any) => sum + Number(r.points ?? 0), 0) / historicalRows.length
    : 0;

  return {
    player,
    team: team.data,
    current: current.data,
    historical: historicalRows,
    historicalSummary: {
      goals: histGoals,
      assists: histAssists,
      avgPointsPerSeason: Number(histAvgPoints.toFixed(2)),
    },
  };
}
