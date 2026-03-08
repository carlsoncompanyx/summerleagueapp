'use client';

import { useEffect, useMemo, useState } from 'react';

type Season = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  registration_open_at: string | null;
  registration_close_at: string | null;
  waiver_text: string | null;
  rules: string | null;
};

type Team = { id: string; season_id: string; name: string; captain_user_id: string | null };
type Player = {
  id: string;
  team_id: string | null;
  user_id: string | null;
  name: string;
  jersey: number | null;
  position: string | null;
  nickname: string | null;
};
type Registration = { id: string; season_id: string; user_id: string; status: string; preferred_positions: string[] | null; experience: string | null };
type Trade = { id: string; season_id: string | null; from_team_id: string; to_team_id: string; player_id: string; status: string };
type Game = { id: string; season_id: string; home_team: string; away_team: string; scheduled_at: string; location: string | null; status: string; home_score: number; away_score: number };

type DashboardPayload = {
  role: 'FAN' | 'PLAYER' | 'CAPTAIN' | 'ADMIN';
  userId: string | null;
  seasons: Season[];
  teams: Team[];
  players: Player[];
  registrations: Registration[];
  games: Game[];
  trades: Trade[];
};

const EMPTY: DashboardPayload = {
  role: 'FAN',
  userId: null,
  seasons: [],
  teams: [],
  players: [],
  registrations: [],
  games: [],
  trades: [],
};

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const headers = lines[0].split(',').map((x) => x.trim());
  const rows = lines.slice(1).map((line) => line.split(',').map((x) => x.trim()));
  return { headers, rows };
}

async function api(action: string, payload?: any) {
  const res = await fetch('/api/admin/dashboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Request failed');
  return data;
}

export default function AdminClient() {
  const [data, setData] = useState<DashboardPayload>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoreGameId, setScoreGameId] = useState<string | null>(null);
  const [csvTeamsOpen, setCsvTeamsOpen] = useState(false);
  const [csvPlayersOpen, setCsvPlayersOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [seasonForm, setSeasonForm] = useState({ name: '', start_date: '', end_date: '', registration_open_at: '', registration_close_at: '', waiver_text: '', rules: '' });
  const [teamForm, setTeamForm] = useState({ season_id: '', name: '', captain_user_id: '' });
  const [playerForm, setPlayerForm] = useState({ team_id: '', user_id: '', name: '', jersey: '', position: '', nickname: '' });
  const [gameForm, setGameForm] = useState({ season_id: '', home_team: '', away_team: '', scheduled_at: '', location: '' });
  const [tradeForm, setTradeForm] = useState({ season_id: '', from_team_id: '', to_team_id: '', player_id: '' });

  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [statsRows, setStatsRows] = useState<Record<string, { games_played: string; goals: string; assists: string; goals_against: string }>>({});

  const teamNameById = useMemo(() => new Map(data.teams.map((t) => [t.id, t.name])), [data.teams]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dashboard', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? 'Unable to load admin dashboard.');
      setData({
        role: payload.role,
        userId: payload.userId,
        seasons: payload.seasons ?? [],
        teams: payload.teams ?? [],
        players: payload.players ?? [],
        registrations: payload.registrations ?? [],
        games: payload.games ?? [],
        trades: payload.trades ?? [],
      });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const scoreGame = data.games.find((g) => g.id === scoreGameId) ?? null;
  const homePlayers = scoreGame ? data.players.filter((p) => p.team_id === scoreGame.home_team) : [];
  const awayPlayers = scoreGame ? data.players.filter((p) => p.team_id === scoreGame.away_team) : [];

  const openScoreWindow = (game: Game) => {
    setScoreGameId(game.id);
    setHomeScore(String(game.home_score ?? 0));
    setAwayScore(String(game.away_score ?? 0));
    const initial: Record<string, { games_played: string; goals: string; assists: string; goals_against: string }> = {};
    data.players
      .filter((p) => p.team_id === game.home_team || p.team_id === game.away_team)
      .forEach((p) => {
        initial[p.id] = { games_played: '', goals: '', assists: '', goals_against: '' };
      });
    setStatsRows(initial);
  };

  const submitGameScore = async () => {
    if (!scoreGame) return;
    const stats = Object.entries(statsRows).map(([player_id, row]) => {
      const player = data.players.find((p) => p.id === player_id);
      return {
        player_id,
        team_id: player?.team_id,
        position: player?.position,
        games_played: row.games_played,
        goals: row.goals,
        assists: row.assists,
        goals_against: row.goals_against,
      };
    });
    await api('game_score_submit', {
      gameId: scoreGame.id,
      homeScore: Number(homeScore || 0),
      awayScore: Number(awayScore || 0),
      stats,
    });
    setScoreGameId(null);
    await load();
  };

  const onCsvFile = async (file: File | null, kind: 'teams' | 'players') => {
    if (!file) return;
    const parsed = parseCsv(await file.text());
    setCsvHeaders(parsed.headers);
    setCsvRows(parsed.rows);

    if (kind === 'teams') {
      setMapping({ season_id: '', name: '', captain_user_id: '' });
    } else {
      setMapping({ team_id: '', user_id: '', name: '', jersey: '', position: '', nickname: '' });
    }
  };

  const importCsv = async (kind: 'teams' | 'players') => {
    if (!csvRows.length) return;
    const rows = csvRows.map((r) => {
      const out: any = {};
      Object.entries(mapping).forEach(([target, source]) => {
        const idx = csvHeaders.findIndex((h) => h === source);
        out[target] = idx >= 0 ? r[idx] : null;
      });
      return out;
    });
    await api(kind === 'teams' ? 'import_teams_csv' : 'import_players_csv', { rows });
    setCsvTeamsOpen(false);
    setCsvPlayersOpen(false);
    await load();
  };

  if (loading) return <main><h1>Admin</h1><p>Loading dashboard...</p></main>;

  return (
    <main>
      <h1>Admin Dashboard</h1>
      <p className="muted">Role: {data.role}</p>
      {error && <p>{error}</p>}

      <section className="card">
        <h2 className="section-title">Seasons (CRUD)</h2>
        <div className="grid">
          <input placeholder="Name" value={seasonForm.name} onChange={(e) => setSeasonForm((s) => ({ ...s, name: e.target.value }))} />
          <input type="date" value={seasonForm.start_date} onChange={(e) => setSeasonForm((s) => ({ ...s, start_date: e.target.value }))} />
          <input type="date" value={seasonForm.end_date} onChange={(e) => setSeasonForm((s) => ({ ...s, end_date: e.target.value }))} />
          <input type="datetime-local" value={seasonForm.registration_open_at} onChange={(e) => setSeasonForm((s) => ({ ...s, registration_open_at: e.target.value }))} />
          <input type="datetime-local" value={seasonForm.registration_close_at} onChange={(e) => setSeasonForm((s) => ({ ...s, registration_close_at: e.target.value }))} />
          <textarea placeholder="Waiver text" value={seasonForm.waiver_text} onChange={(e) => setSeasonForm((s) => ({ ...s, waiver_text: e.target.value }))} />
          <textarea placeholder="Rules" value={seasonForm.rules} onChange={(e) => setSeasonForm((s) => ({ ...s, rules: e.target.value }))} />
          <button onClick={async () => { await api('season_create', seasonForm); await load(); }}>Create Season</button>
        </div>
        <table className="table"><thead><tr><th>Name</th><th>Dates</th><th>Actions</th></tr></thead><tbody>{data.seasons.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.start_date} → {s.end_date}</td><td><button onClick={async ()=>{await api('season_delete',{id:s.id});await load();}}>Delete</button></td></tr>)}</tbody></table>
      </section>

      <section className="card">
        <h2 className="section-title">Teams (CRUD + CSV)</h2>
        <div className="grid">
          <select value={teamForm.season_id} onChange={(e)=>setTeamForm((t)=>({...t,season_id:e.target.value}))}><option value="">Season</option>{data.seasons.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <input placeholder="Team name" value={teamForm.name} onChange={(e)=>setTeamForm((t)=>({...t,name:e.target.value}))} />
          <input placeholder="captain_user_id" value={teamForm.captain_user_id} onChange={(e)=>setTeamForm((t)=>({...t,captain_user_id:e.target.value}))} />
          <button onClick={async()=>{await api('team_create',{...teamForm,captain_user_id:teamForm.captain_user_id||null});await load();}}>Create Team</button>
          <button onClick={()=>setCsvTeamsOpen(true)}>Import Teams CSV</button>
        </div>
        <table className="table"><thead><tr><th>Team</th><th>Season</th><th>Captain</th><th>Actions</th></tr></thead><tbody>{data.teams.map((t)=><tr key={t.id}><td>{t.name}</td><td>{data.seasons.find((s)=>s.id===t.season_id)?.name ?? t.season_id}</td><td>{t.captain_user_id ?? '-'}</td><td><button onClick={async()=>{await api('team_delete',{id:t.id});await load();}}>Delete</button></td></tr>)}</tbody></table>
      </section>

      <section className="card">
        <h2 className="section-title">Players (CRUD + CSV)</h2>
        <div className="grid">
          <select value={playerForm.team_id} onChange={(e)=>setPlayerForm((p)=>({...p,team_id:e.target.value}))}><option value="">Team</option>{data.teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input placeholder="display_name" value={playerForm.name} onChange={(e)=>setPlayerForm((p)=>({...p,name:e.target.value}))} />
          <input placeholder="jersey_number" value={playerForm.jersey} onChange={(e)=>setPlayerForm((p)=>({...p,jersey:e.target.value}))} />
          <input placeholder="position" value={playerForm.position} onChange={(e)=>setPlayerForm((p)=>({...p,position:e.target.value}))} />
          <input placeholder="nickname" value={playerForm.nickname} onChange={(e)=>setPlayerForm((p)=>({...p,nickname:e.target.value}))} />
          <input placeholder="linked user_id (optional)" value={playerForm.user_id} onChange={(e)=>setPlayerForm((p)=>({...p,user_id:e.target.value}))} />
          <button onClick={async()=>{await api('player_create',{team_id:playerForm.team_id||null,user_id:playerForm.user_id||null,name:playerForm.name,jersey:playerForm.jersey?Number(playerForm.jersey):null,position:playerForm.position||null,nickname:playerForm.nickname||null});await load();}}>Create Player</button>
          <button onClick={()=>setCsvPlayersOpen(true)}>Import Players CSV</button>
        </div>
        <table className="table"><thead><tr><th>Name</th><th>Team</th><th>Pos</th><th>Jersey</th><th>Actions</th></tr></thead><tbody>{data.players.map((p)=><tr key={p.id}><td>{p.name}</td><td>{teamNameById.get(p.team_id ?? '') ?? '-'}</td><td>{p.position ?? '-'}</td><td>{p.jersey ?? '-'}</td><td><button onClick={async()=>{await api('player_delete',{id:p.id});await load();}}>Delete</button></td></tr>)}</tbody></table>
      </section>

      <section className="card">
        <h2 className="section-title">Registrations</h2>
        <table className="table"><thead><tr><th>User</th><th>Season</th><th>Preferred</th><th>Experience</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.registrations.map((r)=><tr key={r.id}><td>{r.user_id}</td><td>{data.seasons.find((s)=>s.id===r.season_id)?.name ?? r.season_id}</td><td>{(r.preferred_positions ?? []).join(', ')}</td><td>{r.experience ?? '-'}</td><td>{r.status}</td><td><button onClick={async()=>{await api('registrations_set_status',{id:r.id,status:'approved'});await load();}}>Approve</button> <button onClick={async()=>{await api('registrations_set_status',{id:r.id,status:'rejected'});await load();}}>Reject</button></td></tr>)}</tbody></table>
      </section>

      <section className="card">
        <h2 className="section-title">Games (CRUD + Dynamic Scoring)</h2>
        <div className="grid">
          <select value={gameForm.season_id} onChange={(e)=>setGameForm((g)=>({...g,season_id:e.target.value}))}><option value="">Season</option>{data.seasons.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={gameForm.home_team} onChange={(e)=>setGameForm((g)=>({...g,home_team:e.target.value}))}><option value="">Home Team</option>{data.teams.filter((t)=>!gameForm.season_id||t.season_id===gameForm.season_id).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={gameForm.away_team} onChange={(e)=>setGameForm((g)=>({...g,away_team:e.target.value}))}><option value="">Away Team</option>{data.teams.filter((t)=>!gameForm.season_id||t.season_id===gameForm.season_id).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input type="datetime-local" value={gameForm.scheduled_at} onChange={(e)=>setGameForm((g)=>({...g,scheduled_at:e.target.value}))} />
          <input placeholder="Location" value={gameForm.location} onChange={(e)=>setGameForm((g)=>({...g,location:e.target.value}))} />
          <button onClick={async()=>{await api('game_create',{...gameForm,status:'SCHEDULED'});await load();}}>Create Game</button>
        </div>
        <table className="table"><thead><tr><th>Date</th><th>Matchup</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.games.map((g)=><tr key={g.id}><td>{new Date(g.scheduled_at).toLocaleString()}</td><td>{teamNameById.get(g.home_team) ?? g.home_team} vs {teamNameById.get(g.away_team) ?? g.away_team}</td><td>{g.status} ({g.home_score}-{g.away_score})</td><td><button onClick={()=>openScoreWindow(g)}>Update Score</button> <button onClick={async()=>{await api('game_delete',{id:g.id});await load();}}>Delete</button></td></tr>)}</tbody></table>
      </section>

      <section className="card">
        <h2 className="section-title">Trades</h2>
        <div className="grid">
          <select value={tradeForm.season_id} onChange={(e)=>setTradeForm((t)=>({...t,season_id:e.target.value}))}><option value="">Season</option>{data.seasons.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={tradeForm.from_team_id} onChange={(e)=>setTradeForm((t)=>({...t,from_team_id:e.target.value}))}><option value="">From Team</option>{data.teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={tradeForm.to_team_id} onChange={(e)=>setTradeForm((t)=>({...t,to_team_id:e.target.value}))}><option value="">To Team</option>{data.teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={tradeForm.player_id} onChange={(e)=>setTradeForm((t)=>({...t,player_id:e.target.value}))}><option value="">Player</option>{data.players.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button onClick={async()=>{await api('trade_propose',tradeForm);await load();}}>Propose Trade</button>
        </div>
        <table className="table"><thead><tr><th>Player</th><th>From</th><th>To</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.trades.map((t)=><tr key={t.id}><td>{data.players.find((p)=>p.id===t.player_id)?.name ?? t.player_id}</td><td>{teamNameById.get(t.from_team_id) ?? t.from_team_id}</td><td>{teamNameById.get(t.to_team_id) ?? t.to_team_id}</td><td>{t.status}</td><td><button onClick={async()=>{await api('trade_approve',{tradeId:t.id,playerId:t.player_id,toTeamId:t.to_team_id});await load();}}>Approve</button> <button onClick={async()=>{await api('trade_reject',{tradeId:t.id});await load();}}>Reject</button></td></tr>)}</tbody></table>
      </section>

      {scoreGame && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 1200 }}>
            <h2 className="section-title">Score Entry: {teamNameById.get(scoreGame.home_team)} vs {teamNameById.get(scoreGame.away_team)}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>Home Score ({teamNameById.get(scoreGame.home_team)})</label><input type="number" value={homeScore} onChange={(e)=>setHomeScore(e.target.value)} /></div>
              <div><label>Away Score ({teamNameById.get(scoreGame.away_team)})</label><input type="number" value={awayScore} onChange={(e)=>setAwayScore(e.target.value)} /></div>
            </div>

            <h3 className="section-title" style={{ marginTop: 10 }}>{teamNameById.get(scoreGame.home_team)} Roster</h3>
            <table className="table"><thead><tr><th>Player</th><th>Position</th><th>GP</th><th>G</th><th>A</th><th>GA</th></tr></thead><tbody>{homePlayers.map((p)=><tr key={p.id}><td>{p.name}</td><td>{p.position ?? '-'}</td><td><input value={statsRows[p.id]?.games_played ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),games_played:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.goals ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),goals:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.assists ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),assists:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.goals_against ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),goals_against:e.target.value}}))} /></td></tr>)}</tbody></table>

            <h3 className="section-title" style={{ marginTop: 10 }}>{teamNameById.get(scoreGame.away_team)} Roster</h3>
            <table className="table"><thead><tr><th>Player</th><th>Position</th><th>GP</th><th>G</th><th>A</th><th>GA</th></tr></thead><tbody>{awayPlayers.map((p)=><tr key={p.id}><td>{p.name}</td><td>{p.position ?? '-'}</td><td><input value={statsRows[p.id]?.games_played ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),games_played:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.goals ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),goals:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.assists ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),assists:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.goals_against ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),goals_against:e.target.value}}))} /></td></tr>)}</tbody></table>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitGameScore}>Save Score + Stats</button>
              <button onClick={()=>setScoreGameId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {(csvTeamsOpen || csvPlayersOpen) && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <h2 className="section-title">{csvTeamsOpen ? 'Import Teams CSV' : 'Import Players CSV'}</h2>
            <input type="file" accept=".csv" onChange={(e)=>onCsvFile(e.target.files?.[0] ?? null, csvTeamsOpen ? 'teams' : 'players')} />
            <div className="grid" style={{ marginTop: 10 }}>
              {Object.keys(mapping).map((field)=><div key={field}><label>{field}</label><select value={mapping[field] ?? ''} onChange={(e)=>setMapping((m)=>({...m,[field]:e.target.value}))}><option value="">-- CSV column --</option>{csvHeaders.map((h)=><option key={h} value={h}>{h}</option>)}</select></div>)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={()=>importCsv(csvTeamsOpen ? 'teams' : 'players')}>Import</button>
              <button onClick={()=>{setCsvTeamsOpen(false);setCsvPlayersOpen(false);}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
