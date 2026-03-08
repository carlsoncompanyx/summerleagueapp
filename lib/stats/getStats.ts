import { createAdminSupabaseClient } from '../supabase/admin';

export async function getSeasonStats(seasonId?: string) {
  const supabase = createAdminSupabaseClient();

  let playersQ = supabase.from('fantasy_points_v').select('*').order('fantasy_points', { ascending: false });
  let teamsQ = supabase.from('team_season_stats_v').select('*').order('points', { ascending: false });
  let seasonPlayersQ = supabase.from('player_season_stats_v').select('*').order('points', { ascending: false });

  if (seasonId) {
    playersQ = playersQ.eq('season_id', seasonId);
    teamsQ = teamsQ.eq('season_id', seasonId);
    seasonPlayersQ = seasonPlayersQ.eq('season_id', seasonId);
  }

  const [playersRes, teamsRes, seasonPlayersRes] = await Promise.all([playersQ, teamsQ, seasonPlayersQ]);

  return {
    players: playersRes.data ?? [],
    teams: teamsRes.data ?? [],
    seasonPlayers: seasonPlayersRes.data ?? [],
    errors: {
      players: playersRes.error?.message,
      teams: teamsRes.error?.message,
      seasonPlayers: seasonPlayersRes.error?.message,
    },
  };
}
