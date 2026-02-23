import { getLeagueSnapshot } from '../lib/league-data';

export default async function HomePage() {
  const data = await getLeagueSnapshot();

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
            <h2>Home</h2>
            <p className="muted">Welcome to Emerald Coast Roller League. Track upcoming faceoffs, scores, leaders, and news from one place.</p>
          </section>

          <div className="grid">
            <section className="card">
              <h3 className="card-title">Upcoming Games</h3>
              {data.schedule.slice(0, 4).map((g) => (
                <p key={g.id}>
                  <strong>{g.home_team_name}</strong> vs <strong>{g.away_team_name}</strong><br />
                  <span className="muted">{new Date(g.scheduled_at).toLocaleString()} · {g.location ?? 'TBD'}</span>
                </p>
              ))}
            </section>

            <section className="card">
              <h3 className="card-title">Recent Scores</h3>
              {data.schedule.filter((g) => g.status === 'FINAL').slice(-4).reverse().map((g) => (
                <p key={g.id}>
                  {g.home_team_name} {g.home_score} - {g.away_score} {g.away_team_name}
                </p>
              ))}
              {data.schedule.filter((g) => g.status === 'FINAL').length === 0 && <p className="muted">No final scores yet.</p>}
            </section>

            <section className="card">
              <h3 className="card-title">Stat Leaders</h3>
              <table className="table">
                <thead><tr><th>Player</th><th>Team</th><th>Pos</th></tr></thead>
                <tbody>
                  {data.leaders.slice(0, 6).map((p) => (
                    <tr key={p.id}><td>{p.name}</td><td>{p.team_name}</td><td>{p.position ?? '-'}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h3 className="card-title">League News</h3>
              <p><span className="badge">Season</span> {data.season?.name ?? 'No active season yet'}</p>
              <p><span className="badge">Teams</span> {data.teams.length} teams active this season.</p>
              <p className="muted">Beach night throwback jerseys are landing this weekend.</p>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
