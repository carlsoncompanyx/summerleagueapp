import { NextRequest, NextResponse } from 'next/server';

import { createAdminSupabaseClient } from '../../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';

async function getCurrentRole() {
  const server = createServerSupabaseClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) return { userId: null, role: 'FAN' };

  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  return { userId: user.id, role: profile?.role ?? 'FAN' };
}

export async function GET() {
  const admin = createAdminSupabaseClient();
  const me = await getCurrentRole();

  const [seasons, teams, players, registrations, games, trades, gameStats] = await Promise.all([
    admin.from('seasons').select('*').order('start_date', { ascending: false }),
    admin.from('teams').select('*').order('name'),
    admin.from('players').select('*').order('name'),
    admin.from('registrations').select('*').order('created_at', { ascending: false }),
    admin.from('games').select('*').order('scheduled_at', { ascending: true }),
    admin.from('trades').select('*').order('created_at', { ascending: false }),
    admin.from('game_stats').select('*').order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({
    role: me.role,
    userId: me.userId,
    seasons: seasons.data ?? [],
    teams: teams.data ?? [],
    players: players.data ?? [],
    registrations: registrations.data ?? [],
    games: games.data ?? [],
    trades: trades.data ?? [],
    gameStats: gameStats.data ?? [],
    errors: {
      seasons: seasons.error?.message,
      teams: teams.error?.message,
      players: players.error?.message,
      registrations: registrations.error?.message,
      games: games.error?.message,
      trades: trades.error?.message,
      gameStats: gameStats.error?.message,
    },
  });
}

export async function POST(req: NextRequest) {
  const admin = createAdminSupabaseClient();
  const { action, payload } = await req.json();
  const me = await getCurrentRole();

  const adminOnly = new Set([
    'season_create',
    'season_update',
    'season_delete',
    'team_create',
    'team_update',
    'team_delete',
    'player_create',
    'player_update',
    'player_delete',
    'registrations_set_status',
    'game_create',
    'game_update',
    'game_delete',
    'game_score_submit',
    'trade_approve',
    'trade_reject',
    'import_teams_csv',
    'import_players_csv',
  ]);

  if (adminOnly.has(action) && me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  if (action === 'trade_propose' && !['ADMIN', 'CAPTAIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Captain or Admin role required to propose trades.' }, { status: 403 });
  }

  try {
    if (action === 'season_create') {
      const { error } = await admin.from('seasons').insert(payload);
      if (error) throw error;
    } else if (action === 'season_update') {
      const { id, ...rest } = payload;
      const { error } = await admin.from('seasons').update(rest).eq('id', id);
      if (error) throw error;
    } else if (action === 'season_delete') {
      const { error } = await admin.from('seasons').delete().eq('id', payload.id);
      if (error) throw error;
    } else if (action === 'team_create') {
      const { error } = await admin.from('teams').insert(payload);
      if (error) throw error;
    } else if (action === 'team_update') {
      const { id, ...rest } = payload;
      const { error } = await admin.from('teams').update(rest).eq('id', id);
      if (error) throw error;
    } else if (action === 'team_delete') {
      const { error } = await admin.from('teams').delete().eq('id', payload.id);
      if (error) throw error;
    } else if (action === 'player_create') {
      const { error } = await admin.from('players').insert(payload);
      if (error) throw error;
    } else if (action === 'player_update') {
      const { id, ...rest } = payload;
      const { error } = await admin.from('players').update(rest).eq('id', id);
      if (error) throw error;
    } else if (action === 'player_delete') {
      const { error } = await admin.from('players').delete().eq('id', payload.id);
      if (error) throw error;
    } else if (action === 'registrations_set_status') {
      const { id, status } = payload;
      const { error } = await admin.from('registrations').update({ status }).eq('id', id);
      if (error) throw error;
    } else if (action === 'game_create') {
      const { error } = await admin.from('games').insert(payload);
      if (error) throw error;
    } else if (action === 'game_update') {
      const { id, ...rest } = payload;
      const { error } = await admin.from('games').update(rest).eq('id', id);
      if (error) throw error;
    } else if (action === 'game_delete') {
      const { error } = await admin.from('games').delete().eq('id', payload.id);
      if (error) throw error;
    } else if (action === 'game_score_submit') {
      const { gameId, homeScore, awayScore, stats } = payload;
      const { error: gameError } = await admin
        .from('games')
        .update({ home_score: homeScore, away_score: awayScore, status: 'FINAL' })
        .eq('id', gameId);
      if (gameError) throw gameError;

      const { error: deleteError } = await admin.from('game_stats').delete().eq('game_id', gameId);
      if (deleteError) throw deleteError;

      if (Array.isArray(stats) && stats.length > 0) {
        const { error: statsError } = await admin.from('game_stats').insert(
          stats.map((row: any) => ({
            game_id: gameId,
            player_id: row.player_id,
            team_id: row.team_id,
            games_played: Number(row.games_played || 0),
            goals: Number(row.goals || 0),
            assists: Number(row.assists || 0),
            goals_against: Number(row.goals_against || 0),
            position: row.position,
          })),
        );
        if (statsError) throw statsError;
      }
    } else if (action === 'trade_propose') {
      const { error } = await admin.from('trades').insert({
        ...payload,
        status: 'proposed',
      });
      if (error) throw error;
    } else if (action === 'trade_approve') {
      const { tradeId, playerId, toTeamId } = payload;
      const { error: playerError } = await admin.from('players').update({ team_id: toTeamId }).eq('id', playerId);
      if (playerError) throw playerError;
      const { error: tradeError } = await admin.from('trades').update({ status: 'admin_approved' }).eq('id', tradeId);
      if (tradeError) throw tradeError;
    } else if (action === 'trade_reject') {
      const { error } = await admin.from('trades').delete().eq('id', payload.tradeId);
      if (error) throw error;
    } else if (action === 'import_teams_csv') {
      const { rows } = payload;
      if (Array.isArray(rows) && rows.length) {
        const { error } = await admin.from('teams').insert(rows);
        if (error) throw error;
      }
    } else if (action === 'import_players_csv') {
      const { rows } = payload;
      if (Array.isArray(rows) && rows.length) {
        const { error } = await admin.from('players').insert(rows);
        if (error) throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Operation failed.' }, { status: 500 });
  }
}
