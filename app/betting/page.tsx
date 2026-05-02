import { buildDefaultGameLines } from '../../lib/betting';
import { getLeagueSnapshot } from '../../lib/league-data';
import { formatPublicDateTime } from '../../lib/formatters';
import { createAdminSupabaseClient } from '../../lib/supabase/admin';

function adminClientSafe() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try { return createAdminSupabaseClient(); } catch { return null; }
}

export default async function BettingPage() {
  const data = await getLeagueSnapshot();
  if ('unavailable' in data && data.unavailable) return <main><h1>Betting</h1><p>{data.reason}</p></main>;

  const now = Date.now();
  const upcoming = data.schedule.filter((g) => new Date(g.scheduled_at).getTime() > now).slice(0, 12);
  const gameIds = upcoming.map((g) => g.id);

  const teamStats = new Map<string, { gp: number; gf: number; ga: number; pts: number }>();
  for (const s of data.standings) {
    const team = data.teams.find((t) => t.name === s.team);
    if (!team) continue;
    teamStats.set(team.id, { gp: Number(s.gp || 0), gf: Number(s.gf || 0), ga: Number(s.ga || 0), pts: Number(s.pts || 0) });
  }

  const admin = adminClientSafe();
  const { data: lineRows } = admin && gameIds.length
    ? await admin.from('game_betting_lines').select('*').in('game_id', gameIds)
    : { data: [] as any[] };
  const lineByGame = new Map((lineRows ?? []).map((r: any) => [r.game_id, r]));

  return (
    <main>
      <h1>Betting</h1>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Weekly Game Markets</h2>
        <p className="muted">Moneyline, spread, and total for upcoming league games. Admin lines override model defaults.</p>
      </section>

      <section className="card">
        <div className="betting-grid">
          {upcoming.map((g) => {
            const home = teamStats.get(g.home_team) ?? { gp: 0, gf: 0, ga: 0, pts: 0 };
            const away = teamStats.get(g.away_team) ?? { gp: 0, gf: 0, ga: 0, pts: 0 };
            const homePower = home.gp ? (home.pts / home.gp) * 1.6 + ((home.gf - home.ga) / home.gp) * 0.7 : 0;
            const awayPower = away.gp ? (away.pts / away.gp) * 1.6 + ((away.gf - away.ga) / away.gp) * 0.7 : 0;
            const generated = buildDefaultGameLines({
              homePower,
              awayPower,
              homeAvgFor: home.gp ? home.gf / home.gp : 4.1,
              awayAvgFor: away.gp ? away.gf / away.gp : 4.1,
              homeAvgAgainst: home.gp ? home.ga / home.gp : 4.1,
              awayAvgAgainst: away.gp ? away.ga / away.gp : 4.1,
            });
            const line = lineByGame.get(g.id) || generated;

            return (
              <article key={g.id} className="betting-card">
                <h3>{g.away_team_name} @ {g.home_team_name}</h3>
                <p className="muted">{formatPublicDateTime(g.scheduled_at)} · {g.status}</p>
                <p className="muted">Score: {g.away_score} - {g.home_score}</p>
                <div className="bet-line-row"><span>Moneyline</span><strong>{g.away_team_name} {line.away_moneyline} / {g.home_team_name} {line.home_moneyline}</strong></div>
                <div className="bet-line-row"><span>Spread</span><strong>{g.away_team_name} {line.away_spread > 0 ? `+${line.away_spread}` : line.away_spread} / {g.home_team_name} {line.home_spread > 0 ? `+${line.home_spread}` : line.home_spread}</strong></div>
                <div className="bet-line-row"><span>Total</span><strong>O/U {line.total}</strong></div>
              </article>
            );
          })}
          {!upcoming.length && <p className="muted">No upcoming games available for weekly markets.</p>}
        </div>
      </section>
    </main>
  );
}
