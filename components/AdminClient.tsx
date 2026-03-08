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

type PlayerRow = {
  id: string;
  name: string;
  team_name: string;
  position: string | null;
};

type PlayerStats = {
  gp: string;
  g: string;
  a: string;
  ga: string;
};

const CSV_FIELDS = ['scheduled_at', 'home_team', 'away_team', 'location', 'status', 'home_score', 'away_score'] as const;

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(',').map((v) => v.trim()));
  return { headers, rows };
}

export default function AdminClient({ schedule, players }: { schedule: GameRow[]; players: PlayerRow[] }) {
  const sortedGames = useMemo(
    () =>
      [...schedule].sort(
        (a, b) =>
          Number(a.status === 'FINAL') - Number(b.status === 'FINAL') ||
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
      ),
    [schedule],
  );

  const [games, setGames] = useState(sortedGames);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [scoreGame, setScoreGame] = useState<GameRow | null>(null);
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStats>>({});

  const [csvOpen, setCsvOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const toggleSelect = (id: string) => {
    setSelectedGameIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const deleteSelected = () => {
    setGames((prev) => prev.filter((g) => !selectedGameIds.includes(g.id)));
    setSelectedGameIds([]);
  };

  const openScoreWindow = (game: GameRow) => {
    const teamPlayers = players.filter(
      (p) => p.team_name === game.home_team_name || p.team_name === game.away_team_name,
    );
    const nextStats: Record<string, PlayerStats> = {};
    teamPlayers.forEach((p) => {
      nextStats[p.id] = { gp: '', g: '', a: '', ga: '' };
    });

    setPlayerStats(nextStats);
    setHomeScore(String(game.home_score ?? 0));
    setAwayScore(String(game.away_score ?? 0));
    setScoreGame(game);
  };

  const onCsvFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setCsvHeaders(parsed.headers);
    setCsvRows(parsed.rows);

    const nextMapping: Record<string, string> = {};
    CSV_FIELDS.forEach((field) => {
      const exact = parsed.headers.find((h) => h.toLowerCase() === field.toLowerCase());
      nextMapping[field] = exact ?? '';
    });
    setFieldMapping(nextMapping);
  };

  const importMappedCsv = () => {
    if (!csvRows.length) return;

    const mappedGames: GameRow[] = csvRows.map((row, index) => {
      const valueFor = (field: string) => {
        const header = fieldMapping[field];
        const headerIndex = csvHeaders.findIndex((h) => h === header);
        return headerIndex >= 0 ? row[headerIndex] ?? '' : '';
      };

      return {
        id: `csv-${Date.now()}-${index}`,
        scheduled_at: valueFor('scheduled_at') || new Date().toISOString(),
        home_team_name: valueFor('home_team') || 'TBD',
        away_team_name: valueFor('away_team') || 'TBD',
        location: valueFor('location') || null,
        status: valueFor('status') || 'SCHEDULED',
        home_score: Number(valueFor('home_score') || 0),
        away_score: Number(valueFor('away_score') || 0),
      };
    });

    setGames((prev) => [...mappedGames, ...prev]);
    setCsvOpen(false);
  };

  const homePlayers = scoreGame
    ? players.filter((p) => p.team_name === scoreGame.home_team_name)
    : [];
  const awayPlayers = scoreGame
    ? players.filter((p) => p.team_name === scoreGame.away_team_name)
    : [];

  return (
    <main>
      <h1>Admin</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Player Information & Registration</h2>
        <p className="muted">Current players loaded: {players.length}</p>
        <table className="table">
          <thead>
            <tr><th>Player</th><th>Team</th><th>Position</th></tr>
          </thead>
          <tbody>
            {players.slice(0, 20).map((p) => (
              <tr key={p.id}><td>{p.name}</td><td>{p.team_name}</td><td>{p.position ?? '-'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Schedule Management</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setSelectedGameIds(games.map((g) => g.id))}>Select All</button>
          <button type="button" onClick={deleteSelected}>Delete Selected</button>
          <button type="button" onClick={() => setCsvOpen(true)}>Open Import CSV Window</button>
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
          <thead><tr><th>Date</th><th>Matchup</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>{new Date(g.scheduled_at).toLocaleString()}</td>
                <td>{g.home_team_name} {g.home_score} - {g.away_score} {g.away_team_name}</td>
                <td>{g.status}</td>
                <td><button type="button" onClick={() => openScoreWindow(g)}>Update Game Score</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {csvOpen && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <h2 className="section-title">Import Schedule CSV Window</h2>
            <input type="file" accept=".csv" onChange={(e) => onCsvFile(e.target.files?.[0] ?? null)} />
            <p className="muted">Upload your file, then map CSV columns to Supabase columns.</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {CSV_FIELDS.map((field) => (
                <div key={field} style={{ display: 'grid', gap: 4 }}>
                  <label>{field}</label>
                  <select
                    value={fieldMapping[field] ?? ''}
                    onChange={(e) => setFieldMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                  >
                    <option value="">-- Select CSV Column --</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {csvRows.length > 0 && <p className="muted">Rows loaded: {csvRows.length}</p>}
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button type="button" onClick={importMappedCsv}>Import Mapped Rows</button>
              <button type="button" onClick={() => setCsvOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scoreGame && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 1100 }}>
            <h2 className="section-title">Update Score Window: {scoreGame.home_team_name} vs {scoreGame.away_team_name}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label>Home Score ({scoreGame.home_team_name})</label>
                <input type="number" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} />
              </div>
              <div>
                <label>Away Score ({scoreGame.away_team_name})</label>
                <input type="number" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} />
              </div>
            </div>

            <h3 className="section-title" style={{ marginTop: 14 }}>{scoreGame.home_team_name} Players</h3>
            <table className="table">
              <thead><tr><th>Player</th><th>Position</th><th>GP</th><th>G</th><th>A</th><th>GA (Goalies)</th></tr></thead>
              <tbody>
                {homePlayers.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.position ?? '-'}</td>
                    <td><input value={playerStats[p.id]?.gp ?? ''} onChange={(e) => setPlayerStats((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { gp: '', g: '', a: '', ga: '' }), gp: e.target.value } }))} /></td>
                    <td><input value={playerStats[p.id]?.g ?? ''} onChange={(e) => setPlayerStats((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { gp: '', g: '', a: '', ga: '' }), g: e.target.value } }))} /></td>
                    <td><input value={playerStats[p.id]?.a ?? ''} onChange={(e) => setPlayerStats((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { gp: '', g: '', a: '', ga: '' }), a: e.target.value } }))} /></td>
                    <td><input value={playerStats[p.id]?.ga ?? ''} onChange={(e) => setPlayerStats((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { gp: '', g: '', a: '', ga: '' }), ga: e.target.value } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="section-title" style={{ marginTop: 14 }}>{scoreGame.away_team_name} Players</h3>
            <table className="table">
              <thead><tr><th>Player</th><th>Position</th><th>GP</th><th>G</th><th>A</th><th>GA (Goalies)</th></tr></thead>
              <tbody>
                {awayPlayers.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.position ?? '-'}</td>
                    <td><input value={playerStats[p.id]?.gp ?? ''} onChange={(e) => setPlayerStats((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { gp: '', g: '', a: '', ga: '' }), gp: e.target.value } }))} /></td>
                    <td><input value={playerStats[p.id]?.g ?? ''} onChange={(e) => setPlayerStats((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { gp: '', g: '', a: '', ga: '' }), g: e.target.value } }))} /></td>
                    <td><input value={playerStats[p.id]?.a ?? ''} onChange={(e) => setPlayerStats((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { gp: '', g: '', a: '', ga: '' }), a: e.target.value } }))} /></td>
                    <td><input value={playerStats[p.id]?.ga ?? ''} onChange={(e) => setPlayerStats((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { gp: '', g: '', a: '', ga: '' }), ga: e.target.value } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setScoreGame(null)}>Save</button>
              <button type="button" onClick={() => setScoreGame(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
