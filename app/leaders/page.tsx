import Link from 'next/link';

import { getLeagueSnapshot } from '../../lib/league-data';

export default async function LeadersPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Leaders</h1>
      {'unavailable' in data && data.unavailable ? (
        <p>{data.reason}</p>
      ) : (
        <table className="table">
          <thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>Nickname</th></tr></thead>
          <tbody>
            {data.leaders.map((p) => (
              <tr key={p.id}><td>{p.name}</td><td>{p.team_name}</td><td>{p.position ?? '-'}</td><td>{p.nickname ?? '-'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
