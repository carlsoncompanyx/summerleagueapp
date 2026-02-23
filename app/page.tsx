import { getLeagueSnapshot } from '../lib/league-data';

export default async function HomePage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <section className="hero">
        <h2 className="section-title">Home</h2>
        <p className="muted">Welcome to ECRL. Track games, scores, stats, and league chatter in one place.</p>
      </section>

      {'unavailable' in data && data.unavailable ? (
        <section className="card" style={{ marginTop: 14 }}>
          <h2>League Data Unavailable</h2>
          <p>{data.reason}</p>
          <p className="muted">Set Supabase env vars and ensure RLS/data access is configured.</p>
        </section>
      ) : (
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
            <p className="muted">News feed hooks can be connected to a dedicated table next.</p>
          </section>
        </div>
      )}
    </main>
  );
}
