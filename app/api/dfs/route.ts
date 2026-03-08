import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../lib/supabase/server';

function testModeAdmin() {
  return process.env.NEXT_PUBLIC_ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

async function getUserId() {
  if (testModeAdmin()) {
    const admin = createAdminSupabaseClient();
    const { data: profile } = await admin.from('profiles').select('user_id').limit(1).maybeSingle();
    return profile?.user_id ?? null;
  }
  const server = createServerSupabaseClient();
  const { data: { user } } = await server.auth.getUser();
  return user?.id ?? null;
}

export async function GET(req: NextRequest) {
  const slateId = req.nextUrl.searchParams.get('slate_id');
  const admin = createAdminSupabaseClient();
  const [slates, contests, slatePlayers] = await Promise.all([
    admin.from('slates').select('*').order('lock_at', { ascending: true }),
    admin.from('contests').select('*').order('lock_at', { ascending: true }),
    slateId ? admin.from('slate_players').select('*').eq('slate_id', slateId).order('projection_points', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ]);

  const rawPlayers = (slatePlayers as any).data ?? [];
  const ids = rawPlayers.map((p: any) => p.player_id);
  const { data: players } = ids.length ? await admin.from('players').select('id,name,team_id,position').in('id', ids) : { data: [] as any[] };
  const byId = new Map((players ?? []).map((p: any) => [p.id, p]));
  const merged = rawPlayers.map((p: any) => ({ ...p, player: byId.get(p.player_id) ?? null }));

  return NextResponse.json({ slates: slates.data ?? [], contests: contests.data ?? [], slatePlayers: merged });
}

export async function POST(req: NextRequest) {
  const { action, payload } = await req.json();
  const admin = createAdminSupabaseClient();
  const userId = await getUserId();

  try {
    if (action === 'create_slate') {
      const { data: slate, error } = await admin.from('slates').insert({
        season_id: payload.season_id,
        name: payload.name,
        lock_at: payload.lock_at,
        created_by: userId,
      }).select('*').single();
      if (error) throw error;

      if (Array.isArray(payload.game_ids) && payload.game_ids.length) {
        const rows = payload.game_ids.map((gameId: string) => ({ slate_id: slate.id, game_id: gameId }));
        const { error: sgErr } = await admin.from('slate_games').insert(rows);
        if (sgErr) throw sgErr;
      }

      const { data: players } = await admin
        .from('fantasy_points_v')
        .select('*')
        .eq('season_id', payload.season_id)
        .order('fantasy_points', { ascending: false });
      const { data: overrides } = await admin
        .from('player_projection_overrides')
        .select('*')
        .eq('season_id', payload.season_id);

      const snap = (players ?? []).map((p: any) => {
        const ov = (overrides ?? []).find((o: any) => o.player_id === p.player_id);
        const baseline = p.fantasy_points_avg && p.games_played >= 2 ? Number(p.fantasy_points_avg) : 6.0;
        const projection = ov?.projection_points ?? baseline;
        const salary = ov?.salary_override ?? Math.max(3500, Math.round(projection * 1200));
        return {
          slate_id: slate.id,
          player_id: p.player_id,
          team_id: p.team_id,
          position: p.position,
          salary,
          projection_points: projection,
          baseline_points: baseline,
        };
      });
      if (snap.length) {
        const { error: spErr } = await admin.from('slate_players').insert(snap);
        if (spErr) throw spErr;
      }
      return NextResponse.json({ ok: true, slate });
    }

    if (action === 'create_contest') {
      const { error } = await admin.from('contests').insert({
        slate_id: payload.slate_id,
        name: payload.name,
        salary_cap: payload.salary_cap ?? 50000,
        max_entries: payload.max_entries ?? 5,
        lock_at: payload.lock_at,
        created_by: userId,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'submit_entry') {
      if (!userId) return NextResponse.json({ error: 'Login required' }, { status: 401 });
      const { contest_id, lineup_name, slots } = payload;
      const { data: contest, error: contestErr } = await admin.from('contests').select('*').eq('id', contest_id).single();
      if (contestErr) throw contestErr;
      if (new Date(contest.lock_at).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Contest is locked.' }, { status: 400 });
      }

      const { data: entries } = await admin.from('contest_entries').select('id').eq('contest_id', contest_id).eq('user_id', userId);
      if ((entries ?? []).length >= contest.max_entries) {
        return NextResponse.json({ error: 'Entry limit reached.' }, { status: 400 });
      }

      const playerIds = slots.map((s: any) => s.player_id);
      if (new Set(playerIds).size !== playerIds.length) return NextResponse.json({ error: 'Duplicate players in lineup.' }, { status: 400 });

      const { data: slatePlayers } = await admin.from('slate_players').select('*').eq('slate_id', contest.slate_id).in('player_id', playerIds);
      if ((slatePlayers ?? []).length !== playerIds.length) return NextResponse.json({ error: 'One or more players are not in this slate.' }, { status: 400 });

      const salaryUsed = (slatePlayers ?? []).reduce((sum: number, p: any) => sum + (p.salary || 0), 0);
      if (salaryUsed > contest.salary_cap) return NextResponse.json({ error: 'Salary cap exceeded.' }, { status: 400 });

      const projected = (slatePlayers ?? []).reduce((sum: number, p: any) => sum + Number(p.projection_points || 0), 0);

      const { data: entry, error: entryErr } = await admin.from('contest_entries').insert({
        contest_id,
        user_id: userId,
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Operation failed' }, { status: 500 });
  }
}
