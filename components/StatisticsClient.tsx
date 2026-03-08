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
  wins?: number;
  goals_against?: number;
  fantasy_points: number;
  fantasy_points_avg: number;
};

export default function StatisticsClient({ data }: { data: any }) {
  const rows = (data?.players ?? []) as PlayerStat[];
  const teamOptions = useMemo(() => ['All Teams', ...Array.from(new Set(rows.map((r) => r.team_name || 'Unknown')))], [rows]);
  const [teamFilter, setTeamFilter] = useState('All Teams');

  const filtered = teamFilter === 'All Teams' ? rows : rows.filter((r) => (r.team_name || 'Unknown') === teamFilter);
  const skaters = filtered.filter((r) => !(r.position || '').toLowerCase().includes('goal'));
  const goalies = filtered.filter((r) => (r.position || '').toLowerCase().includes('goal'));

  const topSkaters = [...skaters].sort((a, b) => b.fantasy_points - a.fantasy_points).slice(0, 10);
  const topGoalies = [...goalies].sort((a, b) => b.fantasy_points - a.fantasy_points).slice(0, 10);

  return (
    <main>
      <h1>Statistics</h1>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Leaderboard</h2>
        <h3 className="card-title">Skaters</h3>
        <div className="grid">
          {topSkaters.map((r) => (
            <PlayerStatCard key={r.player_id} name={r.name} teamName={r.team_name} position={r.position} gp={r.games_played} goals={r.goals} assists={r.assists} fantasyPoints={r.fantasy_points} fantasyAvg={r.fantasy_points_avg} compact />
          ))}
          {topSkaters.length === 0 && <p className="muted">No skater stats available.</p>}
        </div>

        <h3 className="card-title" style={{ marginTop: 14 }}>Goalies</h3>
        <table className="table">
          <thead><tr><th>Player</th><th>Team</th><th>Wins</th><th>GAA</th><th>FP</th></tr></thead>
          <tbody>
            {topGoalies.map((r) => {
              const gaa = r.games_played > 0 ? (Number(r.goals_against || 0) / r.games_played).toFixed(2) : '0.00';
              return <tr key={r.player_id}><td>{r.name}</td><td>{r.team_name}</td><td>{r.wins || 0}</td><td>{gaa}</td><td>{r.fantasy_points.toFixed(1)}</td></tr>;
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="section-title">All Stats</h2>
        <div style={{ marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <label htmlFor="team-filter">Team</label>
          <select id="team-filter" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <table className="table">
          <thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>GP</th><th>G</th><th>A</th><th>P</th><th>FP</th><th>FP/GP</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.player_id}><td>{r.name}</td><td>{r.team_name}</td><td>{r.position}</td><td>{r.games_played}</td><td>{r.goals}</td><td>{r.assists}</td><td>{r.goals + r.assists}</td><td>{r.fantasy_points.toFixed(1)}</td><td>{r.fantasy_points_avg.toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
