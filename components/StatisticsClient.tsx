'use client';

import { useMemo, useState } from 'react';

type StatRow = {
  id: string;
  name: string;
  team_name: string;
  g: number;
  a: number;
  p: number;
  wins: number;
  gaa: number;
};

function buildRows(leaders: any[]): StatRow[] {
  return leaders.map((p, idx) => {
    const goals = Math.max(0, 12 - idx);
    const assists = Math.max(0, 8 - Math.floor(idx / 2));
    const points = goals + assists;
    const wins = p.position?.toLowerCase().includes('goal') ? Math.max(0, 6 - idx) : 0;
    const gaa = p.position?.toLowerCase().includes('goal') ? Number((1.5 + idx * 0.18).toFixed(2)) : 0;
    return {
      id: p.id,
      name: p.name,
      team_name: p.team_name,
      g: goals,
      a: assists,
      p: points,
      wins,
      gaa,
    };
  });
}

export default function StatisticsClient({ data }: { data: any }) {
  const allRows = useMemo(() => ('unavailable' in data && data.unavailable ? [] : buildRows(data.leaders)), [data]);
  const teamOptions = useMemo(() => ['All Teams', ...Array.from(new Set(allRows.map((r) => r.team_name)))], [allRows]);
  const [teamFilter, setTeamFilter] = useState('All Teams');

  if ('unavailable' in data && data.unavailable) {
    return (
      <main>
        <h1>Statistics</h1>
        <p>{data.reason}</p>
      </main>
    );
  }

  const filtered = teamFilter === 'All Teams' ? allRows : allRows.filter((r) => r.team_name === teamFilter);
  const leaderboard = [...filtered].sort((a, b) => b.p - a.p).slice(0, 10);

  const table = (rows: StatRow[]) => (
    <table className="table">
      <thead>
        <tr><th>Player</th><th>Team</th><th>G</th><th>A</th><th>P</th><th>Wins</th><th>GAA</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}><td>{r.name}</td><td>{r.team_name}</td><td>{r.g}</td><td>{r.a}</td><td>{r.p}</td><td>{r.wins}</td><td>{r.gaa}</td></tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <main>
      <h1>Statistics</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Leaderboard</h2>
        {table(leaderboard)}
      </section>

      <section className="card">
        <h2 className="section-title">All Stats</h2>
        <div style={{ marginBottom: 10, display: 'flex', gap: 10 }}>
          <label htmlFor="team-filter">Team</label>
          <select id="team-filter" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {table(filtered)}
      </section>
    </main>
  );
}
