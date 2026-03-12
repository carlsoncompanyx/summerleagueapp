import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { buildSlateValuations, getFantasyPlayerDetails } from '../../../lib/dfs/valuation';
import { computeDfsFantasyPoints, DFS_CAPTAIN_MULTIPLIER, parseDfsPosition } from '../../../lib/dfs/scoring';

const REQUIRED_SLOTS = ['CAPTAIN', 'SKATER_1', 'SKATER_2', 'SKATER_3', 'SKATER_4', 'GOALIE'];

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

function validateSlots(slots: any[]) {
  const normalizedSlots = (slots ?? []).map((s) => ({
    slot: String(s?.slot ?? ''),
    player_id: String(s?.player_id ?? '').trim(),
  }));
  const slotsSet = new Set(normalizedSlots.map((s) => s.slot));
  for (const required of REQUIRED_SLOTS) {
    if (!slotsSet.has(required)) return `Missing required slot: ${required}`;
  }
  if (normalizedSlots.length !== REQUIRED_SLOTS.length) return 'Lineup must have exactly 1 Captain, 4 Skaters, 1 Goalie.';

  for (const required of REQUIRED_SLOTS) {
    const row = normalizedSlots.find((s) => s.slot === required);
    if (!row?.player_id) return `All lineup slots must be filled before submitting. Missing player for ${required}.`;
  }

  return null;
}

async function getSlateLockAt(admin: any, slateId: string, fallbackLockAt?: string | null) {
  const { data: slateGames } = await admin.from('slate_games').select('game_id').eq('slate_id', slateId);
  const gameIds = (slateGames ?? []).map((g: any) => g.game_id);
  if (!gameIds.length) return fallbackLockAt ?? null;
  const { data: games } = await admin.from('games').select('scheduled_at').in('id', gameIds).order('scheduled_at', { ascending: true }).limit(1);
  return games?.[0]?.scheduled_at ?? fallbackLockAt ?? null;
}

function generatedEntryLabel(entryId: string, index: number) {
  return `Entry #${index + 1} · ${entryId.slice(0, 8)}`;
}

async function rebuildSlatePlayersSnapshot(admin: any, slateId: string, seasonId: string) {
  const lockAt = await getSlateLockAt(admin, slateId, null);
  if (lockAt && new Date(lockAt).getTime() <= Date.now()) {
    throw new Error('Slate is locked and cannot be repriced.');
  }

  const { data: contests } = await admin.from('contests').select('status').eq('slate_id', slateId);
  const hasFinalizedContest = (contests ?? []).some((c: any) => ['live', 'final'].includes(String(c.status || '').toLowerCase()));
  if (hasFinalizedContest) throw new Error('Slate has live/final contests and cannot be repriced.');

  const { error: clearErr } = await admin.from('slate_players').delete().eq('slate_id', slateId);
  if (clearErr) throw clearErr;

  const valuations = await buildSlateValuations({ slateId, seasonId });
  if (valuations.length) {
    const { error: insertErr } = await admin.from('slate_players').insert(valuations);
    if (insertErr) throw insertErr;
  }

  return { rebuiltCount: valuations.length };
}

export async function GET(req: NextRequest) {
  const slateId = req.nextUrl.searchParams.get('slate_id');
  const contestId = req.nextUrl.searchParams.get('contest_id');
  const playerId = req.nextUrl.searchParams.get('player_id');
  const seasonId = req.nextUrl.searchParams.get('season_id') || undefined;
  const actor = await getCurrentActor();

  if (playerId) {
    const details = await getFantasyPlayerDetails(playerId, seasonId);
    if (!details) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    return NextResponse.json(details);
  }

  const admin = createAdminSupabaseClient();
  const [slates, contests, slatePlayers, seasons] = await Promise.all([
    admin.from('slates').select('*').order('lock_at', { ascending: true }),
    admin.from('contests').select('*').order('lock_at', { ascending: true }),
    slateId
      ? admin.from('slate_players').select('*').eq('slate_id', slateId).order('projection_points', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    admin.from('seasons').select('id,name,start_date,end_date').order('start_date', { ascending: false }),
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
  const slateSeasonId = slateId
    ? (slates.data ?? []).find((s: any) => s.id === slateId)?.season_id
    : undefined;

  const { data: fantasyRows } = ids.length && slateSeasonId
    ? await admin.from('fantasy_points_v').select('player_id,goals,assists,points,fantasy_points,fantasy_points_avg,games_played').eq('season_id', slateSeasonId).in('player_id', ids)
    : { data: [] as any[] };

  const teamById = new Map((teams ?? []).map((t: any) => [t.id, t.name]));
  const fantasyByPlayer = new Map((fantasyRows ?? []).map((r: any) => [r.player_id, r]));
  const byId = new Map((players ?? []).map((p: any) => [p.id, p]));
  const merged = rawPlayers.map((p: any) => {
    const player = byId.get(p.player_id) ?? null;
    const stats = fantasyByPlayer.get(p.player_id) ?? null;
    return {
      ...p,
      player: player ? { ...player, team_name: teamById.get(player.team_id) ?? null } : null,
      stats,
    };
  });

  const entriesQ = actor.userId
    ? await admin.from('contest_entries').select('id,contest_id,user_id,lineup_name,projected_points,actual_points,salary_used,created_at,contests(name)').eq('user_id', actor.userId).order('created_at', { ascending: false })
    : { data: [] as any[] };

  const myEntryIds = (entriesQ.data ?? []).map((e: any) => e.id);
  const { data: myEntryPlayers } = myEntryIds.length
    ? await admin.from('contest_entry_players').select('entry_id,player_id,slot').in('entry_id', myEntryIds)
    : { data: [] as any[] };
  const slotsByEntry = new Map<string, any[]>();
  for (const row of myEntryPlayers ?? []) {
    if (!slotsByEntry.has(row.entry_id)) slotsByEntry.set(row.entry_id, []);
    slotsByEntry.get(row.entry_id)!.push({ slot: row.slot, player_id: row.player_id });
  }

  const selectedContestId = contestId || null;
  const leaderboardQ = selectedContestId
    ? await admin
      .from('contest_entries')
      .select('id,contest_id,user_id,lineup_name,projected_points,actual_points,salary_used,created_at')
      .eq('contest_id', selectedContestId)
      .order('actual_points', { ascending: false })
      .order('projected_points', { ascending: false })
      .order('created_at', { ascending: true })
    : { data: [] as any[] };

  const leaderboardUserIds = Array.from(new Set((leaderboardQ.data ?? []).map((e: any) => e.user_id).filter(Boolean)));
  const { data: leaderboardProfiles } = leaderboardUserIds.length
    ? await admin.from('profiles').select('user_id,display_name,first_name,last_name').in('user_id', leaderboardUserIds)
    : { data: [] as any[] };
  const profileByUser = new Map((leaderboardProfiles ?? []).map((p: any) => {
    const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    return [p.user_id, p.display_name || full || 'User'];
  }));

  const now = Date.now();
  const orderedSlates = (slates.data ?? []).slice().sort((a: any, b: any) => new Date(a.lock_at ?? 0).getTime() - new Date(b.lock_at ?? 0).getTime());
  const recommendedSlate = orderedSlates.find((s: any) => new Date(s.lock_at ?? 0).getTime() > now) ?? orderedSlates[0] ?? null;

  const selectedSlateId = slateId || recommendedSlate?.id || null;

  const valuationInputsQ = seasonId
    ? await admin.from('player_valuation_inputs').select('*').eq('season_id', seasonId)
    : { data: [] as any[] };
  const projectionOverridesQ = seasonId
    ? await admin.from('player_projection_overrides').select('*').eq('season_id', seasonId)
    : { data: [] as any[] };

  const slateGames = selectedSlateId
    ? await admin
      .from('slate_games')
      .select('game_id,games!inner(id,scheduled_at,home_team,away_team,status,home_score,away_score)')
      .eq('slate_id', selectedSlateId)
    : { data: [] as any[] };
  const slateGameRows = (slateGames.data ?? []).map((r: any) => r.games).filter(Boolean);
  const slateGameTeamIds = Array.from(new Set(slateGameRows.flatMap((g: any) => [g.home_team, g.away_team]).filter(Boolean)));
  const { data: slateGameTeams } = slateGameTeamIds.length
    ? await admin.from('teams').select('id,name').in('id', slateGameTeamIds)
    : { data: [] as any[] };
  const gameTeamMap = new Map((slateGameTeams ?? []).map((t: any) => [t.id, t.name]));

  return NextResponse.json({
    actor,
    slates: slates.data ?? [],
    contests: contests.data ?? [],
    seasons: seasons.data ?? [],
    slatePlayers: merged,
    slateGames: slateGameRows.map((g: any) => ({
      ...g,
      home_team_name: gameTeamMap.get(g.home_team) ?? g.home_team,
      away_team_name: gameTeamMap.get(g.away_team) ?? g.away_team,
    })),
    recommendedSlateId: recommendedSlate?.id ?? null,
    myEntries: (entriesQ.data ?? []).map((e: any) => ({
      ...e,
      contest_name: e.contests?.name ?? null,
      display_label: e.lineup_name || generatedEntryLabel(e.id, (entriesQ.data ?? []).findIndex((r: any) => r.id === e.id)),
      slots: slotsByEntry.get(e.id) ?? [],
    })),
    leaderboardEntries: (leaderboardQ.data ?? []).map((e: any, idx: number) => ({
      ...e,
      rank: idx + 1,
      user_display: profileByUser.get(e.user_id) ?? 'User',
    })),
    valuationInputs: valuationInputsQ.data ?? [],
    projectionOverrides: projectionOverridesQ.data ?? [],
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
        is_default_weekly: payload.is_default_weekly ?? false,
        week_start_date: payload.week_start_date ?? null,
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

    if (action === 'auto_generate_default_next_slate_day' || action === 'auto_generate_weekly_default') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

      const nowIso = new Date().toISOString();
      const { data: nextGame, error: nextGameErr } = await admin
        .from('games')
        .select('id,season_id,scheduled_at')
        .gte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextGameErr) throw nextGameErr;
      if (!nextGame) return NextResponse.json({ error: 'No upcoming games found.' }, { status: 400 });

      const gameDate = String(nextGame.scheduled_at).slice(0, 10);
      const dayStartIso = `${gameDate}T00:00:00.000Z`;
      const dayEnd = new Date(`${gameDate}T00:00:00.000Z`);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const { data: dayGames, error: dayGamesErr } = await admin
        .from('games')
        .select('id,season_id,scheduled_at')
        .gte('scheduled_at', dayStartIso)
        .lt('scheduled_at', dayEnd.toISOString())
        .eq('season_id', nextGame.season_id)
        .order('scheduled_at', { ascending: true });
      if (dayGamesErr) throw dayGamesErr;
      if (!dayGames?.length) return NextResponse.json({ error: 'No games found for next slate day.' }, { status: 400 });

      const firstGameStart = dayGames[0].scheduled_at;
      const gameIds = dayGames.map((g: any) => g.id);

      const { data: existingSlate } = await admin
        .from('slates')
        .select('id')
        .eq('season_id', nextGame.season_id)
        .eq('source_game_date', gameDate)
        .eq('is_default_weekly', true)
        .maybeSingle();

      if (existingSlate) {
        const rebuild = await rebuildSlatePlayersSnapshot(admin, existingSlate.id, nextGame.season_id);
        return NextResponse.json({
          ok: true,
          slateId: existingSlate.id,
          repriced: true,
          rebuiltCount: rebuild.rebuiltCount,
          slateDate: gameDate,
          message: `Default slate repriced (${rebuild.rebuiltCount} players).`,
        });
      }

      const { data: slate, error } = await admin.from('slates').insert({
        season_id: nextGame.season_id,
        name: `Default Slate (${gameDate})`,
        lock_at: firstGameStart,
        status: 'published',
        created_by: actor.userId,
        is_default_weekly: true,
        week_start_date: gameDate,
        source_game_date: gameDate,
      }).select('*').single();
      if (error) throw error;

      const { error: sgErr } = await admin.from('slate_games').insert(gameIds.map((game_id: string) => ({ slate_id: slate.id, game_id })));
      if (sgErr) throw sgErr;

      const valuations = await buildSlateValuations({ slateId: slate.id, seasonId: nextGame.season_id });
      if (valuations.length) {
        const { error: spErr } = await admin.from('slate_players').insert(valuations);
        if (spErr) throw spErr;
      }

      const { data: existingContest } = await admin.from('contests').select('id').eq('slate_id', slate.id).eq('is_default_weekly', true).maybeSingle();
      if (!existingContest) {
        const { error: contestErr } = await admin.from('contests').insert({
          slate_id: slate.id,
          name: `Main (${gameDate})`,
          entry_fee_cents: 1000,
          salary_cap: 50000,
          max_entries: 10,
          lock_at: firstGameStart,
          roster_config: { CAPTAIN: 1, SKATER: 4, GOALIE: 1 },
          status: 'open',
          created_by: actor.userId,
          is_default_weekly: true,
        });
        if (contestErr) throw contestErr;
      }

      return NextResponse.json({ ok: true, slateId: slate.id, gameCount: gameIds.length, slateDate: gameDate });
    }


    if (action === 'rebuild_slate_players') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const slateId = payload?.slate_id;
      if (!slateId) return NextResponse.json({ error: 'slate_id is required.' }, { status: 400 });

      const { data: slate, error: slateErr } = await admin.from('slates').select('id,season_id').eq('id', slateId).maybeSingle();
      if (slateErr) throw slateErr;
      if (!slate) return NextResponse.json({ error: 'Slate not found.' }, { status: 404 });

      const rebuildSeasonId = payload?.season_id ?? slate.season_id;
      if (!rebuildSeasonId) return NextResponse.json({ error: 'Unable to resolve slate season for repricing.' }, { status: 400 });
      const rebuild = await rebuildSlatePlayersSnapshot(admin, slate.id, rebuildSeasonId);
      return NextResponse.json({ ok: true, slateId: slate.id, rebuiltCount: rebuild.rebuiltCount, repriced: true });
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
        roster_config: payload.roster_config ?? { CAPTAIN: 1, SKATER: 4, GOALIE: 1 },
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
      const { contest_id, slots } = payload;

      const slotValidationError = validateSlots(slots ?? []);
      if (slotValidationError) return NextResponse.json({ error: slotValidationError }, { status: 400 });

      const { data: contest, error: contestErr } = await admin.from('contests').select('*').eq('id', contest_id).single();
      if (contestErr) throw contestErr;

      if (!['open', 'live'].includes((contest.status ?? '').toLowerCase())) {
        return NextResponse.json({ error: 'Contest is not accepting entries.' }, { status: 400 });
      }

      const { data: slate } = await admin.from('slates').select('*').eq('id', contest.slate_id).single();
      const lockAt = await getSlateLockAt(admin, contest.slate_id, contest.lock_at || slate?.lock_at || null);
      if (lockAt && new Date(lockAt).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Slate is locked at first game start.' }, { status: 400 });
      }

      const { data: entries } = await admin.from('contest_entries').select('id').eq('contest_id', contest_id).eq('user_id', actor.userId);
      if ((entries ?? []).length >= contest.max_entries) {
        return NextResponse.json({ error: 'Entry limit reached.' }, { status: 400 });
      }

      const playerIds = slots.map((s: any) => s.player_id);
      if (new Set(playerIds).size !== playerIds.length) return NextResponse.json({ error: 'Duplicate players in lineup.' }, { status: 400 });

      const { data: slatePlayers } = await admin.from('slate_players').select('*').eq('slate_id', contest.slate_id).in('player_id', playerIds);
      if ((slatePlayers ?? []).length !== playerIds.length) return NextResponse.json({ error: 'One or more players are not in this slate.' }, { status: 400 });
      const outPlayers = (slatePlayers ?? []).filter((p: any) => String(p.availability_status ?? 'AVAILABLE').toUpperCase() === 'OUT');
      if (outPlayers.length) return NextResponse.json({ error: 'Lineup includes player(s) marked Out for this slate.' }, { status: 400 });

      const { data: playerRows } = await admin.from('players').select('id,position').in('id', playerIds);
      const posById = new Map((playerRows ?? []).map((p: any) => [p.id, p.position]));

      const captain = slots.find((s: any) => s.slot === 'CAPTAIN');
      if (!captain) return NextResponse.json({ error: 'Captain slot is required.' }, { status: 400 });
      if (parseDfsPosition(posById.get(captain.player_id)) === 'GOALIE') return NextResponse.json({ error: 'Captain must be a skater.' }, { status: 400 });

      const goalie = slots.find((s: any) => s.slot === 'GOALIE');
      if (!goalie) return NextResponse.json({ error: 'Goalie slot is required.' }, { status: 400 });
      if (parseDfsPosition(posById.get(goalie.player_id)) !== 'GOALIE') return NextResponse.json({ error: 'Goalie slot requires a goalie.' }, { status: 400 });

      const skaterSlots = slots.filter((s: any) => s.slot.startsWith('SKATER_'));
      if (skaterSlots.length !== 4) return NextResponse.json({ error: 'Exactly four skater slots are required.' }, { status: 400 });
      for (const s of skaterSlots) {
        if (parseDfsPosition(posById.get(s.player_id)) === 'GOALIE') return NextResponse.json({ error: `${s.slot} must be a skater.` }, { status: 400 });
      }

      let salaryUsed = 0;
      let projected = 0;
      for (const s of slots) {
        const sp = (slatePlayers ?? []).find((p: any) => p.player_id === s.player_id);
        if (!sp) continue;
        const mult = s.slot === 'CAPTAIN' ? DFS_CAPTAIN_MULTIPLIER : 1;
        salaryUsed += Number(sp.salary || 0) * mult;
        projected += Number(sp.projection_points || 0) * mult;
      }

      if (salaryUsed > contest.salary_cap) return NextResponse.json({ error: 'Salary cap exceeded.' }, { status: 400 });

      const { data: entry, error: entryErr } = await admin.from('contest_entries').insert({
        contest_id,
        user_id: actor.userId,
        lineup_name: null,
        salary_used: Math.round(salaryUsed),
        projected_points: Number(projected.toFixed(2)),
      }).select('*').single();
      if (entryErr) throw entryErr;

      const rows = slots.map((s: any) => {
        const sp = (slatePlayers ?? []).find((p: any) => p.player_id === s.player_id);
        const mult = s.slot === 'CAPTAIN' ? DFS_CAPTAIN_MULTIPLIER : 1;
        return {
          entry_id: entry.id,
          player_id: s.player_id,
          slate_player_id: sp?.id,
          slot: s.slot,
          salary_snapshot: Math.round((sp?.salary ?? 0) * mult),
          projection_snapshot: Number(((sp?.projection_points ?? 0) * mult).toFixed(2)),
        };
      });
      const { error: epErr } = await admin.from('contest_entry_players').insert(rows);
      if (epErr) throw epErr;

      return NextResponse.json({ ok: true, entryId: entry.id });
    }

    if (action === 'update_entry') {
      if (!actor.userId) return NextResponse.json({ error: 'Login required' }, { status: 401 });
      const { entry_id, slots } = payload;

      const slotValidationError = validateSlots(slots ?? []);
      if (slotValidationError) return NextResponse.json({ error: slotValidationError }, { status: 400 });

      const { data: entry, error: entryErr } = await admin.from('contest_entries').select('*').eq('id', entry_id).single();
      if (entryErr) throw entryErr;
      if (entry.user_id !== actor.userId) return NextResponse.json({ error: 'Not your entry.' }, { status: 403 });

      const { data: contest, error: contestErr } = await admin.from('contests').select('*').eq('id', entry.contest_id).single();
      if (contestErr) throw contestErr;

      const { data: slate } = await admin.from('slates').select('*').eq('id', contest.slate_id).single();
      const lockAt = await getSlateLockAt(admin, contest.slate_id, contest.lock_at || slate?.lock_at || null);
      if (lockAt && new Date(lockAt).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Entry is locked at first game start.' }, { status: 400 });
      }

      const playerIds = slots.map((s: any) => s.player_id);
      if (new Set(playerIds).size !== playerIds.length) return NextResponse.json({ error: 'Duplicate players in lineup.' }, { status: 400 });

      const { data: slatePlayers } = await admin.from('slate_players').select('*').eq('slate_id', contest.slate_id).in('player_id', playerIds);
      if ((slatePlayers ?? []).length !== playerIds.length) return NextResponse.json({ error: 'One or more players are not in this slate.' }, { status: 400 });
      const outPlayers = (slatePlayers ?? []).filter((p: any) => String(p.availability_status ?? 'AVAILABLE').toUpperCase() === 'OUT');
      if (outPlayers.length) return NextResponse.json({ error: 'Lineup includes player(s) marked Out for this slate.' }, { status: 400 });

      const { data: playerRows } = await admin.from('players').select('id,position').in('id', playerIds);
      const posById = new Map((playerRows ?? []).map((p: any) => [p.id, p.position]));

      const captain = slots.find((s: any) => s.slot === 'CAPTAIN');
      if (!captain) return NextResponse.json({ error: 'Captain slot is required.' }, { status: 400 });
      if (parseDfsPosition(posById.get(captain.player_id)) === 'GOALIE') return NextResponse.json({ error: 'Captain must be a skater.' }, { status: 400 });
      const goalie = slots.find((s: any) => s.slot === 'GOALIE');
      if (!goalie) return NextResponse.json({ error: 'Goalie slot is required.' }, { status: 400 });
      if (parseDfsPosition(posById.get(goalie.player_id)) !== 'GOALIE') return NextResponse.json({ error: 'Goalie slot requires a goalie.' }, { status: 400 });

      let salaryUsed = 0;
      let projected = 0;
      for (const s of slots) {
        const sp = (slatePlayers ?? []).find((p: any) => p.player_id === s.player_id);
        if (!sp) continue;
        const mult = s.slot === 'CAPTAIN' ? DFS_CAPTAIN_MULTIPLIER : 1;
        salaryUsed += Number(sp.salary || 0) * mult;
        projected += Number(sp.projection_points || 0) * mult;
      }
      if (salaryUsed > contest.salary_cap) return NextResponse.json({ error: 'Salary cap exceeded.' }, { status: 400 });

      const { error: clearErr } = await admin.from('contest_entry_players').delete().eq('entry_id', entry_id);
      if (clearErr) throw clearErr;

      const rows = slots.map((s: any) => {
        const sp = (slatePlayers ?? []).find((p: any) => p.player_id === s.player_id);
        const mult = s.slot === 'CAPTAIN' ? DFS_CAPTAIN_MULTIPLIER : 1;
        return {
          entry_id,
          player_id: s.player_id,
          slate_player_id: sp?.id,
          slot: s.slot,
          salary_snapshot: Math.round((sp?.salary ?? 0) * mult),
          projection_snapshot: Number(((sp?.projection_points ?? 0) * mult).toFixed(2)),
        };
      });
      const { error: epErr } = await admin.from('contest_entry_players').insert(rows);
      if (epErr) throw epErr;

      const { error: updateErr } = await admin
        .from('contest_entries')
        .update({ salary_used: Math.round(salaryUsed), projected_points: Number(projected.toFixed(2)) })
        .eq('id', entry_id)
        .eq('user_id', actor.userId);
      if (updateErr) throw updateErr;

      return NextResponse.json({ ok: true, entryId: entry_id });
    }

    if (action === 'update_slate_player_availability') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const availability = String(payload.availability_status || 'AVAILABLE').toUpperCase();
      if (!['AVAILABLE', 'QUESTIONABLE', 'OUT'].includes(availability)) {
        return NextResponse.json({ error: 'Invalid availability status.' }, { status: 400 });
      }

      const { data: slatePlayer, error: spErr } = await admin
        .from('slate_players')
        .select('id,projection_points,availability_projection_backup')
        .eq('id', payload.slate_player_id)
        .single();
      if (spErr) throw spErr;

      const updatePayload: any = { availability_status: availability };
      if (availability === 'OUT') {
        updatePayload.availability_projection_backup = slatePlayer.availability_projection_backup ?? slatePlayer.projection_points ?? 0;
        updatePayload.projection_points = 0;
      } else if (slatePlayer.availability_projection_backup != null && Number(slatePlayer.projection_points) === 0) {
        updatePayload.projection_points = slatePlayer.availability_projection_backup;
      }

      const { error } = await admin.from('slate_players').update(updatePayload).eq('id', payload.slate_player_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'upsert_player_valuation_input') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const grade = String(payload.player_grade || 'C').toUpperCase();
      if (!['A', 'B', 'C', 'D', 'F'].includes(grade)) {
        return NextResponse.json({ error: 'Invalid player grade.' }, { status: 400 });
      }
      const { error } = await admin.from('player_valuation_inputs').upsert({
        season_id: payload.season_id,
        player_id: payload.player_id,
        min_sample_games: Number(payload.min_sample_games ?? 2),
        fallback_position_baseline: payload.fallback_position_baseline != null ? Number(payload.fallback_position_baseline) : null,
        player_grade: grade,
        notes: payload.notes ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'season_id,player_id' });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'upsert_player_projection_override') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

      const hasProjection = payload.projection_points != null && String(payload.projection_points).trim() !== '';
      const hasSalary = payload.salary_override != null && String(payload.salary_override).trim() !== '';
      if (!hasProjection && !hasSalary) {
        const { error } = await admin
          .from('player_projection_overrides')
          .delete()
          .eq('season_id', payload.season_id)
          .eq('player_id', payload.player_id);
        if (error) throw error;
        return NextResponse.json({ ok: true, deleted: true });
      }

      const { error } = await admin.from('player_projection_overrides').upsert({
        season_id: payload.season_id,
        player_id: payload.player_id,
        projection_points: hasProjection ? Number(payload.projection_points) : 0,
        salary_override: hasSalary ? Number(payload.salary_override) : null,
        notes: payload.notes ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'season_id,player_id' });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'score_contest') {
      if (!isAdminRole(actor.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const contestId = payload.contest_id;

      const { data: contest, error: contestErr } = await admin.from('contests').select('*').eq('id', contestId).single();
      if (contestErr) throw contestErr;

      const { data: slateGames } = await admin.from('slate_games').select('game_id').eq('slate_id', contest.slate_id);
      const gameIds = (slateGames ?? []).map((g: any) => g.game_id);
      if (!gameIds.length) return NextResponse.json({ error: 'No games attached to slate.' }, { status: 400 });

      const [{ data: gameRows }, { data: gsRows }, { data: playerRows }, { data: entryRows }] = await Promise.all([
        admin.from('games').select('id,home_team,away_team,home_score,away_score,status').in('id', gameIds),
        admin.from('game_stats').select('game_id,player_id,team_id,goals,assists,goals_against').in('game_id', gameIds),
        admin.from('players').select('id,position'),
        admin.from('contest_entries').select('id').eq('contest_id', contestId),
      ]);

      const entryIds = (entryRows ?? []).map((e: any) => e.id);
      const { data: entryPlayersRows } = entryIds.length
        ? await admin.from('contest_entry_players').select('*').in('entry_id', entryIds)
        : { data: [] as any[] };

      const playerPos = new Map((playerRows ?? []).map((p: any) => [p.id, p.position]));
      const gameById = new Map((gameRows ?? []).map((g: any) => [g.id, g]));

      const agg = new Map<string, { goals: number; assists: number; ga: number; wins: number }>();
      for (const row of gsRows ?? []) {
        if (!agg.has(row.player_id)) agg.set(row.player_id, { goals: 0, assists: 0, ga: 0, wins: 0 });
        const a = agg.get(row.player_id)!;
        a.goals += Number(row.goals || 0);
        a.assists += Number(row.assists || 0);
        a.ga += Number(row.goals_against || 0);

        const game = gameById.get(row.game_id);
        if (game && game.status === 'FINAL') {
          const wonHome = game.home_score > game.away_score && row.team_id === game.home_team;
          const wonAway = game.away_score > game.home_score && row.team_id === game.away_team;
          if (wonHome || wonAway) a.wins += 1;
        }
      }

      const playerFantasy = new Map<string, number>();
      for (const [playerId, a] of agg.entries()) {
        playerFantasy.set(playerId, computeDfsFantasyPoints({
          position: playerPos.get(playerId),
          goals: a.goals,
          assists: a.assists,
          wins: a.wins,
          goalsAgainst: a.ga,
        }));
      }

      const entryById = new Map((entryRows ?? []).map((e: any) => [e.id, 0]));
      for (const ep of entryPlayersRows ?? []) {
        const base = playerFantasy.get(ep.player_id) ?? 0;
        const mult = ep.slot === 'CAPTAIN' ? DFS_CAPTAIN_MULTIPLIER : 1;
        entryById.set(ep.entry_id, Number((entryById.get(ep.entry_id)! + base * mult).toFixed(2)));
      }

      for (const [entryId, total] of entryById.entries()) {
        const { error } = await admin.from('contest_entries').update({ actual_points: total }).eq('id', entryId);
        if (error) throw error;
      }

      const ranked = Array.from(entryById.entries()).sort((a, b) => b[1] - a[1]);
      if (ranked.length) {
        const snapRows = ranked.map(([entryId, total], idx) => ({
          contest_id: contestId,
          entry_id: entryId,
          rank: idx + 1,
          projected_points: 0,
          actual_points: total,
        }));
        const { error: snapErr } = await admin.from('contest_leaderboard_snapshots').insert(snapRows);
        if (snapErr) throw snapErr;
      }

      await admin.from('contests').update({ status: 'final' }).eq('id', contestId);
      return NextResponse.json({ ok: true, scoredEntries: ranked.length });
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
