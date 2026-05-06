import { NextRequest, NextResponse } from 'next/server';
import { listAuthUserProfiles, roleFromAuthUser } from '../../../lib/auth/metadata';
import { createAdminSupabaseClient } from '../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { isAdminRole, isCaptainRole, normalizeRole } from '../../../lib/roles';

function testModeAdmin() {
  return process.env.ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

async function getActor() {
  const admin = createAdminSupabaseClient();
  if (testModeAdmin()) {
    const { profiles } = await listAuthUserProfiles(admin);
    const profile = profiles[0];
    return { userId: profile?.user_id ?? null, role: 'ADMIN' as const };
  }

  const server = createServerSupabaseClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return { userId: null, role: 'FAN' as const };

  return { userId: user.id, role: normalizeRole(roleFromAuthUser(user)) as 'FAN' | 'PLAYER' | 'CAPTAIN' | 'ADMIN' };
}

async function getCaptainTeamIds(admin: any, userId: string | null | undefined) {
  if (!userId) return [] as string[];
  const { data: teams, error } = await admin.from('teams').select('id').eq('captain_user_id', userId);
  if (error) throw error;
  return (teams ?? []).map((t: any) => t.id);
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  proposed: ['accepted_by_other', 'declined', 'admin_declined'],
  accepted_by_other: ['completed', 'admin_declined'],
  declined: [],
  admin_declined: [],
  completed: [],
  admin_approved: ['completed'],
};

function isTransitionValid(fromStatus: string, toStatus: string) {
  return (ALLOWED_TRANSITIONS[fromStatus] ?? []).includes(toStatus);
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
    admin.from('players').select('id,name,team_id,position,jersey,season_id'),
    seasonId ? admin.from('player_season_stats_v').select('*').eq('season_id', seasonId) : admin.from('player_season_stats_v').select('*'),
  ]);

  const playerStats = stats.data ?? [];
  const captainTeamIds = new Set(await getCaptainTeamIds(admin, actor.userId));
  const tradeRows = trades.data ?? [];

  return NextResponse.json({
    actor,
    trades: tradeRows,
    teams: teams.data ?? [],
    players: (players.data ?? []).map((p: any) => ({
      ...p,
      stats: playerStats.find((s: any) => s.player_id === p.id) ?? null,
    })),
    tradeBuckets: {
      incoming: tradeRows.filter((t: any) => captainTeamIds.has(t.to_team_id) && t.status === 'proposed'),
      outgoing: tradeRows.filter((t: any) => captainTeamIds.has(t.from_team_id)),
      awaitingLeagueReview: tradeRows.filter((t: any) => t.status === 'accepted_by_other'),
      finalized: tradeRows.filter((t: any) => ['completed', 'admin_declined', 'declined'].includes(t.status)),
    },
  });
}

export async function POST(req: NextRequest) {
  const admin = createAdminSupabaseClient();
  const actor = await getActor();
  const { action, payload } = await req.json();

  try {
    if (action === 'propose') {
      if (!(isCaptainRole(actor.role) || isAdminRole(actor.role))) {
        return NextResponse.json({ error: 'Captain/Admin only' }, { status: 403 });
      }

      const captainTeamIds = new Set(await getCaptainTeamIds(admin, actor.userId));
      if (!isAdminRole(actor.role) && !captainTeamIds.has(payload.from_team_id)) {
        return NextResponse.json({ error: 'Only the captain of the source team can propose this trade.' }, { status: 403 });
      }

      const { data: fromTeam } = await admin.from('teams').select('id,season_id').eq('id', payload.from_team_id).maybeSingle();
      const { data: toTeam } = await admin.from('teams').select('id,season_id').eq('id', payload.to_team_id).maybeSingle();
      if (!fromTeam || !toTeam) return NextResponse.json({ error: 'Both teams must exist.' }, { status: 400 });
      if (fromTeam.season_id !== toTeam.season_id) return NextResponse.json({ error: 'Teams must be in the same season.' }, { status: 400 });

      const playersOut = Array.isArray(payload.players_out) ? payload.players_out : [];
      const playersIn = Array.isArray(payload.players_in) ? payload.players_in : [];
      if (!playersOut.length || !playersIn.length) {
        return NextResponse.json({ error: 'Both sides must include at least one player.' }, { status: 400 });
      }

      const [outRows, inRows] = await Promise.all([
        admin.from('players').select('id').in('id', playersOut).eq('team_id', payload.from_team_id),
        admin.from('players').select('id').in('id', playersIn).eq('team_id', payload.to_team_id),
      ]);
      if ((outRows.data ?? []).length !== playersOut.length) {
        return NextResponse.json({ error: 'All outgoing players must currently belong to the source team.' }, { status: 400 });
      }
      if ((inRows.data ?? []).length !== playersIn.length) {
        return NextResponse.json({ error: 'All incoming players must currently belong to the target team.' }, { status: 400 });
      }

      const { data: trade, error } = await admin.from('trades').insert({
        season_id: payload.season_id || fromTeam.season_id,
        from_team_id: payload.from_team_id,
        to_team_id: payload.to_team_id,
        proposed_by: payload.proposed_by || actor.userId,
        players_out: playersOut,
        players_in: playersIn,
        message: payload.message || null,
        status: 'proposed',
      }).select('id').single();
      if (error) throw error;

      await admin.from('trade_status_history').insert({
        trade_id: trade.id,
        from_status: 'proposed',
        to_status: 'proposed',
        changed_by: actor.userId,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'captain_response') {
      const { trade_id, accept } = payload;
      const { data: trade, error: tradeErr } = await admin.from('trades').select('*').eq('id', trade_id).single();
      if (tradeErr) throw tradeErr;

      if (trade.status !== 'proposed') {
        return NextResponse.json({ error: 'Only proposed trades can be accepted or declined.' }, { status: 400 });
      }

      const captainTeamIds = new Set(await getCaptainTeamIds(admin, actor.userId));
      if (!isAdminRole(actor.role) && !captainTeamIds.has(trade.to_team_id)) {
        return NextResponse.json({ error: 'Only the receiving team captain can respond to this trade.' }, { status: 403 });
      }

      const status = accept ? 'accepted_by_other' : 'declined';
      if (!isTransitionValid(trade.status, status)) {
        return NextResponse.json({ error: `Invalid status transition from ${trade.status} to ${status}.` }, { status: 400 });
      }

      const { error } = await admin.from('trades').update({ status }).eq('id', trade_id).eq('status', 'proposed');
      if (error) throw error;

      await admin.from('trade_status_history').insert({
        trade_id,
        from_status: trade.status,
        to_status: status,
        changed_by: actor.userId,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'admin_review') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { trade_id, approve } = payload;
      const { data: trade, error: tradeErr } = await admin.from('trades').select('*').eq('id', trade_id).single();
      if (tradeErr) throw tradeErr;

      if (!approve) {
        if (!isTransitionValid(trade.status, 'admin_declined')) {
          return NextResponse.json({ error: `Cannot reject trade while in status ${trade.status}.` }, { status: 400 });
        }
        const { error } = await admin.from('trades').update({ status: 'admin_declined' }).eq('id', trade_id);
        if (error) throw error;

        await admin.from('trade_status_history').insert({
          trade_id,
          from_status: trade.status,
          to_status: 'admin_declined',
          changed_by: actor.userId,
        });
        return NextResponse.json({ ok: true });
      }

      if (!isTransitionValid(trade.status, 'completed')) {
        return NextResponse.json({ error: 'Trade must be accepted by the other captain before admin execution.' }, { status: 400 });
      }

      const { error: rpcErr } = await admin.rpc('execute_trade_if_valid', {
        p_trade_id: trade_id,
        p_admin_user_id: actor.userId,
      });
      if (rpcErr) throw rpcErr;

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 });
  }
}
