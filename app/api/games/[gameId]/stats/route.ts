import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../../../lib/supabase/admin';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const admin = createAdminSupabaseClient();

  const { data: stats, error } = await admin
    .from('game_stats')
    .select('id,player_id,position,goals,assists,goals_against,players(name)')
    .eq('game_id', gameId)
    .order('goals', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    stats: (stats ?? []).map((row: any) => ({
      ...row,
      player_name: row.players?.name ?? null,
    })),
  });
}
