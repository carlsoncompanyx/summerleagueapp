import { NextRequest, NextResponse } from 'next/server';
import { getSeasonStats } from '../../../../lib/stats/getStats';

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get('season_id') || undefined;
  const data = await getSeasonStats(seasonId);
  return NextResponse.json(data);
}
