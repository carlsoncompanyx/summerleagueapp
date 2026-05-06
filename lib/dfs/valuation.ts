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

const DEFAULT_SALARY_CAP = 50000;
const LINEUP_SALARY_UNITS = 6.5;
const MIN_SALARY = 3500;
const MAX_SALARY = 16000;
const INITIAL_ELASTICITY = 1.10;
const MAX_CALIBRATION_ELASTICITY = 1.35;

function normalizePlayerName(name: string | null | undefined) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fallbackByPosition(position: string | null | undefined) {
  const p = (position ?? '').toLowerCase();
  if (p.includes('goal')) return 14.0;
  if (p.includes('def')) return 13.0;
  return 15.0;
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

function blendWeights(gamesPlayed: number) {
  if (gamesPlayed <= 0) return { current: 0, historical: 0.7, grade: 0.3 };
  if (gamesPlayed === 1) return { current: 0.2, historical: 0.6, grade: 0.2 };
  if (gamesPlayed === 2) return { current: 0.35, historical: 0.5, grade: 0.15 };
  if (gamesPlayed === 3) return { current: 0.5, historical: 0.4, grade: 0.1 };
  return { current: 0.65, historical: 0.3, grade: 0.05 };
}

function blendedProjection(input: {
  current: number | null;
  historical: number | null;
  grade: number;
  leagueAverage: number | null;
  gamesPlayed: number;
}) {
  const weights = blendWeights(input.gamesPlayed);
  const pieces: { value: number; weight: number }[] = [];
  if (input.current != null && input.gamesPlayed > 0) pieces.push({ value: input.current, weight: weights.current });
  if (input.historical != null) {
    pieces.push({ value: input.historical, weight: weights.historical });
  } else if (input.leagueAverage != null) {
    pieces.push({ value: input.leagueAverage, weight: weights.historical * 0.6 });
    pieces.push({ value: input.grade, weight: weights.historical * 0.4 });
  } else {
    pieces.push({ value: input.grade, weight: weights.historical });
  }
  pieces.push({ value: input.grade, weight: weights.grade });

  const totalWeight = pieces.reduce((sum, piece) => sum + piece.weight, 0);
  const projection = pieces.reduce((sum, piece) => sum + piece.value * piece.weight, 0) / Math.max(totalWeight, 0.01);
  return Number(projection.toFixed(2));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToNearestHundred(value: number) {
  return Math.round(value / 100) * 100;
}

function rawSalaryFromProjectionRatio(projection: number, averageProjection: number, elasticity: number, averageSlotSalary: number) {
  const safeAverage = Math.max(0.01, averageProjection);
  const safeProjection = Math.max(0.01, projection);
  return averageSlotSalary * Math.pow(safeProjection / safeAverage, elasticity);
}

function applySoftMaxCompression(rawRows: Array<{ key: string; rawSalary: number }>) {
  const overMax = rawRows.filter((row) => row.rawSalary > MAX_SALARY).sort((a, b) => a.rawSalary - b.rawSalary);
  const minOverRaw = overMax[0]?.rawSalary ?? MAX_SALARY;
  const maxRaw = overMax[overMax.length - 1]?.rawSalary ?? MAX_SALARY;
  const compressed = new Map<string, number>();

  for (const row of rawRows) {
    let salary = row.rawSalary;
    if (row.rawSalary > MAX_SALARY) {
      if (maxRaw <= minOverRaw) {
        salary = MAX_SALARY;
      } else {
        const topBand = 1200;
        const percentile = (row.rawSalary - minOverRaw) / (maxRaw - minOverRaw);
        salary = (MAX_SALARY - topBand) + (topBand * Math.pow(percentile, 0.85));
      }
    }
    compressed.set(row.key, clamp(roundToNearestHundred(salary), MIN_SALARY, MAX_SALARY));
  }

  return compressed;
}

function topLineupSalary(candidates: Array<{ isGoalie: boolean; projection: number; salary: number }>) {
  const skaters = candidates.filter((row) => !row.isGoalie).sort((a, b) => b.projection - a.projection);
  const goalies = candidates.filter((row) => row.isGoalie).sort((a, b) => b.projection - a.projection);
  if (skaters.length < 5 || goalies.length < 1) return Number.POSITIVE_INFINITY;
  return skaters[0].salary * 1.5
    + skaters.slice(1, 5).reduce((sum, row) => sum + row.salary, 0)
    + goalies[0].salary;
}

function calibrateSalaries(candidates: Array<{ player: any; isGoalie: boolean; projection: number; override?: any }>, salaryCap = DEFAULT_SALARY_CAP) {
  const projections = candidates
    .filter((row) => row.override?.salary_override == null)
    .map((row) => row.projection)
    .filter((value) => Number.isFinite(value) && value > 0);
  const averageProjection = mean(projections) ?? 1;
  const averageSlotSalary = salaryCap / LINEUP_SALARY_UNITS;
  let elasticity = INITIAL_ELASTICITY;
  let aboveAveragePremium = 1;

  const priceAt = (nextElasticity: number, premium = 1) => {
    const rawRows = candidates
      .filter((row) => row.override?.salary_override == null)
      .map((row) => {
        const raw = rawSalaryFromProjectionRatio(row.projection, averageProjection, nextElasticity, averageSlotSalary);
        return {
          key: row.player.id,
          rawSalary: row.projection > averageProjection ? raw * premium : raw,
        };
      });
    const compressed = applySoftMaxCompression(rawRows);
    return candidates.map((row) => ({
      ...row,
      salary: Number(row.override?.salary_override ?? compressed.get(row.player.id) ?? MIN_SALARY),
    }));
  };

  let priced = priceAt(elasticity, aboveAveragePremium);
  while (topLineupSalary(priced) <= salaryCap && elasticity < MAX_CALIBRATION_ELASTICITY) {
    elasticity = Number((elasticity + 0.05).toFixed(2));
    priced = priceAt(elasticity, aboveAveragePremium);
  }

  while (topLineupSalary(priced) <= salaryCap && aboveAveragePremium < 1.25) {
    aboveAveragePremium = Number((aboveAveragePremium + 0.05).toFixed(2));
    priced = priceAt(elasticity, aboveAveragePremium);
  }

  return new Map(priced.map((row) => [row.player.id, row.salary]));
}

/**
 * Valuations blend current stats, historical skater rates, league baselines, and grade fallback.
 * Current-season weight ramps up by games played so a one-game sample never fully owns pricing.
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

    const seasonGames = Number(seasonStat?.games_played ?? 0);
    const currentTotal = computeDfsFantasyPoints({
      position: p.position,
      goals: Number(seasonStat?.goals ?? 0),
      assists: Number(seasonStat?.assists ?? 0),
      wins: Number(seasonStat?.wins ?? 0),
      goalsAgainst: Number(seasonStat?.goals_against ?? 0),
    });

    const currentProjection = seasonGames > 0
      ? Number(Math.max(isGoalie ? 1.5 : 0, currentTotal / seasonGames).toFixed(2))
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
    const gradeProjection = Number((fallback * gradeMult).toFixed(2));
    const leagueAverageInput = isGoalie
      ? goalieLeagueAverage
      : (skaterLeagueAverage ?? historicalLeagueAverageSkater);
    const blended = blendedProjection({
      current: currentProjection,
      historical: isGoalie ? null : historicalSkaterPerGame,
      grade: gradeProjection,
      leagueAverage: leagueAverageInput,
      gamesPlayed: seasonGames,
    });

    const baseProjection = blended;
    const adjustedProjection = override?.projection_points != null
      ? Number(override.projection_points)
      : Number(Math.max(isGoalie ? 2.5 : 3, Math.min(30, baseProjection)).toFixed(2));

    const valuationSource = override?.projection_points != null
      ? 'manual_projection_override'
      : currentProjection != null && !isGoalie && historicalSkaterPerGame != null
        ? 'blended_current_historical_grade'
        : currentProjection != null
          ? 'blended_current_grade'
        : !isGoalie && historicalSkaterPerGame != null
          ? 'blended_historical_grade'
          : !isGoalie && leagueAverageInput != null
            ? 'league_average_fallback'
            : isGoalie && leagueAverageInput != null
              ? 'goalie_league_average_fallback'
              : 'grade_position_fallback';

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
      historicalMatchConfidence: !isGoalie ? historicalMatch.confidence : 'goalie_no_historical_ga',
      currentProjectionInput: currentProjection,
      historicalProjectionInput: !isGoalie ? historicalSkaterPerGame : null,
      leagueAverageInput,
    };
  });

  const salaryByPlayer = calibrateSalaries(candidates);

  const initialRows = candidates.map((row) => {
    const salary = Number(salaryByPlayer.get(row.player.id) ?? MIN_SALARY);

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

  return initialRows;
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
