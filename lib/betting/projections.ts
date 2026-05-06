import { computeMoneylineOdds } from '../betting';

type Game = {
  id: string;
  season_id: string;
  home_team: string;
  away_team: string;
  home_team_name?: string;
  away_team_name?: string;
  scheduled_at: string;
  status: string;
  home_score: number;
  away_score: number;
};

type Player = {
  id: string;
  name: string;
  team_id: string | null;
  position: string | null;
};

type GameStat = {
  game_id: string;
  player_id: string;
  games_played?: number | null;
  goals?: number | null;
  assists?: number | null;
  goals_against?: number | null;
};

type HistoricalRow = {
  player_id?: string | null;
  player_name_raw?: string | null;
  normalized_player_name?: string | null;
  goals?: number | null;
  assists?: number | null;
  points?: number | null;
};

type ValuationInput = {
  player_id: string;
  player_grade?: string | null;
};

type SlatePlayer = {
  player_id: string;
  projection_points?: number | string | null;
  valuation_grade?: string | null;
};

export type ProjectedGameLine = {
  gameId: string;
  projectedHomeGoals: number;
  projectedAwayGoals: number;
  projectedScore: string;
  homeSpread: number;
  awaySpread: number;
  total: number;
  homeWinProbability: number;
  awayWinProbability: number;
  homeMoneyline: number;
  awayMoneyline: number;
  modelVersion: string;
  sourceLabel: string;
  confidence: string;
  explanation: string;
  homeTeamBreakdown: TeamProjectionBreakdown;
  awayTeamBreakdown: TeamProjectionBreakdown;
};

type PlayerAgg = {
  gp: number;
  goals: number;
  assists: number;
  ga: number;
};

export type TeamProjectionBreakdown = {
  offense: number;
  offensiveSource: string;
  goalieAllowed: number;
  goalieSource: string;
  confidence: string;
  sourceCounts: Record<string, number>;
};

export const BETTING_MODEL_VERSION = 'ECRL roster projection v2';
const EXCLUDED_BETTING_TEAM_TERMS = ['alternates', 'alternate', 'subs'];

function isGoalie(position: string | null | undefined) {
  return String(position ?? '').toLowerCase().includes('goal');
}

function normalizeName(name: string | null | undefined) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isExcludedBettingTeamName(name: string | null | undefined) {
  const normalized = normalizeName(name);
  return EXCLUDED_BETTING_TEAM_TERMS.some((term) => normalized.includes(term));
}

export function isExcludedBettingGame(game: Pick<Game, 'home_team_name' | 'away_team_name'> & Record<string, any>) {
  return isExcludedBettingTeamName(game.home_team_name) || isExcludedBettingTeamName(game.away_team_name);
}

export function filterBettingGames<T extends Pick<Game, 'home_team_name' | 'away_team_name'> & Record<string, any>>(games: readonly T[]) {
  return games.filter((game) => !isExcludedBettingGame(game));
}

function gradeValue(grade: string | null | undefined) {
  const g = String(grade ?? 'C').toUpperCase();
  if (g === 'A') return 1.45;
  if (g === 'B') return 1.18;
  if (g === 'D') return 0.78;
  if (g === 'F') return 0.58;
  return 1;
}

function skaterGradeGoals(grade: string | null | undefined) {
  return 0.3 * gradeValue(grade);
}

function goalieGradeAllowed(grade: string | null | undefined) {
  const g = String(grade ?? 'C').toUpperCase();
  if (g === 'A') return 2.95;
  if (g === 'B') return 3.5;
  if (g === 'D') return 4.75;
  if (g === 'F') return 5.25;
  return 4.1;
}

function roundHalf(value: number) {
  return Number((Math.round(value * 2) / 2).toFixed(1));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function decimalProbabilityOdds(probability: number) {
  const p = clamp(probability, 0.18, 0.82);
  return Number((1 / p).toFixed(2));
}

function playerSourceIncrement(counts: Record<string, number>, source: string) {
  counts[source] = (counts[source] ?? 0) + 1;
}

function sampleWeights(gp: number) {
  if (gp <= 0) return { current: 0, historical: 0.45, dfs: 0.3, grade: 0.25 };
  if (gp === 1) return { current: 0.2, historical: 0.38, dfs: 0.27, grade: 0.15 };
  if (gp === 2) return { current: 0.35, historical: 0.32, dfs: 0.22, grade: 0.11 };
  if (gp === 3) return { current: 0.5, historical: 0.25, dfs: 0.17, grade: 0.08 };
  return { current: 0.65, historical: 0.18, dfs: 0.12, grade: 0.05 };
}

function weightedAverage(values: { value: number; weight: number; source: string }[], counts: Record<string, number>) {
  let weighted = 0;
  let totalWeight = 0;
  for (const item of values) {
    if (!Number.isFinite(item.value) || item.weight <= 0) continue;
    playerSourceIncrement(counts, item.source);
    weighted += item.value * item.weight;
    totalWeight += item.weight;
  }
  return weighted / Math.max(totalWeight, 0.01);
}

export function buildGameProjections({
  games,
  players,
  gameStats,
  historicalRows,
  valuationInputs,
  slatePlayers,
}: {
  games: readonly Game[];
  players: readonly Player[];
  gameStats: readonly GameStat[];
  historicalRows?: readonly HistoricalRow[];
  valuationInputs?: readonly ValuationInput[];
  slatePlayers?: readonly SlatePlayer[];
}) {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const statsByPlayer = new Map<string, PlayerAgg>();
  for (const stat of gameStats ?? []) {
    if (!statsByPlayer.has(stat.player_id)) statsByPlayer.set(stat.player_id, { gp: 0, goals: 0, assists: 0, ga: 0 });
    const agg = statsByPlayer.get(stat.player_id)!;
    agg.gp += Number(stat.games_played || 0);
    agg.goals += Number(stat.goals || 0);
    agg.assists += Number(stat.assists || 0);
    agg.ga += Number(stat.goals_against || 0);
  }

  const historicalByPlayer = new Map<string, HistoricalRow[]>();
  const historicalByName = new Map<string, HistoricalRow[]>();
  for (const row of historicalRows ?? []) {
    if (row.player_id) {
      if (!historicalByPlayer.has(row.player_id)) historicalByPlayer.set(row.player_id, []);
      historicalByPlayer.get(row.player_id)!.push(row);
    }
    const key = normalizeName(row.normalized_player_name || row.player_name_raw);
    if (key) {
      if (!historicalByName.has(key)) historicalByName.set(key, []);
      historicalByName.get(key)!.push(row);
    }
  }

  const gradeByPlayer = new Map((valuationInputs ?? []).map((row) => [row.player_id, row.player_grade ?? 'C']));
  const slateByPlayer = new Map((slatePlayers ?? []).map((row) => [row.player_id, row]));

  function playerGrade(playerId: string) {
    return gradeByPlayer.get(playerId) ?? slateByPlayer.get(playerId)?.valuation_grade ?? 'C';
  }

  function skaterContribution(player: Player, counts: Record<string, number>) {
    const values: { value: number; weight: number; source: string }[] = [];
    const current = statsByPlayer.get(player.id);
    const weights = sampleWeights(current?.gp ?? 0);
    if (current && current.gp > 0) {
      values.push({
        value: clamp((current.goals / current.gp) * 0.86 + (current.assists / current.gp) * 0.13, 0.08, 1.35),
        weight: weights.current,
        source: 'Current stats',
      });
    }

    const historical = historicalByPlayer.get(player.id) ?? historicalByName.get(normalizeName(player.name)) ?? [];
    if (historical.length) {
      const goals = historical.reduce((sum, row) => sum + Number(row.goals || 0), 0) / historical.length;
      const assists = historical.reduce((sum, row) => sum + Number(row.assists || 0), 0) / historical.length;
      const points = historical.reduce((sum, row) => sum + Number(row.points ?? (Number(row.goals || 0) + Number(row.assists || 0))), 0) / historical.length;
      values.push({
        value: clamp((goals / 16) * 0.62 + (assists / 16) * 0.08 + (points / 16) * 0.05, 0.08, 1.05),
        weight: weights.historical,
        source: 'Historical stats',
      });
    }

    const slate = slateByPlayer.get(player.id);
    const slateProjection = Number(slate?.projection_points ?? 0);
    if (Number.isFinite(slateProjection) && slateProjection > 0) {
      values.push({
        value: clamp(slateProjection / 18, 0.08, 1.25),
        weight: weights.dfs,
        source: 'DFS projection',
      });
    }

    values.push({
      value: skaterGradeGoals(playerGrade(player.id)),
      weight: values.length ? weights.grade : 1,
      source: gradeByPlayer.has(player.id) || slate?.valuation_grade ? 'Grade fallback' : 'Low confidence fallback',
    });

    return clamp(weightedAverage(values, counts), 0.08, 1.35);
  }

  function teamBreakdown(teamId: string): TeamProjectionBreakdown {
    const roster = players.filter((player) => player.team_id === teamId);
    const counts: Record<string, number> = {};
    const skaters = roster.filter((player) => !isGoalie(player.position));
    const goalies = roster.filter((player) => isGoalie(player.position));
    const skaterContributions = skaters.map((player) => skaterContribution(player, counts));
    const contributionSum = skaterContributions.reduce((sum, value) => sum + value, 0);
    const topEnd = [...skaterContributions].sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0);
    const depthBonus = clamp(skaters.length * 0.055, 0, 0.65);
    const offense = 0.75 + contributionSum + topEnd * 0.18 + depthBonus;

    let goalieAllowed = 4.1;
    let goalieSource = 'Low confidence fallback';
    const goalieWithStats = goalies
      .map((player) => ({ player, stats: statsByPlayer.get(player.id) }))
      .filter((row) => row.stats && row.stats.gp > 0 && row.stats.ga > 0)
      .sort((a, b) => (b.stats?.gp ?? 0) - (a.stats?.gp ?? 0))[0];

    if (goalies.length) {
      const goalieValues: { value: number; weight: number; source: string }[] = [];
      if (goalieWithStats?.stats) {
        const weights = sampleWeights(goalieWithStats.stats.gp);
        goalieValues.push({
          value: clamp(goalieWithStats.stats.ga / goalieWithStats.stats.gp, 2.2, 6.4),
          weight: weights.current,
          source: 'Current stats',
        });
      }

      const projectionAllowed = goalies
        .map((goalie) => Number(slateByPlayer.get(goalie.id)?.projection_points ?? 0))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((projection) => clamp(5.6 - projection * 0.12, 2.4, 5.5));
      if (projectionAllowed.length) {
        goalieValues.push({
          value: projectionAllowed.reduce((sum, value) => sum + value, 0) / projectionAllowed.length,
          weight: goalieWithStats?.stats ? 0.3 : 0.55,
          source: 'DFS projection',
        });
      }

      const gradeAllowed = goalies.map((goalie) => goalieGradeAllowed(playerGrade(goalie.id)));
      goalieValues.push({
        value: gradeAllowed.reduce((sum, value) => sum + value, 0) / Math.max(gradeAllowed.length, 1),
        weight: goalieWithStats?.stats ? 0.2 : 0.45,
        source: gradeByPlayer.size || slateByPlayer.size ? 'Grade fallback' : 'Low confidence fallback',
      });

      const goalieCounts: Record<string, number> = {};
      goalieAllowed = clamp(weightedAverage(goalieValues, goalieCounts), 2.2, 6.4);
      goalieSource = primarySource(goalieCounts);
    }

    const offensiveSource = primarySource(counts);
    const confidence = confidenceForSources(offensiveSource, goalieSource, roster.length);
    return {
      offense: clamp(offense, 1.8, 8.8),
      offensiveSource,
      goalieAllowed,
      goalieSource,
      confidence,
      sourceCounts: counts,
    };
  }

  function primarySource(counts: Record<string, number>) {
    const ordered = ['Current stats', 'Historical stats', 'DFS projection', 'Grade fallback', 'Low confidence fallback'];
    return ordered.find((source) => counts[source]) ?? 'Low confidence fallback';
  }

  function confidenceForSources(offenseSource: string, goalieSource: string, rosterSize: number) {
    if (offenseSource === 'Current stats' && goalieSource === 'Current stats') return 'High confidence';
    if (offenseSource === 'Current stats' || offenseSource === 'Historical stats' || goalieSource === 'Current stats') return 'Medium confidence';
    if (offenseSource === 'DFS projection' || goalieSource === 'DFS projection') return 'Medium confidence';
    if (offenseSource === 'Grade fallback' || goalieSource === 'Grade fallback') return 'Low confidence - using grade fallback';
    return rosterSize ? 'Low confidence fallback' : 'Low confidence fallback - no roster data';
  }

  function sourceLabel(counts: Record<string, number>, goalieSources: string[]) {
    const offense = primarySource(counts);
    if (offense === 'Current stats') return 'Current stats';
    if (offense === 'Historical stats') return goalieSources.includes('Current stats') ? 'Historical stats + current goalie data' : 'Historical stats';
    if (offense === 'DFS projection') return 'DFS projection';
    if (offense === 'Grade fallback' || goalieSources.includes('Grade fallback')) return 'Low confidence - using grade fallback';
    return 'Low confidence fallback';
  }

  return filterBettingGames(games).map((game) => {
    const home = teamBreakdown(game.home_team);
    const away = teamBreakdown(game.away_team);
    const homeExpected = clamp(home.offense * 0.64 + away.goalieAllowed * 0.36 + 0.2, 1.5, 10.5);
    const awayExpected = clamp(away.offense * 0.64 + home.goalieAllowed * 0.36, 1.5, 10.5);
    const projectedHomeGoals = roundHalf(homeExpected);
    const projectedAwayGoals = roundHalf(awayExpected);
    const diff = projectedHomeGoals - projectedAwayGoals;
    const total = roundHalf(projectedHomeGoals + projectedAwayGoals);
    const homeWinProbability = Number(clamp(0.5 + diff * 0.065, 0.18, 0.82).toFixed(2));
    const awayWinProbability = Number((1 - homeWinProbability).toFixed(2));
    const moneyline = computeMoneylineOdds(-diff);
    const counts = { ...home.sourceCounts };
    for (const [key, value] of Object.entries(away.sourceCounts)) counts[key] = (counts[key] ?? 0) + value;
    const label = sourceLabel(counts, [home.goalieSource, away.goalieSource]);
    const confidence = [home.confidence, away.confidence].some((value) => value.startsWith('Low'))
      ? 'Low confidence - using grade fallback'
      : [home.confidence, away.confidence].some((value) => value.startsWith('Medium'))
        ? 'Medium confidence'
        : 'High confidence';

    return {
      gameId: game.id,
      projectedHomeGoals,
      projectedAwayGoals,
      projectedScore: `${projectedAwayGoals.toFixed(1)} - ${projectedHomeGoals.toFixed(1)}`,
      homeSpread: Number((-diff).toFixed(1)),
      awaySpread: Number(diff.toFixed(1)),
      total,
      homeWinProbability,
      awayWinProbability,
      homeMoneyline: moneyline.home || decimalProbabilityOdds(homeWinProbability),
      awayMoneyline: moneyline.away || decimalProbabilityOdds(awayWinProbability),
      modelVersion: BETTING_MODEL_VERSION,
      sourceLabel: label,
      confidence,
      explanation: `${label}. ${game.home_team_name ?? 'Home'} offense ${home.offense.toFixed(1)} (${home.offensiveSource}) vs ${game.away_team_name ?? 'Away'} goalie (${away.goalieSource}); ${game.away_team_name ?? 'Away'} offense ${away.offense.toFixed(1)} (${away.offensiveSource}) vs ${game.home_team_name ?? 'Home'} goalie (${home.goalieSource}). ${confidence}.`,
      homeTeamBreakdown: home,
      awayTeamBreakdown: away,
    };
  });
}
