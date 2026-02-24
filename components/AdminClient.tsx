'use client';

import { useMemo, useState } from 'react';

type GameRow = {
  id: string;
  scheduled_at: string;
  home_team_name: string;
  away_team_name: string;
  location: string | null;
  status: string;
  home_score: number;
  away_score: number;
};

export default function AdminClient({ schedule, players }: { schedule: GameRow[]; players: any[] }) {
  const sortedGames = useMemo(
    () => [...schedule].sort((a, b) => Number(a.status === 'FINAL') - Number(b.status === 'FINAL') || new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [schedule]
  );

  const [games, setGames] = useState(sortedGames);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [scoreGame, setScoreGame] = useState<GameRow | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedGameIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const deleteSelected = () => setGames((prev) => prev.filter((g) => !selectedGameIds.includes(g.id)));

  return (
    <main>
      <h1>Admin</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Player Information & Registration</h2>
        <p className="muted">Current players loaded: {players.length}</p>
        <table className="table">
          <thead><tr><th>Player</th><th>Team</th><th>Position</th></tr></thead>
          <tbody>{players.slice(0, 12).map((p: any) => <tr key={p.id}><td>{p.name}</td><td>{p.team_name}</td><td>{p.position ?? '-'}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Schedule Management</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button type="button" onClick={() => setSelectedGameIds(games.map((g) => g.id))}>Select All</button>
          <button type="button" onClick={deleteSelected}>Delete Selected</button>
          <button type="button" onClick={() => setCsvOpen(true)}>Import CSV</button>
        </div>
        <table className="table">
          <thead><tr><th></th><th>Date</th><th>Home</th><th>Away</th><th>Location</th><th>Status</th></tr></thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td><input type="checkbox" checked={selectedGameIds.includes(g.id)} onChange={() => toggleSelect(g.id)} /></td>
                <td><input defaultValue={new Date(g.scheduled_at).toLocaleString()} /></td>
                <td><input defaultValue={g.home_team_name} /></td>
                <td><input defaultValue={g.away_team_name} /></td>
                <td><input defaultValue={g.location ?? ''} /></td>
                <td>{g.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="section-title">Game Scores</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>Home</th><th>Away</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>{new Date(g.scheduled_at).toLocaleString()}</td>
                <td>{g.home_team_name} ({g.home_score})</td>
                <td>{g.away_team_name} ({g.away_score})</td>
                <td>{g.status}</td>
                <td><button type="button" onClick={() => setScoreGame(g)}>Update Game Score</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {scoreGame && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 className="section-title">Update Score: {scoreGame.home_team_name} vs {scoreGame.away_team_name}</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Home Score</label>
            <input type="number" defaultValue={scoreGame.home_score} />
            <label>Away Score</label>
            <input type="number" defaultValue={scoreGame.away_score} />
            <label>Home Team Goals/Assists by Player</label>
            <textarea rows={4} placeholder="Player A: G2 A1" />
            <label>Away Team Goals/Assists by Player</label>
            <textarea rows={4} placeholder="Player B: G1 A0" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setScoreGame(null)}>Save</button>
              <button type="button" onClick={() => setScoreGame(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {csvOpen && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 className="section-title">Import Schedule CSV</h2>
          <input type="file" accept=".csv" />
          <p className="muted">Map CSV fields below before import.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Date Field</label><input defaultValue="scheduled_at" />
            <label>Home Team Field</label><input defaultValue="home_team" />
            <label>Away Team Field</label><input defaultValue="away_team" />
            <label>Location Field</label><input defaultValue="location" />
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setCsvOpen(false)}>Import</button>
            <button type="button" onClick={() => setCsvOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </main>
  );
}
