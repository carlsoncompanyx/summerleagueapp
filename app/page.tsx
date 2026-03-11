import Link from 'next/link';
import { getLeagueSnapshot } from '../lib/league-data';
import { getSeasonStats } from '../lib/stats/getStats';

export default async function HomePage() {
  const [data, stats] = await Promise.all([getLeagueSnapshot(), getSeasonStats()]);

  return (
    <main>
      {'unavailable' in data && data.unavailable ? (
        <section className="card" style={{ marginTop: 14 }}>
          <h2>League Data Unavailable</h2>
          <p>{data.reason}</p>
          <p className="muted">Set Supabase env vars and ensure RLS/data access is configured.</p>
        </section>
      ) : (
        <>
          <section className="hero">
            <h2>{data.season?.name ?? 'Emerald Coast Roller League'}</h2>
            <p className="muted">League HQ for schedule, standings, community chatter, trades, and DFS every week.</p>
            <div className="form-actions" style={{ marginTop: 8 }}>
              <Link className="header-auth-link" href="/schedule">View Schedule</Link>
              <Link className="header-auth-link" href="/dfs">Open DFS</Link>
              <Link className="header-auth-link" href="/chat">Join Community</Link>
            </div>
          </section>

          <div className="grid">
            <section className="card">
              <h3 className="card-title">Next Playable DFS Slate</h3>
              {data.nextSlate ? (
                <>
                  <p><strong>{data.nextSlate.name}</strong></p>
                  <p className="muted">Locks: {new Date(data.nextSlate.lock_at).toLocaleString()}</p>
                  <p className="muted">Games: {data.nextSlate.games.length}</p>
                  <p className="muted">Contest: {data.nextSlate.contest?.name ?? 'No contest yet'}</p>
                </>
              ) : (
                <p className="muted">No slate generated yet. Admin can generate the next default slate from DFS admin controls.</p>
              )}
            </section>

            <section className="card">
              <h3 className="card-title">Upcoming Games</h3>
              {data.schedule.filter((g) => new Date(g.scheduled_at).getTime() > Date.now()).slice(0, 4).map((g) => (
                <p key={g.id}>
                  <strong>{g.home_team_name}</strong> vs <strong>{g.away_team_name}</strong><br />
                  <span className="muted">{new Date(g.scheduled_at).toLocaleString()} · {g.location ?? 'TBD'}</span>
                </p>
              ))}
            </section>

            <section className="card">
              <h3 className="card-title">Recent Scores</h3>
              {data.schedule.filter((g) => g.status === 'FINAL').slice(-4).reverse().map((g) => (
                <p key={g.id}>{g.home_team_name} {g.home_score} - {g.away_score} {g.away_team_name}</p>
              ))}
              {data.schedule.filter((g) => g.status === 'FINAL').length === 0 && <p className="muted">No final scores yet.</p>}
            </section>

            <section className="card">
              <h3 className="card-title">Standings Snapshot</h3>
              <table className="table">
                <thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>PTS</th></tr></thead>
                <tbody>
                  {data.standings.slice(0, 6).map((s) => <tr key={s.team}><td>{s.team}</td><td>{s.gp}</td><td>{s.w}</td><td>{s.l}</td><td>{s.pts}</td></tr>)}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3 className="card-title">Stat Leaders</h3>
              <table className="table">
                <thead><tr><th>Player</th><th>Team</th><th>P</th></tr></thead>
                <tbody>
                  {(stats.players ?? []).slice(0, 6).map((p: any) => (
                    <tr key={p.player_id}><td>{p.name}</td><td>{p.team_name}</td><td>{p.points}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3 className="card-title">League News</h3>
              {(data.chatMessages ?? []).slice(0, 4).map((m: any) => (
                <p key={m.id}><span className="badge">{m.role}</span> {m.message}</p>
              ))}
              {(!data.chatMessages || data.chatMessages.length === 0) && <p className="muted">No messages yet. Kick things off in Community.</p>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
