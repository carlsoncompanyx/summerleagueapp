import { getLeagueSnapshot } from '../../lib/league-data';
import { formatPublicDateTime } from '../../lib/formatters';

export default async function SchedulePage() {
  const data = await getLeagueSnapshot();

  if ('unavailable' in data && data.unavailable) {
    return <main><h1>Games</h1><p>{data.reason}</p></main>;
  }

  const upcoming = data.schedule.filter((g) => g.status !== 'FINAL');
  const completed = data.schedule.filter((g) => g.status === 'FINAL').reverse();

  return (
    <main>
      <h1>Games</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Upcoming</h2>
        <div className="stack-list">
          {upcoming.map((g) => (
            <article key={g.id} className="list-card">
              <p><strong>{g.away_team_name}</strong> @ <strong>{g.home_team_name}</strong></p>
              <p className="muted">{formatPublicDateTime(g.scheduled_at)}</p>
              <p className="muted">{g.location ?? 'TBD'} · {g.status}</p>
            </article>
          ))}
          {!upcoming.length && <p className="muted">No upcoming games.</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Final Scores</h2>
        <div className="stack-list">
          {completed.map((g) => (
            <article key={g.id} className="list-card">
              <p><strong>{g.away_team_name} {g.away_score}</strong> · <strong>{g.home_team_name} {g.home_score}</strong></p>
              <p className="muted">{formatPublicDateTime(g.scheduled_at)} · Final</p>
            </article>
          ))}
          {!completed.length && <p className="muted">No final scores yet.</p>}
        </div>
      </section>
    </main>
  );
}
