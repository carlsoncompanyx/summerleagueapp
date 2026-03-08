import { NextRequest, NextResponse } from 'next/server';

import { createAdminSupabaseClient } from '../../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';

function isAdminTestModeEnabled() {
  const flag = process.env.NEXT_PUBLIC_ADMIN_TEST_MODE === 'true';
  const env = process.env.VERCEL_ENV ?? 'development';
  return flag && env !== 'production';
}

async function getCurrentRole() {
  if (isAdminTestModeEnabled()) {
    return { userId: 'test-admin', role: 'ADMIN' as const };
  }

  const server = createServerSupabaseClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) return { userId: null, role: 'FAN' as const };

  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  return { userId: user.id, role: (profile?.role ?? 'FAN') as 'FAN' | 'PLAYER' | 'CAPTAIN' | 'ADMIN' };
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET() {
  const admin = createAdminSupabaseClient();
  const me = await getCurrentRole();

  const [seasons, teams, players, registrations, games, trades, gameStats, profiles] = await Promise.all([
    admin.from('seasons').select('*').order('start_date', { ascending: false }),
    admin.from('teams').select('*').order('name'),
    admin.from('players').select('*').order('name'),
    admin.from('registrations').select('*').order('created_at', { ascending: false }),
    admin.from('games').select('*').order('scheduled_at', { ascending: true }),
    admin.from('trades').select('*').order('created_at', { ascending: false }),
    admin.from('game_stats').select('*').order('created_at', { ascending: false }),
    admin.from('profiles').select('user_id, display_name, role, team_id').order('display_name'),
  ]);

  return NextResponse.json({
    role: me.role,
    userId: me.userId,
    testMode: isAdminTestModeEnabled(),
    seasons: seasons.data ?? [],
    teams: teams.data ?? [],
    players: players.data ?? [],
    registrations: registrations.data ?? [],
    games: games.data ?? [],
    trades: trades.data ?? [],
    gameStats: gameStats.data ?? [],
    profiles: profiles.data ?? [],
    errors: {
      seasons: seasons.error?.message,
      teams: teams.error?.message,
      players: players.error?.message,
      registrations: registrations.error?.message,
      games: games.error?.message,
      trades: trades.error?.message,
      gameStats: gameStats.error?.message,
      profiles: profiles.error?.message,
    },
  });
}

export async function POST(req: NextRequest) {
  const admin = createAdminSupabaseClient();
  const { action, payload } = await req.json();
  const me = await getCurrentRole();

  const adminOnly = new Set([
    'season_create', 'season_update', 'season_delete',
    'team_create', 'team_update', 'team_delete',
    'player_create', 'player_update', 'player_delete',
    'registrations_set_status', 'registration_assign_player',
    'game_create', 'game_update', 'game_delete', 'game_score_submit',
    'trade_approve', 'trade_reject',
    'import_players_csv', 'import_games_csv',
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
    } else if (action === 'registration_assign_player') {
      const { registrationId, team_id, name, jersey, position, nickname, user_id } = payload;
      const { data: reg, error: regError } = await admin.from('registrations').select('*').eq('id', registrationId).single();
      if (regError) throw regError;
      const seasonTeam = await admin.from('teams').select('id').eq('id', team_id).eq('season_id', reg.season_id).maybeSingle();
      if (seasonTeam.error || !seasonTeam.data) throw new Error('Assigned team must belong to the same season.');

      const { error: playerErr } = await admin.from('players').insert({
        team_id,
        user_id: user_id || reg.user_id,
        name,
        jersey: jersey ? Number(jersey) : null,
        position: position || null,
        nickname: nickname || null,
      });
      if (playerErr) throw playerErr;

      const { error: statusErr } = await admin.from('registrations').update({ status: 'approved' }).eq('id', registrationId);
      if (statusErr) throw statusErr;
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
        const { data: gameRow } = await admin.from('games').select('season_id').eq('id', gameId).single();
        const { error: statsError } = await admin.from('game_stats').insert(
          stats.map((row: any) => ({
            game_id: gameId,
            season_id: gameRow?.season_id ?? null,
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
        proposed_by: payload.proposed_by || me.userId,
        status: 'proposed',
      });
      if (error) throw error;
    } else if (action === 'trade_approve') {
      const { tradeId } = payload;
      const { data: trade, error: tradeReadError } = await admin.from('trades').select('*').eq('id', tradeId).single();
      if (tradeReadError) throw tradeReadError;

      if (Array.isArray(trade.players_out) && trade.players_out.length) {
        const { error: outErr } = await admin.from('players').update({ team_id: trade.to_team_id }).in('id', trade.players_out);
        if (outErr) throw outErr;
      }
      if (Array.isArray(trade.players_in) && trade.players_in.length) {
        const { error: inErr } = await admin.from('players').update({ team_id: trade.from_team_id }).in('id', trade.players_in);
        if (inErr) throw inErr;
      }

      const { error: tradeError } = await admin.from('trades').update({ status: 'admin_approved' }).eq('id', tradeId);
      if (tradeError) throw tradeError;
    } else if (action === 'trade_reject') {
      const { tradeId } = payload;
      const { error } = await admin.from('trades').update({ status: 'admin_declined' }).eq('id', tradeId);
      if (error) throw error;
    } else if (action === 'import_players_csv') {
      const rows = payload.rows as any[];
      const seasonNameToId = new Map<string, string>();
      const teamNameBySeason = new Map<string, string>();

      const { data: seasons } = await admin.from('seasons').select('id,name');
      (seasons ?? []).forEach((s: any) => seasonNameToId.set(String(s.name).toLowerCase(), s.id));
      const { data: teams } = await admin.from('teams').select('id,name,season_id');
      (teams ?? []).forEach((t: any) => teamNameBySeason.set(`${t.season_id}:${String(t.name).toLowerCase()}`, t.id));

      const mapped = rows.map((row, i) => {
        const seasonId = row.season_id || seasonNameToId.get(String(row.season_name || '').toLowerCase());
        const teamId = row.team_id || teamNameBySeason.get(`${seasonId}:${String(row.team_name || '').toLowerCase()}`);
        if (!teamId) throw new Error(`Row ${i + 1}: could not resolve team.`);
        return {
          team_id: teamId,
          user_id: row.user_id || null,
          name: row.name || row.display_name,
          jersey: row.jersey_number ? Number(row.jersey_number) : row.jersey ? Number(row.jersey) : null,
          position: row.position || null,
          nickname: row.nickname || null,
        };
      });

      const { error } = await admin.from('players').insert(mapped);
      if (error) throw error;
    } else if (action === 'import_games_csv') {
      const rows = payload.rows as any[];
      const { data: seasons } = await admin.from('seasons').select('id,name');
      const { data: teams } = await admin.from('teams').select('id,name,season_id');

      const seasonNameToId = new Map<string, string>();
      (seasons ?? []).forEach((s: any) => seasonNameToId.set(String(s.name).toLowerCase(), s.id));
      const teamBySeasonName = new Map<string, string>();
      (teams ?? []).forEach((t: any) => teamBySeasonName.set(`${t.season_id}:${String(t.name).toLowerCase()}`, t.id));

      const mapped: any[] = [];
      const errors: string[] = [];
      rows.forEach((row, i) => {
        const seasonId = row.season_id || seasonNameToId.get(String(row.season_name || '').toLowerCase());
        const homeTeam = row.home_team || teamBySeasonName.get(`${seasonId}:${String(row.home_team_name || '').toLowerCase()}`);
        const awayTeam = row.away_team || teamBySeasonName.get(`${seasonId}:${String(row.away_team_name || '').toLowerCase()}`);
        if (!seasonId || !homeTeam || !awayTeam) {
          errors.push(`Row ${i + 1}: could not resolve season/home/away team.`);
          return;
        }
        const scheduled = parseDate(row.scheduled_at);
        if (!scheduled) {
          errors.push(`Row ${i + 1}: invalid scheduled_at.`);
          return;
        }
        mapped.push({
          season_id: seasonId,
          home_team: homeTeam,
          away_team: awayTeam,
          scheduled_at: scheduled,
          location: row.location || null,
          status: row.status || 'SCHEDULED',
        });
      });

      if (errors.length) {
        return NextResponse.json({ error: 'CSV validation failed', rowErrors: errors }, { status: 400 });
      }

      const { error } = await admin.from('games').insert(mapped);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Operation failed.' }, { status: 500 });
  }
}
