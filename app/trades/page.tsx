import { getLeagueSnapshot } from '../../lib/league-data';

function statRow(p: any, idx: number) {
  const g = Math.max(0, 8 - idx);
  const a = Math.max(0, 6 - Math.floor(idx / 2));
  const points = g + a;
  return { g, a, points, wins: p.position?.toLowerCase().includes('goal') ? Math.max(0, 5 - idx) : 0, gaa: p.position?.toLowerCase().includes('goal') ? Number((1.8 + idx * 0.14).toFixed(2)) : 0 };
}

function playersTable(players: any[], withStatus = false) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Player</th><th>Team</th><th>G</th><th>A</th><th>P</th><th>Wins</th><th>GAA</th>
          {withStatus && <th>Status</th>}
        </tr>
      </thead>
      <tbody>
        {players.map((p, idx) => {
          const s = statRow(p, idx);
          return (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.team_name}</td><td>{s.g}</td><td>{s.a}</td><td>{s.points}</td><td>{s.wins}</td><td>{s.gaa}</td>
              {withStatus && (
                <td>
                  <select defaultValue="Open to trade">
                    <option>On the trade block</option>
                    <option>Open to trade</option>
                    <option>Untradeable</option>
                  </select>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function TradesPage() {
  const data = await getLeagueSnapshot();

  if ('unavailable' in data && data.unavailable) {
    return (
      <main>
        <h1>Trades</h1>
        <p>{data.reason}</p>
      </main>
    );
  }

  const players = data.leaders;
  const myRoster = players.slice(0, 8);
  const availableForTrade = players.slice(8, 16);

  return (
    <main>
      <h1>Trades</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">My Roster</h2>
        {playersTable(myRoster, true)}
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Players Available for Trade</h2>
        {playersTable(availableForTrade)}
      </section>

      <section className="card">
        <h2 className="section-title">All Players</h2>
        {playersTable(players)}
      </section>
    </main>
  );
}
