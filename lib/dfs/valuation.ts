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

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function getBestHistoricalRows(player: any, historicalRows: any[]) {
  const byPlayerId = historicalRows.filter((r) => r.player_id === player.id);
  if (byPlayerId.length) return { rows: byPlayerId, confidence: 'id_match' };

  const normalized = normalizePlayerName(player.name);
  const exact = historicalRows.filter((r) => normalizePlayerName(r.player_name_raw) === normalized || r.normalized_player_name === normalized);
  if (exact.length) return { rows: exact, confidence: 'normalized_exact' };

  let bestName = '';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const row of historicalRows) {
    const candidate = normalizePlayerName(row.player_name_raw || row.normalized_player_name);
    if (!candidate) continue;
    const distance = levenshtein(normalized, candidate);
    const maxLen = Math.max(candidate.length, normalized.length) || 1;
    const ratio = distance / maxLen;
    if (ratio <= 0.18 && distance < bestDistance) {
      bestDistance = distance;
      bestName = candidate;
    }
  }

  if (bestName) {
    return {
      rows: historicalRows.filter((r) => normalizePlayerName(r.player_name_raw || r.normalized_player_name) === bestName),
      confidence: 'normalized_fuzzy',
    };
  }

  return { rows: [], confidence: 'none' };
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

  const seasonSampleAverages = (seasonStats ?? [])
    .map((s: any) => Number(s.fantasy_points_avg ?? 0))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  const leagueAverageFallback = seasonSampleAverages.length
    ? Number((seasonSampleAverages.reduce((sum: number, n: number) => sum + n, 0) / seasonSampleAverages.length).toFixed(2))
    : null;

  const projections = players.map((p: any) => {
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

    const historicalMatch = getBestHistoricalRows(p, historical);
    const historicalRows = historicalMatch.rows;
    const historicalAvgPoints = historicalRows.length
      ? historicalRows.reduce((sum: number, r: any) => sum + Number(r.points ?? (r.goals ?? 0) + (r.assists ?? 0)), 0) / historicalRows.length
      : null;

    const historicalProjection = historicalAvgPoints != null ? Math.max(3, historicalAvgPoints / 9.5) : null;
    const fallback = Number(valInput?.fallback_position_baseline ?? fallbackByPosition(p.position));
    const leagueAverage = leagueAverageFallback != null ? Number(leagueAverageFallback) : null;

    const projection = Number(
      override?.projection_points
      ?? currentProjection
      ?? historicalProjection
      ?? leagueAverage
      ?? fallback,
    );

    return {
      player: p,
      override,
      projection,
      baseline: historicalProjection ?? leagueAverage ?? fallback,
    };
  });

  const byPosition = new Map<'SKATER' | 'GOALIE', number[]>();
  for (const row of projections) {
    const pos: 'SKATER' | 'GOALIE' = String(row.player.position || '').toLowerCase().includes('goal') ? 'GOALIE' : 'SKATER';
    if (!byPosition.has(pos)) byPosition.set(pos, []);
    byPosition.get(pos)!.push(row.projection);
  }

  function normalizeWithinPosition(value: number, position: 'SKATER' | 'GOALIE') {
    const values = byPosition.get(position) ?? [value];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max <= min) return 0.5;
    return (value - min) / (max - min);
  }

  const initialRows = projections.map((row) => {
    const p = row.player;
    const pos: 'SKATER' | 'GOALIE' = String(p.position || '').toLowerCase().includes('goal') ? 'GOALIE' : 'SKATER';
    const norm = normalizeWithinPosition(row.projection, pos);
    const tierMultiplier = pos === 'GOALIE'
      ? (0.84 + norm * 0.34)
      : (0.80 + norm * 0.46);
    const seedSalary = Math.round(7600 * tierMultiplier);
    const salary = Number(
      row.override?.salary_override
      ?? Math.max(3600, Math.min(11800, seedSalary)),
    );

    return {
      slate_id: slateId,
      player_id: p.id,
      team_id: p.team_id,
      position: p.position,
      salary,
      projection_points: Number(row.projection.toFixed(2)),
      baseline_points: Number(Number(row.baseline).toFixed(2)),
    };
  });

  const avgListedSalary = initialRows.length
    ? initialRows.reduce((sum, r) => sum + Number(r.salary || 0), 0) / initialRows.length
    : 7600;
  const targetAverage = 7600;
  const scalar = avgListedSalary > 0 ? targetAverage / avgListedSalary : 1;

  return initialRows.map((row) => ({
    ...row,
    salary: Math.max(3600, Math.min(11800, Math.round(Number(row.salary) * scalar))),
  }));
}

export async function getFantasyPlayerDetails(playerId: string, seasonId?: string) {
  const admin = createAdminSupabaseClient();
  const { data: player } = await admin.from('players').select('id,name,team_id,position,jersey').eq('id', playerId).maybeSingle();
  if (!player) return null;

  let currentQ = admin.from('fantasy_points_v').select('*').eq('player_id', playerId);
  if (seasonId) currentQ = currentQ.eq('season_id', seasonId);

  const [current, historical, team, seasonOverride] = await Promise.all([
    currentQ.order('season_id', { ascending: false }).limit(1).maybeSingle(),
    admin.from('player_historical_season_stats').select('*').order('season_label', { ascending: false }),
    player.team_id ? admin.from('teams').select('id,name').eq('id', player.team_id).maybeSingle() : Promise.resolve({ data: null as any }),
    seasonId ? admin.from('player_projection_overrides').select('*').eq('season_id', seasonId).eq('player_id', playerId).maybeSingle() : Promise.resolve({ data: null as any }),
  ]);

  const historicalRows = historical.data ?? [];
  const historicalMatch = getBestHistoricalRows(player, historicalRows);
  const matchedRows = historicalMatch.rows;

  const histGoals = matchedRows.reduce((sum: number, r: any) => sum + Number(r.goals ?? 0), 0);
  const histAssists = matchedRows.reduce((sum: number, r: any) => sum + Number(r.assists ?? 0), 0);
  const histAvgPoints = matchedRows.length
    ? matchedRows.reduce((sum: number, r: any) => sum + Number(r.points ?? 0), 0) / matchedRows.length
    : 0;

  const sampleGames = Number(current.data?.games_played ?? 0);
  const hasLeagueAverage = current.data?.season_id != null;
  const pricingContext = seasonOverride.data?.projection_points != null
    ? { source: 'manual_override', sourceLabel: 'Manual pricing override used for this slate season.' }
    : sampleGames >= 2
      ? { source: 'current_sample', sourceLabel: 'Current-season sample is driving projection.' }
      : matchedRows.length
        ? { source: 'historical_fallback', sourceLabel: 'Historical season stats are being used as fallback context.' }
        : hasLeagueAverage
          ? { source: 'league_average_fallback', sourceLabel: 'League-average fallback is being used (no reliable current or historical sample).' }
          : { source: 'position_fallback', sourceLabel: 'Position baseline fallback is being used (limited sample data).' };

  return {
    player,
    team: team.data,
    current: current.data,
    historical: matchedRows,
    historicalSummary: {
      goals: histGoals,
      assists: histAssists,
      avgPointsPerSeason: Number(histAvgPoints.toFixed(2)),
      matchConfidence: historicalMatch.confidence,
    },
    pricingContext,
  };
}
