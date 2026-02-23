import Link from 'next/link';

import { getLeagueSnapshot } from '../../lib/league-data';

export default async function StatisticsPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Statistics</h1>
      {'unavailable' in data && data.unavailable ? (
        <p>{data.reason}</p>
      ) : (
        <div className="card">
          <h2 className="section-title">Stat Leaders</h2>
          <table className="table">
            <thead><tr><th>Player</th><th>Team</th><th>Position</th><th>Nickname</th></tr></thead>
            <tbody>
              {data.leaders.map((p) => (
                <tr key={p.id}><td>{p.name}</td><td>{p.team_name}</td><td>{p.position ?? '-'}</td><td>{p.nickname ?? '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
