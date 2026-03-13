'use client';

import { useMemo, useState } from 'react';
import PlayerStatCard from './PlayerStatCard';

type PlayerStat = {
  player_id: string;
  name: string;
  team_name?: string;
  position?: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
  wins?: number;
  goals_against?: number;
  recent_form?: number;
};

export default function StatisticsClient({ data }: { data: any }) {
  const rows = (data?.players ?? []) as PlayerStat[];
  const teamOptions = useMemo(() => ['All Teams', ...Array.from(new Set(rows.map((r) => r.team_name || 'Unknown')))], [rows]);
  const [teamFilter, setTeamFilter] = useState('All Teams');

  const filtered = teamFilter === 'All Teams' ? rows : rows.filter((r) => (r.team_name || 'Unknown') === teamFilter);
  const skaters = filtered.filter((r) => !(r.position || '').toLowerCase().includes('goal'));
  const goalies = filtered.filter((r) => (r.position || '').toLowerCase().includes('goal'));

  const topSkaters = [...skaters].sort((a, b) => b.points - a.points).slice(0, 10);
  const topGoalies = [...goalies].sort((a, b) => Number(b.wins || 0) - Number(a.wins || 0)).slice(0, 10);

  return (
    <main>
      <h1>Statistics</h1>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">League Leaders</h2>
        <h3 className="card-title">Skaters</h3>
        <div className="grid">
          {topSkaters.map((r) => (
            <PlayerStatCard
              key={r.player_id}
              name={r.name}
              teamName={r.team_name}
              position={r.position}
              gp={r.games_played}
              goals={r.goals}
              assists={r.assists}
              points={r.points}
              recentForm={r.recent_form != null ? Number(r.recent_form).toFixed(2) : undefined}
              compact
            />
          ))}
          {topSkaters.length === 0 && <p className="muted">No skater stats available.</p>}
        </div>

        <h3 className="card-title" style={{ marginTop: 14 }}>Goalies</h3>
        <div className="responsive-table"><table className="table">
          <thead><tr><th>Player</th><th>Team</th><th>GP</th><th>Wins</th><th>GA</th><th>GAA</th></tr></thead>
          <tbody>
            {topGoalies.map((r) => {
              const gaa = r.games_played > 0 ? (Number(r.goals_against || 0) / r.games_played).toFixed(2) : '0.00';
              return <tr key={r.player_id}><td>{r.name}</td><td>{r.team_name}</td><td>{r.games_played}</td><td>{r.wins || 0}</td><td>{r.goals_against || 0}</td><td>{gaa}</td></tr>;
            })}
          </tbody>
        </table></div>
      </section>

      <section className="card">
        <h2 className="section-title">All League Stats</h2>
        <div style={{ marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <label htmlFor="team-filter">Team</label>
          <select id="team-filter" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="responsive-table"><table className="table">
          <thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>GP</th><th>G</th><th>A</th><th>P</th><th>Wins</th><th>GA</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.player_id}><td>{r.name}</td><td>{r.team_name}</td><td>{r.position}</td><td>{r.games_played}</td><td>{r.goals}</td><td>{r.assists}</td><td>{r.points}</td><td>{r.wins || 0}</td><td>{r.goals_against || 0}</td></tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </main>
  );
}
