import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { buildSlateValuations, getFantasyPlayerDetails } from '../../../lib/dfs/valuation';

const REQUIRED_SLOTS = ['G', 'F1', 'F2', 'D1', 'D2', 'FLEX', 'UTIL'];

function testModeAdmin() {
  return process.env.NEXT_PUBLIC_ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

function isAdminRole(role: string | null | undefined) {
  return role === 'ADMIN';
}

async function getCurrentActor() {
  const admin = createAdminSupabaseClient();
  if (testModeAdmin()) {
    const { data: profile } = await admin.from('profiles').select('user_id,role').limit(1).maybeSingle();
    return { userId: profile?.user_id ?? null, role: profile?.role ?? 'ADMIN' };
  }

  const server = createServerSupabaseClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return { userId: null, role: 'FAN' };
  const { data: profile } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  return { userId: user.id, role: profile?.role ?? 'FAN' };
}

function parsePosition(position: string | null | undefined) {
  const p = (position ?? '').toLowerCase();
  if (p.includes('goal')) return 'G';
  if (p.includes('def')) return 'D';
  return 'F';
}

function validateSlots(slots: any[]) {
  const slotsSet = new Set(slots.map((s) => s.slot));
  for (const required of REQUIRED_SLOTS) {
    if (!slotsSet.has(required)) return `Missing required slot: ${required}`;
  }
  if (slots.length !== REQUIRED_SLOTS.length) return 'Lineup must have exactly one player for each required slot.';
  return null;
}

export async function GET(req: NextRequest) {
  const slateId = req.nextUrl.searchParams.get('slate_id');
  const playerId = req.nextUrl.searchParams.get('player_id');
  const seasonId = req.nextUrl.searchParams.get('season_id') || undefined;
  const actor = await getCurrentActor();

  if (playerId) {
    const details = await getFantasyPlayerDetails(playerId, seasonId);
    if (!details) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    return NextResponse.json(details);
  }

  const admin = createAdminSupabaseClient();
  const [slates, contests, slatePlayers] = await Promise.all([
    admin.from('slates').select('*').order('lock_at', { ascending: true }),
    admin.from('contests').select('*').order('lock_at', { ascending: true }),
    slateId
      ? admin.from('slate_players').select('*').eq('slate_id', slateId).order('projection_points', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const rawPlayers = (slatePlayers as any).data ?? [];
  const ids = rawPlayers.map((p: any) => p.player_id);
  const { data: players } = ids.length
    ? await admin.from('players').select('id,name,team_id,position,jersey').in('id', ids)
    : { data: [] as any[] };
  const teamIds = (players ?? []).map((p: any) => p.team_id).filter(Boolean);
  const { data: teams } = teamIds.length
    ? await admin.from('teams').select('id,name').in('id', teamIds)
    : { data: [] as any[] };
  const teamById = new Map((teams ?? []).map((t: any) => [t.id, t.name]));
  const byId = new Map((players ?? []).map((p: any) => [p.id, p]));
  const merged = rawPlayers.map((p: any) => {
    const player = byId.get(p.player_id) ?? null;
    return {
      ...p,
      player: player ? { ...player, team_name: teamById.get(player.team_id) ?? null } : null,
    };
  });

  const entriesQ = actor.userId
    ? await admin.from('contest_entries').select('id,contest_id,user_id,lineup_name,projected_points,actual_points,salary_used,created_at').eq('user_id', actor.userId).order('created_at', { ascending: false })
    : { data: [] as any[] };

  return NextResponse.json({
    actor,
    slates: slates.data ?? [],
    contests: contests.data ?? [],
    slatePlayers: merged,
    myEntries: entriesQ.data ?? [],
  });
}

export async function POST(req: NextRequest) {
  const { action, payload } = await req.json();
  const admin = createAdminSupabaseClient();
  const actor = await getCurrentActor();

  try {
    if (action === 'create_slate') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { data: slate, error } = await admin.from('slates').insert({
        season_id: payload.season_id,
        name: payload.name,
        lock_at: payload.lock_at,
        status: payload.status ?? 'draft',
        created_by: actor.userId,
      }).select('*').single();
      if (error) throw error;

      if (Array.isArray(payload.game_ids) && payload.game_ids.length) {
        const rows = payload.game_ids.map((gameId: string) => ({ slate_id: slate.id, game_id: gameId }));
        const { error: sgErr } = await admin.from('slate_games').insert(rows);
        if (sgErr) throw sgErr;
      }

      const valuations = await buildSlateValuations({ slateId: slate.id, seasonId: payload.season_id });
      if (valuations.length) {
        const { error: spErr } = await admin.from('slate_players').insert(valuations);
        if (spErr) throw spErr;
      }
      return NextResponse.json({ ok: true, slate });
    }

    if (action === 'update_slate_status') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { error } = await admin.from('slates').update({ status: payload.status }).eq('id', payload.slate_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_contest') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { error } = await admin.from('contests').insert({
        slate_id: payload.slate_id,
        name: payload.name,
        salary_cap: payload.salary_cap ?? 50000,
        max_entries: payload.max_entries ?? 5,
        lock_at: payload.lock_at,
        roster_config: payload.roster_config ?? { G: 1, F: 2, D: 2, FLEX: 1, UTIL: 1 },
        status: payload.status ?? 'open',
        created_by: actor.userId,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'update_contest_status') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { error } = await admin.from('contests').update({ status: payload.status }).eq('id', payload.contest_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'submit_entry') {
      if (!actor.userId) return NextResponse.json({ error: 'Login required' }, { status: 401 });
      const { contest_id, lineup_name, slots } = payload;

      const slotValidationError = validateSlots(slots ?? []);
      if (slotValidationError) return NextResponse.json({ error: slotValidationError }, { status: 400 });

      const { data: contest, error: contestErr } = await admin.from('contests').select('*').eq('id', contest_id).single();
      if (contestErr) throw contestErr;

      if (!['open', 'live'].includes((contest.status ?? '').toLowerCase())) {
        return NextResponse.json({ error: 'Contest is not accepting entries.' }, { status: 400 });
      }
      if (new Date(contest.lock_at).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Contest is locked.' }, { status: 400 });
      }

      const { data: entries } = await admin.from('contest_entries').select('id').eq('contest_id', contest_id).eq('user_id', actor.userId);
      if ((entries ?? []).length >= contest.max_entries) {
        return NextResponse.json({ error: 'Entry limit reached.' }, { status: 400 });
      }

      const playerIds = slots.map((s: any) => s.player_id);
      if (new Set(playerIds).size !== playerIds.length) return NextResponse.json({ error: 'Duplicate players in lineup.' }, { status: 400 });

      const { data: slatePlayers } = await admin.from('slate_players').select('*').eq('slate_id', contest.slate_id).in('player_id', playerIds);
      if ((slatePlayers ?? []).length !== playerIds.length) return NextResponse.json({ error: 'One or more players are not in this slate.' }, { status: 400 });

      const { data: playerRows } = await admin.from('players').select('id,position').in('id', playerIds);
      const posById = new Map((playerRows ?? []).map((p: any) => [p.id, parsePosition(p.position)]));

      for (const slot of slots) {
        const pos = posById.get(slot.player_id);
        if (!pos) return NextResponse.json({ error: 'Missing player position for lineup validation.' }, { status: 400 });
        if (slot.slot === 'G' && pos !== 'G') return NextResponse.json({ error: 'Goalie slot requires a goalie.' }, { status: 400 });
        if (slot.slot.startsWith('D') && pos !== 'D') return NextResponse.json({ error: `${slot.slot} requires a defense player.` }, { status: 400 });
        if (slot.slot.startsWith('F') && pos === 'G') return NextResponse.json({ error: `${slot.slot} requires a skater.` }, { status: 400 });
      }

      const salaryUsed = (slatePlayers ?? []).reduce((sum: number, p: any) => sum + (p.salary || 0), 0);
      if (salaryUsed > contest.salary_cap) return NextResponse.json({ error: 'Salary cap exceeded.' }, { status: 400 });

      const projected = (slatePlayers ?? []).reduce((sum: number, p: any) => sum + Number(p.projection_points || 0), 0);

      const { data: entry, error: entryErr } = await admin.from('contest_entries').insert({
        contest_id,
        user_id: actor.userId,
        lineup_name,
        salary_used: salaryUsed,
        projected_points: projected,
      }).select('*').single();
      if (entryErr) throw entryErr;

      const rows = slots.map((s: any) => {
        const sp = (slatePlayers ?? []).find((p: any) => p.player_id === s.player_id);
        return {
          entry_id: entry.id,
          player_id: s.player_id,
          slate_player_id: sp?.id,
          slot: s.slot,
          salary_snapshot: sp?.salary ?? 0,
          projection_snapshot: sp?.projection_points ?? 0,
        };
      });
      const { error: epErr } = await admin.from('contest_entry_players').insert(rows);
      if (epErr) throw epErr;

      return NextResponse.json({ ok: true, entryId: entry.id });
    }

    if (action === 'snapshot_leaderboard') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { contest_id } = payload;
      const { data: entries, error } = await admin
        .from('contest_entries')
        .select('id,projected_points,actual_points')
        .eq('contest_id', contest_id)
        .order('actual_points', { ascending: false })
        .order('projected_points', { ascending: false });
      if (error) throw error;

      const snapshots = (entries ?? []).map((entry: any, index: number) => ({
        contest_id,
        entry_id: entry.id,
        rank: index + 1,
        projected_points: entry.projected_points ?? 0,
        actual_points: entry.actual_points ?? 0,
      }));
      if (snapshots.length) {
        const { error: snapError } = await admin.from('contest_leaderboard_snapshots').insert(snapshots);
        if (snapError) throw snapError;
      }
      return NextResponse.json({ ok: true, inserted: snapshots.length });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Operation failed' }, { status: 500 });
  }
}
