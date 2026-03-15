import { getLeagueSnapshot } from '../../lib/league-data';

export default async function StandingsPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Standings</h1>
      {'unavailable' in data && data.unavailable ? (
        <p>{data.reason}</p>
      ) : (
        <section className="card">
          <div className="stack-list">
            {data.standings.map((s) => (
              <article key={s.team} className="list-card standings-card">
                <div>
                  <p><strong>{s.team}</strong></p>
                  <p className="muted">Record: {s.w}-{s.l}-{s.t}</p>
                </div>
                <div className="standings-metrics muted">
                  <span>GP {s.gp}</span>
                  <span>GF {s.gf}</span>
                  <span>GA {s.ga}</span>
                  <span><strong>PTS {s.pts}</strong></span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
