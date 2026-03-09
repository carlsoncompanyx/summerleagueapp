import { createAdminSupabaseClient } from '../supabase/admin';

export async function getSeasonStats(seasonId?: string) {
  const supabase = createAdminSupabaseClient();

  let playersQ = supabase.from('player_season_stats_v').select('*').order('points', { ascending: false });
  let teamsQ = supabase.from('team_season_stats_v').select('*').order('points', { ascending: false });

  if (seasonId) {
    playersQ = playersQ.eq('season_id', seasonId);
    teamsQ = teamsQ.eq('season_id', seasonId);
  }

  const [playersRes, teamsRes, teamRowsRes] = await Promise.all([
    playersQ,
    teamsQ,
    supabase.from('teams').select('id,name'),
  ]);

  const teamNameById = new Map((teamRowsRes.data ?? []).map((t: any) => [t.id, t.name]));

  return {
    players: (playersRes.data ?? []).map((row: any) => ({
      ...row,
      team_name: teamNameById.get(row.team_id) ?? 'Unknown',
    })),
    teams: teamsRes.data ?? [],
    errors: {
      players: playersRes.error?.message,
      teams: teamsRes.error?.message,
    },
  };
}
