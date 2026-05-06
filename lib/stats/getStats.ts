import { createAdminSupabaseClient } from '../supabase/admin';
import { computeGoalieFantasyPoints, parseDfsPosition } from '../dfs/scoring';

type PlayerStats = {
  player_id: string;
  name: string;
  team_id: string | null;
  team_name: string;
  position: string | null;
  jersey: string | number | null;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
  wins: number;
  goals_against: number;
  fantasy_points: number;
  fantasy_points_avg: number;
  recent_form?: number;
};

function isGoalie(position: string | null | undefined) {
  return parseDfsPosition(position) === 'GOALIE';
}

export async function getSeasonStats(seasonId?: string) {
  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch (error: any) {
    return {
      players: [],
      teams: [],
      errors: {
        players: error?.message ?? 'Supabase admin client is not configured.',
        teams: error?.message ?? 'Supabase admin client is not configured.',
      },
    };
  }

  const seasonRes = seasonId
    ? await supabase.from('seasons').select('id,name,start_date,end_date').eq('id', seasonId).maybeSingle()
    : await supabase.from('seasons').select('id,name,start_date,end_date').order('start_date', { ascending: false }).limit(1).maybeSingle();

  if (seasonRes.error) {
    return {
      players: [],
      teams: [],
      errors: { players: seasonRes.error.message, teams: seasonRes.error.message },
    };
  }

  const resolvedSeasonId = seasonRes.data?.id ?? seasonId;
  if (!resolvedSeasonId) {
    return {
      players: [],
      teams: [],
      errors: { players: 'No season exists yet.', teams: 'No season exists yet.' },
    };
  }

  const [playersRes, teamsRes, gamesRes] = await Promise.all([
    supabase.from('players').select('id,name,team_id,position,jersey,season_id').eq('season_id', resolvedSeasonId).order('name'),
    supabase.from('teams').select('id,name').eq('season_id', resolvedSeasonId).order('name'),
    supabase.from('games').select('id,season_id,home_team,away_team,status,home_score,away_score,scheduled_at').eq('season_id', resolvedSeasonId),
  ]);

  if (playersRes.error || teamsRes.error || gamesRes.error) {
    return {
      players: [],
      teams: teamsRes.data ?? [],
      errors: {
        players: playersRes.error?.message ?? gamesRes.error?.message,
        teams: teamsRes.error?.message,
      },
    };
  }

  const games = gamesRes.data ?? [];
  const gameIds = games.map((game: any) => game.id);
  const statsRes = gameIds.length
    ? await supabase.from('game_stats').select('game_id,player_id,is_goalie,games_played,goals,assists,goals_against').in('game_id', gameIds)
    : { data: [] as any[], error: null };

  if (statsRes.error) {
    return {
      players: [],
      teams: teamsRes.data ?? [],
      errors: { players: statsRes.error.message, teams: undefined },
    };
  }

  const teamNameById = new Map((teamsRes.data ?? []).map((team: any) => [team.id, team.name]));
  const playerById = new Map((playersRes.data ?? []).map((player: any) => [player.id, player]));
  const gameById = new Map(games.map((game: any) => [game.id, game]));
  const byPlayer = new Map<string, PlayerStats>();

  for (const player of playersRes.data ?? []) {
    byPlayer.set(player.id, {
      player_id: player.id,
      name: player.name,
      team_id: player.team_id,
      team_name: player.team_id ? (teamNameById.get(player.team_id) ?? 'Unknown') : 'Unassigned',
      position: player.position,
      jersey: player.jersey,
      games_played: 0,
      goals: 0,
      assists: 0,
      points: 0,
      wins: 0,
      goals_against: 0,
      fantasy_points: 0,
      fantasy_points_avg: 0,
    });
  }

  for (const stat of statsRes.data ?? []) {
    const player = playerById.get(stat.player_id);
    const row = byPlayer.get(stat.player_id);
    const game = gameById.get(stat.game_id);
    if (!player || !row || !game) continue;

    const gp = Number(stat.games_played || 0);
    const goals = Number(stat.goals || 0);
    const assists = Number(stat.assists || 0);
    const goalsAgainst = Number(stat.goals_against || 0);
    const goalieStat = Boolean(stat.is_goalie) || isGoalie(player.position) || goalsAgainst > 0;
    const goalieWin = goalieStat
      && game.status === 'FINAL'
      && ((player.team_id === game.home_team && Number(game.home_score) > Number(game.away_score))
        || (player.team_id === game.away_team && Number(game.away_score) > Number(game.home_score)))
      ? 1
      : 0;

    row.games_played += gp;
    row.goals += goals;
    row.assists += assists;
    row.points += goals + assists;
    row.goals_against += goalsAgainst;
    row.wins += goalieWin;
  }

  const players = Array.from(byPlayer.values()).map((row) => {
    // Weekly skater bonuses are slate/week scoped, so the season stats table uses raw DFS scoring.
    const fantasyPoints = isGoalie(row.position)
      ? computeGoalieFantasyPoints(row.wins, row.goals_against)
      : row.goals * 3 + row.assists * 2;
    return {
      ...row,
      fantasy_points: fantasyPoints,
      fantasy_points_avg: row.games_played > 0 ? Number((fantasyPoints / row.games_played).toFixed(2)) : 0,
    };
  }).sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name));

  return {
    season: seasonRes.data,
    players,
    teams: teamsRes.data ?? [],
    errors: {
      players: undefined,
      teams: undefined,
    },
  };
}
