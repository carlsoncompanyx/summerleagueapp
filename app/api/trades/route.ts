import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../lib/supabase/server';

function testModeAdmin() {
  return process.env.NEXT_PUBLIC_ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

async function getActor() {
  if (testModeAdmin()) {
    const admin = createAdminSupabaseClient();
    const { data: profile } = await admin.from('profiles').select('user_id').limit(1).maybeSingle();
    return { userId: profile?.user_id ?? null, role: 'ADMIN' as const };
  }
  const server = createServerSupabaseClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return { userId: null, role: 'FAN' as const };
  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  return { userId: user.id, role: (profile?.role ?? 'FAN') as 'FAN'|'PLAYER'|'CAPTAIN'|'ADMIN' };
}

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get('season_id');
  const admin = createAdminSupabaseClient();
  const actor = await getActor();

  let tradesQ = admin.from('trades').select('*').order('created_at', { ascending: false });
  if (seasonId) tradesQ = tradesQ.eq('season_id', seasonId);
  const [trades, teams, players, stats] = await Promise.all([
    tradesQ,
    admin.from('teams').select('id,name,season_id,captain_user_id'),
    admin.from('players').select('id,name,team_id,position,jersey'),
    seasonId ? admin.from('player_season_stats_v').select('*').eq('season_id', seasonId) : admin.from('player_season_stats_v').select('*'),
  ]);

  const playerStats = stats.data ?? [];
  return NextResponse.json({
    actor,
    trades: trades.data ?? [],
    teams: teams.data ?? [],
    players: (players.data ?? []).map((p: any) => ({
      ...p,
      stats: playerStats.find((s: any) => s.player_id === p.id) ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = createAdminSupabaseClient();
  const actor = await getActor();
  const { action, payload } = await req.json();

  try {
    if (action === 'propose') {
      if (!['CAPTAIN', 'ADMIN'].includes(actor.role)) return NextResponse.json({ error: 'Captain/Admin only' }, { status: 403 });
      const { data: trade, error } = await admin.from('trades').insert({
        season_id: payload.season_id,
        from_team_id: payload.from_team_id,
        to_team_id: payload.to_team_id,
        proposed_by: payload.proposed_by || actor.userId,
        players_out: payload.players_out,
        players_in: payload.players_in,
        message: payload.message || null,
        status: 'proposed',
      }).select('id').single();
      if (error) throw error;
      await admin.from('trade_status_history').insert({ trade_id: trade.id, from_status: 'proposed', to_status: 'proposed', changed_by: actor.userId });
      return NextResponse.json({ ok: true });
    }

    if (action === 'captain_response') {
      const { trade_id, accept } = payload;
      const status = accept ? 'accepted_by_other' : 'declined';
      const { error } = await admin.from('trades').update({ status }).eq('id', trade_id);
      if (!error) await admin.from('trade_status_history').insert({ trade_id, from_status: 'proposed', to_status: status, changed_by: actor.userId });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'admin_review') {
      if (actor.role !== 'ADMIN') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { trade_id, approve } = payload;
      const { data: trade, error: tradeErr } = await admin.from('trades').select('*').eq('id', trade_id).single();
      if (tradeErr) throw tradeErr;

      if (!approve) {
        const { error } = await admin.from('trades').update({ status: 'admin_declined' }).eq('id', trade_id);
        if (!error) await admin.from('trade_status_history').insert({ trade_id, from_status: trade.status, to_status: 'admin_declined', changed_by: actor.userId });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (Array.isArray(trade.players_out) && trade.players_out.length) {
        const { error: outErr } = await admin.from('players').update({ team_id: trade.to_team_id }).in('id', trade.players_out);
        if (outErr) throw outErr;
      }
      if (Array.isArray(trade.players_in) && trade.players_in.length) {
        const { error: inErr } = await admin.from('players').update({ team_id: trade.from_team_id }).in('id', trade.players_in);
        if (inErr) throw inErr;
      }

      const { error } = await admin.from('trades').update({ status: 'completed' }).eq('id', trade_id);
      if (!error) await admin.from('trade_status_history').insert({ trade_id, from_status: trade.status, to_status: 'completed', changed_by: actor.userId });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 });
  }
}
