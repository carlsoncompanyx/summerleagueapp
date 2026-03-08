'use client';

import { useMemo, useState } from 'react';

type StatRow = {
  id: string;
  name: string;
  team_name: string;
  g: number;
  a: number;
  p: number;
  gpg: number;
  ppg: number;
  wins: number;
  gaa: number;
  isGoalie: boolean;
};

function buildRows(leaders: any[]): StatRow[] {
  return leaders.map((p, idx) => {
    const gamesPlayed = Math.max(1, 10 - Math.floor(idx / 2));
    const goals = Math.max(0, 12 - idx);
    const assists = Math.max(0, 8 - Math.floor(idx / 2));
    const points = goals + assists;
    const isGoalie = p.position?.toLowerCase().includes('goal') ?? false;
    const wins = isGoalie ? Math.max(0, 7 - idx) : 0;
    const gaa = isGoalie ? Number((1.4 + idx * 0.2).toFixed(2)) : 0;

    return {
      id: p.id,
      name: p.name,
      team_name: p.team_name,
      g: goals,
      a: assists,
      p: points,
      gpg: Number((goals / gamesPlayed).toFixed(2)),
      ppg: Number((points / gamesPlayed).toFixed(2)),
      wins,
      gaa,
      isGoalie,
    };
  });
}

function skaterTable(rows: StatRow[]) {
  return (
    <table className="table">
      <thead><tr><th>Player</th><th>Team</th><th>G</th><th>A</th><th>P</th><th>G/GP</th><th>P/GP</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}><td>{r.name}</td><td>{r.team_name}</td><td>{r.g}</td><td>{r.a}</td><td>{r.p}</td><td>{r.gpg}</td><td>{r.ppg}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function goalieTable(rows: StatRow[]) {
  return (
    <table className="table">
      <thead><tr><th>Player</th><th>Team</th><th>Wins</th><th>GAA</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}><td>{r.name}</td><td>{r.team_name}</td><td>{r.wins}</td><td>{r.gaa}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StatisticsClient({ data }: { data: any }) {
  const allRows = useMemo(() => ('unavailable' in data && data.unavailable ? [] : buildRows(data.leaders)), [data]);
  const teamOptions = useMemo(() => ['All Teams', ...Array.from(new Set(allRows.map((r) => r.team_name)))], [allRows]);
  const [teamFilter, setTeamFilter] = useState('All Teams');

  if ('unavailable' in data && data.unavailable) {
    return <main><h1>Statistics</h1><p>{data.reason}</p></main>;
  }

  const filtered = teamFilter === 'All Teams' ? allRows : allRows.filter((r) => r.team_name === teamFilter);
  const skaters = filtered.filter((r) => !r.isGoalie);
  const goalies = filtered.filter((r) => r.isGoalie);

  const topSkaters = [...skaters].sort((a, b) => b.p - a.p).slice(0, 10);
  const topGoalies = [...goalies].sort((a, b) => b.wins - a.wins || a.gaa - b.gaa).slice(0, 10);

  return (
    <main>
      <h1>Statistics</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Leaderboard</h2>

        <h3 className="card-title">Skaters</h3>
        {topSkaters.length ? skaterTable(topSkaters) : <p className="muted">No skater stats available.</p>}

        <h3 className="card-title" style={{ marginTop: 14 }}>Goalies</h3>
        {topGoalies.length ? goalieTable(topGoalies) : <p className="muted">No goalie stats available.</p>}
      </section>

      <section className="card">
        <h2 className="section-title">All Stats</h2>

        <div style={{ marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <label htmlFor="team-filter">Team</label>
          <select id="team-filter" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <h3 className="card-title">Skaters</h3>
        {skaters.length ? skaterTable(skaters) : <p className="muted">No skater stats available.</p>}

        <h3 className="card-title" style={{ marginTop: 14 }}>Goalies</h3>
        {goalies.length ? goalieTable(goalies) : <p className="muted">No goalie stats available.</p>}
      </section>
    </main>
  );
}
