import { getLeagueSnapshot } from '../../lib/league-data';

export default async function StandingsPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Standings</h1>
      <p className='muted'>Season: {data.season?.name ?? 'Current season'}</p>
      {'unavailable' in data && data.unavailable ? (
        <p>{data.reason}</p>
      ) : !data.standings.length ? (
        <section className='card'><p className='muted'>Preseason: standings will appear after results are recorded.</p></section>
      ) : (
        <section className="card">
          <div className="desktop-only responsive-table">
            <table className="table"><thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>T</th><th>GF</th><th>GA</th><th>PTS</th></tr></thead><tbody>
              {data.standings.map((s) => <tr key={s.team}><td>{s.team}</td><td>{s.gp}</td><td>{s.w}</td><td>{s.l}</td><td>{s.t}</td><td>{s.gf}</td><td>{s.ga}</td><td><strong>{s.pts}</strong></td></tr>)}
            </tbody></table>
          </div>
          <div className="mobile-only stack-list">
            {data.standings.map((s) => <article key={s.team} className="list-card compact"><p><strong>{s.team}</strong></p><p className="muted">{s.w}-{s.l}-{s.t} · GP {s.gp} · GF {s.gf} · GA {s.ga} · PTS {s.pts}</p></article>)}
          </div>
        </section>
      )}
    </main>
  );
}
