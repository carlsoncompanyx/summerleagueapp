import { NextRequest, NextResponse } from 'next/server';

import { createAdminSupabaseClient } from '../../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';

function isAdminTestModeEnabled() {
  const flag = process.env.NEXT_PUBLIC_ADMIN_TEST_MODE === 'true';
  const env = process.env.VERCEL_ENV ?? 'development';
  return flag && env !== 'production';
}

async function getCurrentRole() {
  if (isAdminTestModeEnabled()) return { userId: 'test-admin', role: 'ADMIN' as const };

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

  return {
    userId: user.id,
    role: (profile?.role ?? 'FAN') as 'FAN' | 'PLAYER' | 'CAPTAIN' | 'ADMIN',
  };
}

function toIso(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}


async function validateTeamSeason(admin: any, season_id: string | null | undefined, team_id: string | null | undefined) {
  if (!team_id) return;
  const { data: team, error } = await admin.from('teams').select('season_id').eq('id', team_id).maybeSingle();
  if (error) throw error;
  if (!team) throw new Error('Selected team does not exist.');
  if (season_id && team.season_id !== season_id) throw new Error('Selected team is not in selected season.');
}
export async function GET() {
  const admin = createAdminSupabaseClient();
  const me = await getCurrentRole();

  const [seasons, teams, players, registrations, games, trades, gameStats, profiles] =
    await Promise.all([
      admin.from('seasons').select('*').order('start_date', { ascending: false }),
      admin.from('teams').select('*').order('name'),
      admin.from('players').select('*').order('name'),
      admin.from('registrations').select('*').order('created_at', { ascending: false }),
      admin.from('games').select('*').order('scheduled_at', { ascending: true }),
      admin.from('trades').select('*').order('created_at', { ascending: false }),
      admin.from('game_stats').select('*').order('created_at', { ascending: false }),
      admin.from('profiles').select('user_id, first_name, last_name, display_name, role, team_id').order('created_at'),
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
    'registration_assign_player',
    'game_create',
    'game_update',
    'game_delete',
    'game_score_submit',
    'trade_approve',
    'trade_reject',
    'import_players_csv',
    'import_games_csv',
  ]);

  if (adminOnly.has(action) && me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  if (action === 'trade_propose' && !['ADMIN', 'CAPTAIN'].includes(me.role)) {
    return NextResponse.json(
      { error: 'Captain or Admin role required to propose trades.' },
      { status: 403 },
    );
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
      const row = {
        ...payload,
        team_id: payload.team_id || null,
        season_id: payload.season_id || null,
      };
      await validateTeamSeason(admin, row.season_id, row.team_id);
      const { error } = await admin.from('players').insert(row);
      if (error) throw error;
    } else if (action === 'player_update') {
      const { id, ...rest } = payload;
      const row = {
        ...rest,
        team_id: rest.team_id || null,
        season_id: rest.season_id || null,
      };
      await validateTeamSeason(admin, row.season_id, row.team_id);
      const { error } = await admin.from('players').update(row).eq('id', id);
      if (error) throw error;
    } else if (action === 'player_delete') {
      const { error } = await admin.from('players').delete().eq('id', payload.id);
      if (error) throw error;
    } else if (action === 'registrations_set_status') {
      const { id, status } = payload;
      const { error } = await admin.from('registrations').update({ status }).eq('id', id);
      if (error) throw error;
    } else if (action === 'registration_assign_player') {
      const { registrationId, team_id, name, jersey, position, user_id } = payload;
      const { data: reg, error: regError } = await admin
        .from('registrations')
        .select('*')
        .eq('id', registrationId)
        .single();
      if (regError) throw regError;

      const { data: team, error: teamErr } = await admin
        .from('teams')
        .select('id')
        .eq('id', team_id)
        .eq('season_id', reg.season_id)
        .maybeSingle();
      if (teamErr || !team) throw new Error('Assigned team must belong to same season.');

      const { error: playerErr } = await admin.from('players').insert({
        season_id: reg.season_id,
        team_id,
        user_id: user_id || reg.user_id,
        name,
        jersey: jersey ? Number(jersey) : null,
        position: position || null,
      });
      if (playerErr) throw playerErr;

      const { error: regStatusErr } = await admin
        .from('registrations')
        .update({ status: 'approved' })
        .eq('id', registrationId);
      if (regStatusErr) throw regStatusErr;
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

      if (Array.isArray(stats) && stats.length) {
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
      const { data: trade, error: tradeErr } = await admin
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();
      if (tradeErr) throw tradeErr;

      if (Array.isArray(trade.players_out) && trade.players_out.length) {
        const { error: outErr } = await admin
          .from('players')
          .update({ team_id: trade.to_team_id })
          .in('id', trade.players_out);
        if (outErr) throw outErr;
      }
      if (Array.isArray(trade.players_in) && trade.players_in.length) {
        const { error: inErr } = await admin
          .from('players')
          .update({ team_id: trade.from_team_id })
          .in('id', trade.players_in);
        if (inErr) throw inErr;
      }

      const { error: statusErr } = await admin
        .from('trades')
        .update({ status: 'admin_approved' })
        .eq('id', tradeId);
      if (statusErr) throw statusErr;
    } else if (action === 'trade_reject') {
      const { tradeId } = payload;
      const { error } = await admin
        .from('trades')
        .update({ status: 'admin_declined' })
        .eq('id', tradeId);
      if (error) throw error;
    } else if (action === 'import_players_csv') {
      const rows = payload.rows as any[];
      const { data: seasons } = await admin.from('seasons').select('id,name');
      const { data: teams } = await admin.from('teams').select('id,name,season_id');

      const seasonNameToId = new Map<string, string>();
      (seasons ?? []).forEach((s: any) => seasonNameToId.set(String(s.name).toLowerCase(), s.id));
      const teamNameBySeason = new Map<string, string>();
      (teams ?? []).forEach((t: any) => teamNameBySeason.set(`${t.season_id}:${String(t.name).toLowerCase()}`, t.id));

      const mapped: any[] = [];
      const rowErrors: string[] = [];

      rows.forEach((row, i) => {
        const seasonId = row.season_id || seasonNameToId.get(String(row.season_name || '').toLowerCase());
        const teamId = row.team_id || teamNameBySeason.get(`${seasonId}:${String(row.team_name || '').toLowerCase()}`);

        if (!seasonId) {
          rowErrors.push(`Row ${i + 1}: season could not be resolved.`);
          return;
        }
        if ((row.team_name || row.team_id) && !teamId) {
          rowErrors.push(`Row ${i + 1}: team '${row.team_name || row.team_id || ''}' could not be resolved in selected season.`);
          return;
        }
        if (!row.name && !row.display_name) {
          rowErrors.push(`Row ${i + 1}: player name is required.`);
          return;
        }

        mapped.push({
          season_id: seasonId,
          team_id: teamId || null,
          user_id: row.user_id || null,
          name: row.name || row.display_name,
          jersey: row.jersey_number ? Number(row.jersey_number) : row.jersey ? Number(row.jersey) : null,
          position: row.position || null,
        });
      });

      if (rowErrors.length) {
        return NextResponse.json({ error: 'CSV validation failed', rowErrors }, { status: 400 });
      }

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
      const rowErrors: string[] = [];
      rows.forEach((row, i) => {
        const seasonId = row.season_id || seasonNameToId.get(String(row.season_name || '').toLowerCase());
        const homeTeam = row.home_team || teamBySeasonName.get(`${seasonId}:${String(row.home_team_name || '').toLowerCase()}`);
        const awayTeam = row.away_team || teamBySeasonName.get(`${seasonId}:${String(row.away_team_name || '').toLowerCase()}`);
        if (!seasonId || !homeTeam || !awayTeam) {
          rowErrors.push(`Row ${i + 1}: could not resolve season/home/away team.`);
          return;
        }
        const scheduled = toIso(row.scheduled_at);
        if (!scheduled) {
          rowErrors.push(`Row ${i + 1}: invalid scheduled_at.`);
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

      if (rowErrors.length) {
        return NextResponse.json({ error: 'CSV validation failed', rowErrors }, { status: 400 });
      }

      const { error } = await admin.from('games').insert(mapped);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Operation failed.' }, { status: 500 });
  }
}
