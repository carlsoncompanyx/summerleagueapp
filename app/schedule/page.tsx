import { getLeagueSnapshot } from '../../lib/league-data';

export default async function SchedulePage() {
  const data = await getLeagueSnapshot();

  if ('unavailable' in data && data.unavailable) {
    return (
      <main>
        <h1>Games</h1>
        <p>{data.reason}</p>
      </main>
    );
  }

  const upcoming = data.schedule.filter((g) => g.status !== 'FINAL');
  const completed = data.schedule.filter((g) => g.status === 'FINAL');

  const renderTable = (rows: typeof data.schedule) => (
    <table className="table">
      <thead>
        <tr><th>Date</th><th>Home Team</th><th>Away Team</th><th>Location</th><th>Home Score</th><th>Away Score</th></tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.id}>
            <td>{new Date(g.scheduled_at).toLocaleString()}</td>
            <td>{g.home_team_name}</td>
            <td>{g.away_team_name}</td>
            <td>{g.location ?? 'TBD'}</td>
            <td>{g.home_score}</td>
            <td>{g.away_score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <main>
      <h1>Games</h1>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Upcoming Games</h2>
        {upcoming.length ? renderTable(upcoming) : <p className="muted">No upcoming games.</p>}
      </section>
      <section className="card">
        <h2 className="section-title">Completed Games</h2>
        {completed.length ? renderTable(completed) : <p className="muted">No completed games yet.</p>}
      </section>
    </main>
  );
}
