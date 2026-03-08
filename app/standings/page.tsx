import Link from 'next/link';

import { getLeagueSnapshot } from '../../lib/league-data';

export default async function StandingsPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Standings</h1>
      {'unavailable' in data && data.unavailable ? (
        <p>{data.reason}</p>
      ) : (
        <table className="table">
          <thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>T</th><th>GF</th><th>GA</th><th>PTS</th></tr></thead>
          <tbody>
            {data.standings.map((s) => (
              <tr key={s.team}><td>{s.team}</td><td>{s.gp}</td><td>{s.w}</td><td>{s.l}</td><td>{s.t}</td><td>{s.gf}</td><td>{s.ga}</td><td>{s.pts}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
