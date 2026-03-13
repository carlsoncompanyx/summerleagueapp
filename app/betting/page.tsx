import { buildDefaultGameLines } from '../../lib/betting';
import { getLeagueSnapshot } from '../../lib/league-data';
import { createAdminSupabaseClient } from '../../lib/supabase/admin';

function adminClientSafe() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try { return createAdminSupabaseClient(); } catch { return null; }
}

export default async function BettingPage() {
  const data = await getLeagueSnapshot();
  if ('unavailable' in data && data.unavailable) {
    return <main><h1>Betting</h1><p>{data.reason}</p></main>;
  }

  const upcoming = data.schedule.filter((g) => new Date(g.scheduled_at).getTime() > Date.now()).slice(0, 12);
  const gameIds = upcoming.map((g) => g.id);
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
        <p className="muted">Focused MVP markets: moneyline, spread, and over/under on upcoming slate games.</p>
      </section>

      <section className="card">
        <div className="betting-grid">
          {upcoming.map((g) => {
            const generated = buildDefaultGameLines(g);
            const line = lineByGame.get(g.id) || generated;
            return (
              <article key={g.id} className="betting-card">
                <h3>{g.away_team_name} @ {g.home_team_name}</h3>
                <p className="muted">{new Date(g.scheduled_at).toLocaleString()}</p>
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
