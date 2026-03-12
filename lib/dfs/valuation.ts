import { createAdminSupabaseClient } from '../supabase/admin';
import { computeDfsFantasyPoints, parseDfsPosition } from './scoring';

type ValuationRow = {
  slate_id: string;
  player_id: string;
  team_id: string | null;
  position: string | null;
  salary: number;
  projection_points: number;
  baseline_points: number;
  valuation_source?: string;
  valuation_grade?: string;
  historical_match_name?: string | null;
  historical_match_confidence?: string;
  current_projection_input?: number | null;
  historical_projection_input?: number | null;
  league_average_projection_input?: number | null;
};

type PlayerGrade = 'A' | 'B' | 'C' | 'D' | 'F';

function normalizePlayerName(name: string | null | undefined) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fallbackByPosition(position: string | null | undefined) {
  const p = (position ?? '').toLowerCase();
  if (p.includes('goal')) return 5.0;
  if (p.includes('def')) return 5.6;
  return 6.2;
}

function gradeMultiplier(grade: string | null | undefined) {
  const g = String(grade ?? 'C').toUpperCase();
  if (g === 'A') return 1.2;
  if (g === 'B') return 1.1;
  if (g === 'D') return 0.9;
  if (g === 'F') return 0.8;
  return 1;
}

function asGrade(grade: string | null | undefined): PlayerGrade {
  const g = String(grade ?? 'C').toUpperCase();
  if (g === 'A' || g === 'B' || g === 'C' || g === 'D' || g === 'F') return g;
  return 'C';
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

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

/**
 * Skater valuation precedence:
 * 1) manual projection override
 * 2) current-season DFS points/game sample (if sufficient)
 * 3) historical per-game baseline from 16-game season assumption
 * 4) league-average fallback
 * 5) positional fallback
 *
 * Goalie valuation (manual-first for MVP):
 * 1) manual salary override
 * 2) manual projection override
 * 3) grade-adjusted league-average goalie fallback
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

  const skaterSeasonAverages = (seasonStats ?? [])
    .filter((s: any) => parseDfsPosition(s.position) !== 'GOALIE')
    .map((s: any) => Number(s.fantasy_points_avg ?? 0))
    .filter((n: number) => Number.isFinite(n) && n > 0);

  const goalieSeasonAverages = (seasonStats ?? [])
    .filter((s: any) => parseDfsPosition(s.position) === 'GOALIE')
    .map((s: any) => Number(s.fantasy_points_avg ?? 0))
    .filter((n: number) => Number.isFinite(n) && n > 0);

  const skaterLeagueAverage = mean(skaterSeasonAverages);
  const goalieLeagueAverage = mean(goalieSeasonAverages);
  const historicalLeagueAverageSkater = mean(
    (historical ?? []).map((r: any) => {
      const gpg = Number(r.goals ?? 0) / 16;
      const apg = Number(r.assists ?? 0) / 16;
      return 3 * gpg + 2 * apg;
    }).filter((n: number) => Number.isFinite(n) && n > 0),
  );

  const candidates = players.map((p: any) => {
    const seasonStat = seasonByPlayer.get(p.id);
    const override = overrideByPlayer.get(p.id);
    const valInput = valuationInputByPlayer.get(p.id);
    const grade = asGrade(valInput?.player_grade);
    const gradeMult = gradeMultiplier(grade);
    const isGoalie = parseDfsPosition(p.position) === 'GOALIE';

    const minGames = Number(valInput?.min_sample_games ?? 2);
    const seasonGames = Number(seasonStat?.games_played ?? 0);
    const currentTotal = computeDfsFantasyPoints({
      position: p.position,
      goals: Number(seasonStat?.goals ?? 0),
      assists: Number(seasonStat?.assists ?? 0),
      wins: Number(seasonStat?.wins ?? 0),
      goalsAgainst: Number(seasonStat?.goals_against ?? 0),
    });

    const currentProjection = !isGoalie && seasonGames >= minGames && seasonGames > 0
      ? Number((currentTotal / seasonGames).toFixed(2))
      : null;

    const historicalMatch = getBestHistoricalRows(p, historical);
    const historicalRows = historicalMatch.rows;

    // Historical data is season totals. Assume ~16-game seasons to derive skater per-game baseline.
    const historicalSkaterPerGame = !isGoalie && historicalRows.length
      ? mean(historicalRows.map((r: any) => {
        const gpg = Number(r.goals ?? 0) / 16;
        const apg = Number(r.assists ?? 0) / 16;
        return 3 * gpg + 2 * apg;
      }))
      : null;

    const fallback = Number(valInput?.fallback_position_baseline ?? fallbackByPosition(p.position));

    const skaterBaseProjection = Number(
      override?.projection_points
      ?? currentProjection
      ?? historicalSkaterPerGame
      ?? skaterLeagueAverage
      ?? historicalLeagueAverageSkater
      ?? fallback,
    );

    const goalieBaseProjection = Number(
      override?.projection_points
      ?? ((goalieLeagueAverage ?? fallback) * gradeMult),
    );

    const baseProjection = isGoalie ? goalieBaseProjection : skaterBaseProjection;
    const adjustedProjection = override?.projection_points != null
      ? Number(override.projection_points)
      : Number((baseProjection * gradeMult).toFixed(2));

    const valuationSource = override?.projection_points != null
      ? 'manual_projection_override'
      : !isGoalie && currentProjection != null
        ? 'current_sample'
        : !isGoalie && historicalSkaterPerGame != null
          ? 'historical_16_game_rate'
          : !isGoalie && (skaterLeagueAverage != null || historicalLeagueAverageSkater != null)
            ? 'league_average_fallback'
            : isGoalie && goalieLeagueAverage != null
              ? 'goalie_league_average_fallback'
              : 'positional_fallback';

    return {
      player: p,
      override,
      grade,
      gradeMult,
      isGoalie,
      projection: adjustedProjection,
      baseline: baseProjection,
      valuationSource,
      historicalMatchName: !isGoalie && historicalRows.length ? (historicalRows[0]?.player_name_raw ?? null) : null,
      historicalMatchConfidence: !isGoalie ? historicalMatch.confidence : 'goalie_manual_first',
      currentProjectionInput: !isGoalie ? currentProjection : null,
      historicalProjectionInput: !isGoalie ? historicalSkaterPerGame : null,
      leagueAverageInput: isGoalie ? goalieLeagueAverage : skaterLeagueAverage,
    };
  });

  const byPosition = new Map<'SKATER' | 'GOALIE', number[]>();
  for (const row of candidates) {
    const pos: 'SKATER' | 'GOALIE' = row.isGoalie ? 'GOALIE' : 'SKATER';
    if (!byPosition.has(pos)) byPosition.set(pos, []);
    byPosition.get(pos)!.push(row.projection);
  }

  const skaterProjectionMean = mean(byPosition.get('SKATER') ?? []);
  const goalieProjectionMean = mean(byPosition.get('GOALIE') ?? []);

  function normalizeWithinPosition(value: number, position: 'SKATER' | 'GOALIE') {
    const values = byPosition.get(position) ?? [value];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max <= min) return 0.5;
    return (value - min) / (max - min);
  }

  const initialRows = candidates.map((row) => {
    const pos: 'SKATER' | 'GOALIE' = row.isGoalie ? 'GOALIE' : 'SKATER';
    const norm = normalizeWithinPosition(row.projection, pos);

    const positionMean = row.isGoalie ? (goalieProjectionMean ?? row.projection) : (skaterProjectionMean ?? row.projection);
    const projectionDelta = row.projection - positionMean;
    const seedSalary = row.isGoalie
      ? Math.round(7000 + norm * 2200 + projectionDelta * 180)
      : Math.round(6000 + norm * 5200 + projectionDelta * 260);

    const gradeBoost = row.isGoalie
      ? (row.grade === 'A' ? 450 : row.grade === 'B' ? 250 : row.grade === 'D' ? -220 : row.grade === 'F' ? -400 : 0)
      : (row.grade === 'A' ? 700 : row.grade === 'B' ? 350 : row.grade === 'D' ? -260 : row.grade === 'F' ? -520 : 0);

    const computedSalary = Math.round(seedSalary + gradeBoost);
    const salary = Number(
      row.override?.salary_override
      ?? Math.max(3600, Math.min(12400, computedSalary)),
    );

    return {
      slate_id: slateId,
      player_id: row.player.id,
      team_id: row.player.team_id,
      position: row.player.position,
      salary,
      projection_points: Number(row.projection.toFixed(2)),
      baseline_points: Number(row.baseline.toFixed(2)),
      valuation_source: row.valuationSource,
      valuation_grade: row.grade,
      historical_match_name: row.historicalMatchName,
      historical_match_confidence: row.historicalMatchConfidence,
      current_projection_input: row.currentProjectionInput,
      historical_projection_input: row.historicalProjectionInput,
      league_average_projection_input: row.leagueAverageInput,
    };
  });

  const avgListedSalary = initialRows.length
    ? initialRows.reduce((sum, r) => sum + Number(r.salary || 0), 0) / initialRows.length
    : 7600;
  const targetAverage = 7800;
  const scalar = avgListedSalary > 0 ? targetAverage / avgListedSalary : 1;

  return initialRows.map((row) => ({
    ...row,
    salary: Math.max(3600, Math.min(12400, Math.round(Number(row.salary) * scalar))),
  }));
}

export async function getFantasyPlayerDetails(playerId: string, seasonId?: string) {
  const admin = createAdminSupabaseClient();
  const { data: player } = await admin.from('players').select('id,name,team_id,position,jersey').eq('id', playerId).maybeSingle();
  if (!player) return null;

  let currentQ = admin.from('fantasy_points_v').select('*').eq('player_id', playerId);
  if (seasonId) currentQ = currentQ.eq('season_id', seasonId);

  const [current, historical, team, seasonOverride, valuationInput] = await Promise.all([
    currentQ.order('season_id', { ascending: false }).limit(1).maybeSingle(),
    admin.from('player_historical_season_stats').select('*').order('season_label', { ascending: false }),
    player.team_id ? admin.from('teams').select('id,name').eq('id', player.team_id).maybeSingle() : Promise.resolve({ data: null as any }),
    seasonId ? admin.from('player_projection_overrides').select('*').eq('season_id', seasonId).eq('player_id', playerId).maybeSingle() : Promise.resolve({ data: null as any }),
    seasonId ? admin.from('player_valuation_inputs').select('*').eq('season_id', seasonId).eq('player_id', playerId).maybeSingle() : Promise.resolve({ data: null as any }),
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
  const grade = asGrade(valuationInput.data?.player_grade);
  const pricingContext = seasonOverride.data?.projection_points != null
    ? { source: 'manual_override', sourceLabel: 'Manual projection override is active.' }
    : sampleGames >= Number(valuationInput.data?.min_sample_games ?? 2)
      ? { source: 'current_sample', sourceLabel: 'Current-season sample is driving projection.' }
      : matchedRows.length
        ? { source: 'historical_fallback', sourceLabel: 'Historical season rates are being used as fallback context.' }
        : { source: 'league_average_fallback', sourceLabel: `League-average fallback (grade ${grade}) is being used.` };

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
    valuation: {
      grade,
      notes: seasonOverride.data?.notes ?? valuationInput.data?.notes ?? null,
      manualProjection: seasonOverride.data?.projection_points ?? null,
      manualSalary: seasonOverride.data?.salary_override ?? null,
    },
  };
}
