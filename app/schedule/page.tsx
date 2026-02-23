import Link from 'next/link';

import { getLeagueSnapshot } from '../../lib/league-data';

export default async function SchedulePage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Schedule</h1>
      {'unavailable' in data && data.unavailable ? (
        <p>{data.reason}</p>
      ) : (
        <table className="table">
          <thead><tr><th>Date</th><th>Matchup</th><th>Location</th><th>Status</th><th>Score</th></tr></thead>
          <tbody>
            {data.schedule.map((g) => (
              <tr key={g.id}>
                <td>{new Date(g.scheduled_at).toLocaleString()}</td>
                <td>{g.home_team_name} vs {g.away_team_name}</td>
                <td>{g.location ?? 'TBD'}</td>
                <td>{g.status}</td>
                <td>{g.home_score}-{g.away_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
