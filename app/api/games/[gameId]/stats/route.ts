import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../../../lib/supabase/admin';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const admin = createAdminSupabaseClient();

  const { data: stats, error } = await admin
    .from('game_stats')
    .select('id,game_id,player_id,is_goalie,games_played,goals,assists,goals_against')
    .eq('game_id', gameId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const playerIds = (stats ?? []).map((s:any)=>s.player_id);
  const { data: players } = playerIds.length
    ? await admin.from('players').select('id,name,jersey,position,team_id').in('id', playerIds)
    : { data: [] as any[] };
  const playerById = new Map((players ?? []).map((p:any)=>[p.id,p]));

  return NextResponse.json({
    stats: (stats ?? []).map((row: any) => ({
      ...row,
      player_name: playerById.get(row.player_id)?.name ?? null,
      jersey: playerById.get(row.player_id)?.jersey ?? null,
      position: playerById.get(row.player_id)?.position ?? null,
      team_id: playerById.get(row.player_id)?.team_id ?? null,
    })),
  });
}
