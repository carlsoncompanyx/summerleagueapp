import { unstable_noStore as noStore } from 'next/cache';

import { getSupabaseAdminSafe, getSupabaseSafe } from './supabase';

type Team = { id: string; name: string };
type Game = {
  id: string;
  season_id: string;
  home_team: string;
  away_team: string;
  scheduled_at: string;
  location: string | null;
  status: string;
  home_score: number;
  away_score: number;
};

type Player = {
  id: string;
  name: string;
  team_id: string | null;
  position: string | null;
  nickname: string | null;
};

export async function getLeagueSnapshot() {
  noStore();

  const supabase = getSupabaseAdminSafe() ?? getSupabaseSafe();
  if (!supabase) {
    return {
      unavailable: true,
      reason:
        "Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    } as const;
  }

  const [seasonRes, teamRes, gameRes, playerRes, chatRes] = await Promise.all([
    supabase.from('seasons').select('id, name, start_date, end_date').order('start_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('games').select('id, season_id, home_team, away_team, scheduled_at, location, status, home_score, away_score').order('scheduled_at'),
    supabase.from('players').select('id, name, team_id, position, nickname').order('name'),
    supabase.from('chat_messages').select('id, message, created_at, role').order('created_at', { ascending: false }).limit(20),
  ]);

  if (seasonRes.error || teamRes.error || gameRes.error || playerRes.error || chatRes.error) {
    return {
      unavailable: true,
      reason:
        seasonRes.error?.message ||
        teamRes.error?.message ||
        gameRes.error?.message ||
        playerRes.error?.message ||
        chatRes.error?.message ||
        'Unable to fetch league data.',
    } as const;
  }

  const season = seasonRes.data;
  const teams = (teamRes.data ?? []) as Team[];
  const games = (gameRes.data ?? []) as Game[];
  const players = (playerRes.data ?? []) as Player[];
  const chatMessages = chatRes.data ?? [];

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const schedule = games.map((g) => ({
    ...g,
    home_team_name: teamNameById.get(g.home_team) ?? 'Unknown',
    away_team_name: teamNameById.get(g.away_team) ?? 'Unknown',
  }));

  const standingsMap = new Map<string, { team: string; gp: number; w: number; l: number; t: number; gf: number; ga: number; pts: number }>();
  for (const team of teams) {
    standingsMap.set(team.id, { team: team.name, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0, pts: 0 });
  }

  for (const game of games) {
    if (!['FINAL', 'CANCELED'].includes(game.status)) continue;

    const home = standingsMap.get(game.home_team);
    const away = standingsMap.get(game.away_team);
    if (!home || !away) continue;

    home.gp += 1;
    away.gp += 1;
    home.gf += game.home_score;
    home.ga += game.away_score;
    away.gf += game.away_score;
    away.ga += game.home_score;

    if (game.home_score > game.away_score) {
      home.w += 1;
      away.l += 1;
      home.pts += 2;
    } else if (game.away_score > game.home_score) {
      away.w += 1;
      home.l += 1;
      away.pts += 2;
    } else {
      home.t += 1;
      away.t += 1;
      home.pts += 1;
      away.pts += 1;
    }
  }

  const standings = Array.from(standingsMap.values()).sort(
    (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
  );

  const leaders = players
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      nickname: p.nickname,
      team_name: p.team_id ? teamNameById.get(p.team_id) ?? 'Unknown' : 'Free Agent',
    }))
    .slice(0, 20);

  return {
    unavailable: false,
    season,
    teams,
    schedule,
    standings,
    leaders,
    chatMessages,
  } as const;
}
