'use client';

import { useMemo, useState, useEffect } from 'react';

type Role = 'FAN' | 'PLAYER' | 'CAPTAIN' | 'ADMIN';
type Tab = 'dashboard' | 'seasons' | 'teams' | 'players' | 'registrations' | 'games' | 'scores' | 'trades';

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

type Team = { id: string; season_id: string; name: string; captain_user_id: string | null; logo_url?: string | null };
type Player = {
  id: string;
  team_id: string | null;
  user_id: string | null;
  name: string;
  jersey: number | null;
  position: string | null;
  nickname: string | null;
};
type Profile = { user_id: string; display_name: string; role: Role; team_id: string | null };
type Registration = { id: string; season_id: string; user_id: string; status: string; preferred_positions: string[] | null; experience: string | null };
type Trade = {
  id: string;
  season_id: string;
  from_team_id: string;
  to_team_id: string;
  players_out: string[];
  players_in: string[];
  proposed_by: string;
  message: string | null;
  status: string;
};
type Game = { id: string; season_id: string; home_team: string; away_team: string; scheduled_at: string; location: string | null; status: string; home_score: number; away_score: number };

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'seasons', label: 'Seasons' },
  { key: 'teams', label: 'Teams' },
  { key: 'players', label: 'Players' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'games', label: 'Games & Schedule' },
  { key: 'scores', label: 'Scores' },
  { key: 'trades', label: 'Trades' },
];

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const headers = lines[0].split(',').map((x) => x.trim());
  const rows = lines.slice(1).map((line) => line.split(',').map((x) => x.trim()));
  return { headers, rows };
}

export default function AdminClient() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [role, setRole] = useState<Role>('FAN');
  const [testMode, setTestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  const [seasonFilter, setSeasonFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');

  const [seasonForm, setSeasonForm] = useState({ id: '', name: '', start_date: '', end_date: '', registration_open_at: '', registration_close_at: '', waiver_text: '', rules: '' });
  const [teamForm, setTeamForm] = useState({ id: '', season_id: '', name: '', captain_user_id: '', logo_url: '' });
  const [playerForm, setPlayerForm] = useState({ id: '', team_id: '', user_id: '', name: '', jersey: '', position: '', nickname: '' });
  const [gameForm, setGameForm] = useState({ id: '', season_id: '', home_team: '', away_team: '', scheduled_at: '', location: '', status: 'SCHEDULED' });
  const [tradeForm, setTradeForm] = useState({ season_id: '', from_team_id: '', to_team_id: '', players_out: [] as string[], players_in: [] as string[], proposed_by: '', message: '' });

  const [assignRegId, setAssignRegId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ team_id: '', name: '', jersey: '', position: '', nickname: '' });

  const [scoreGameId, setScoreGameId] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [statsRows, setStatsRows] = useState<Record<string, { games_played: string; goals: string; assists: string; goals_against: string }>>({});

  const [csvModal, setCsvModal] = useState<null | 'players' | 'games'>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvRowErrors, setCsvRowErrors] = useState<string[]>([]);

  const canMutateAdmin = role === 'ADMIN' || testMode;
  const canProposeTrade = canMutateAdmin || role === 'CAPTAIN';

  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const profileNameById = useMemo(() => new Map(profiles.map((p) => [p.user_id, p.display_name])), [profiles]);

  const seasonTeams = useMemo(() => (seasonFilter === 'all' ? teams : teams.filter((t) => t.season_id === seasonFilter)), [teams, seasonFilter]);
  const seasonPlayers = useMemo(() => {
    const teamIds = new Set(seasonTeams.map((t) => t.id));
    const base = players.filter((p) => (p.team_id ? teamIds.has(p.team_id) : false));
    if (teamFilter === 'all') return base;
    return base.filter((p) => p.team_id === teamFilter);
  }, [players, seasonTeams, teamFilter]);

  const filteredRegistrations = useMemo(() => {
    const rows = seasonFilter === 'all' ? registrations : registrations.filter((r) => r.season_id === seasonFilter);
    return [...rows].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1));
  }, [registrations, seasonFilter]);

  const filteredGames = useMemo(() => (seasonFilter === 'all' ? games : games.filter((g) => g.season_id === seasonFilter)), [games, seasonFilter]);
  const filteredTrades = useMemo(() => (seasonFilter === 'all' ? trades : trades.filter((t) => t.season_id === seasonFilter)), [trades, seasonFilter]);

  const scoreGame = filteredGames.find((g) => g.id === scoreGameId) ?? null;
  const homePlayers = scoreGame ? players.filter((p) => p.team_id === scoreGame.home_team) : [];
  const awayPlayers = scoreGame ? players.filter((p) => p.team_id === scoreGame.away_team) : [];

  const runAction = async (action: string, payload?: any) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/dashboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body?.rowErrors) setCsvRowErrors(body.rowErrors);
        throw new Error(body?.error ?? 'Request failed');
      }
      setMessage('Saved successfully.');
      await load();
      return body;
    } catch (e: any) {
      setError(e?.message ?? 'Operation failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dashboard', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Unable to load dashboard');

      setRole(body.role ?? 'FAN');
      setTestMode(Boolean(body.testMode));
      setSeasons(body.seasons ?? []);
      setTeams(body.teams ?? []);
      setPlayers(body.players ?? []);
      setProfiles(body.profiles ?? []);
      setRegistrations(body.registrations ?? []);
      setGames(body.games ?? []);
      setTrades(body.trades ?? []);

      const defaultSeason = body.seasons?.[0]?.id ?? 'all';
      setSeasonFilter((current) => (current === 'all' || body.seasons?.some((s: Season) => s.id === current) ? current : defaultSeason));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const beginEditSeason = (s: Season) => setSeasonForm({
    id: s.id,
    name: s.name,
    start_date: String(s.start_date ?? '').slice(0, 10),
    end_date: String(s.end_date ?? '').slice(0, 10),
    registration_open_at: s.registration_open_at ? String(s.registration_open_at).slice(0, 16) : '',
    registration_close_at: s.registration_close_at ? String(s.registration_close_at).slice(0, 16) : '',
    waiver_text: s.waiver_text ?? '',
    rules: s.rules ?? '',
  });

  const beginEditTeam = (t: Team) => setTeamForm({
    id: t.id,
    season_id: t.season_id,
    name: t.name,
    captain_user_id: t.captain_user_id ?? '',
    logo_url: t.logo_url ?? '',
  });

  const beginEditPlayer = (p: Player) => setPlayerForm({
    id: p.id,
    team_id: p.team_id ?? '',
    user_id: p.user_id ?? '',
    name: p.name,
    jersey: p.jersey?.toString() ?? '',
    position: p.position ?? '',
    nickname: p.nickname ?? '',
  });

  const beginEditGame = (g: Game) => setGameForm({
    id: g.id,
    season_id: g.season_id,
    home_team: g.home_team,
    away_team: g.away_team,
    scheduled_at: String(g.scheduled_at).slice(0, 16),
    location: g.location ?? '',
    status: g.status,
  });

  const openScoreEditor = (g: Game) => {
    setScoreGameId(g.id);
    setHomeScore(String(g.home_score ?? 0));
    setAwayScore(String(g.away_score ?? 0));
    const next: Record<string, { games_played: string; goals: string; assists: string; goals_against: string }> = {};
    players.filter((p) => p.team_id === g.home_team || p.team_id === g.away_team).forEach((p) => {
      next[p.id] = { games_played: '', goals: '', assists: '', goals_against: '' };
    });
    setStatsRows(next);
  };

  const onCsvFile = async (file: File | null) => {
    if (!file || !csvModal) return;
    const { headers, rows } = parseCsv(await file.text());
    setCsvHeaders(headers);
    setCsvRows(rows);
    setCsvRowErrors([]);

    if (csvModal === 'players') {
      setCsvMapping({ season_name: '', team_name: '', name: '', jersey_number: '', position: '', nickname: '', user_id: '' });
    } else {
      setCsvMapping({ season_name: '', home_team_name: '', away_team_name: '', scheduled_at: '', location: '', status: '' });
    }
  };

  if (loading) return <main><h1>Admin Dashboard</h1><p>Loading...</p></main>;

  if (!canMutateAdmin && role !== 'CAPTAIN') {
    return <main><h1>Admin Dashboard</h1><p>Access denied. Admin or captain role required.</p></main>;
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>League Operations Dashboard</h1>
          <p className="muted">Role: {role}{testMode ? ' (ADMIN TEST MODE)' : ''}</p>
        </div>
        <div>
          <label>Season</label>{' '}
          <select value={seasonFilter} onChange={(e) => { setSeasonFilter(e.target.value); setTeamFilter('all'); }}>
            <option value="all">All Seasons</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {TABS.map((tab) => (
          <button key={tab.key} className={`tab-link ${activeTab === tab.key ? 'is-active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {error && <p>{error}</p>}
      {message && <p>{message}</p>}

      {activeTab === 'dashboard' && (
        <section className="card">
          <h2 className="section-title">Dashboard</h2>
          <p className="muted">Seasons: {seasons.length} · Teams: {seasonTeams.length} · Players: {seasonPlayers.length} · Registrations: {filteredRegistrations.length} · Games: {filteredGames.length} · Trades: {filteredTrades.length}</p>
        </section>
      )}

      {activeTab === 'seasons' && (
        <section className="card">
          <h2 className="section-title">Seasons</h2>
          <div className="grid">
            <input placeholder="Name" value={seasonForm.name} onChange={(e) => setSeasonForm((s) => ({ ...s, name: e.target.value }))} />
            <input type="date" value={seasonForm.start_date} onChange={(e) => setSeasonForm((s) => ({ ...s, start_date: e.target.value }))} />
            <input type="date" value={seasonForm.end_date} onChange={(e) => setSeasonForm((s) => ({ ...s, end_date: e.target.value }))} />
            <input type="datetime-local" value={seasonForm.registration_open_at} onChange={(e) => setSeasonForm((s) => ({ ...s, registration_open_at: e.target.value }))} />
            <input type="datetime-local" value={seasonForm.registration_close_at} onChange={(e) => setSeasonForm((s) => ({ ...s, registration_close_at: e.target.value }))} />
            <textarea placeholder="Waiver text" value={seasonForm.waiver_text} onChange={(e) => setSeasonForm((s) => ({ ...s, waiver_text: e.target.value }))} />
            <textarea placeholder="Rules" value={seasonForm.rules} onChange={(e) => setSeasonForm((s) => ({ ...s, rules: e.target.value }))} />
            <button disabled={!canMutateAdmin || busy} onClick={() => runAction(seasonForm.id ? 'season_update' : 'season_create', seasonForm)}> {seasonForm.id ? 'Update Season' : 'Create Season'} </button>
          </div>
          <table className="table"><thead><tr><th>Name</th><th>Dates</th><th>Registration Window</th><th>Actions</th></tr></thead><tbody>{seasons.map((s)=><tr key={s.id}><td>{s.name}</td><td>{s.start_date} → {s.end_date}</td><td>{s.registration_open_at ?? '-'} → {s.registration_close_at ?? '-'}</td><td><button onClick={()=>beginEditSeason(s)}>Edit</button> <button disabled={!canMutateAdmin} onClick={()=>confirm('Delete season?')&&runAction('season_delete',{id:s.id})}>Delete</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'teams' && (
        <section className="card">
          <h2 className="section-title">Teams</h2>
          <div className="grid">
            <select value={teamForm.season_id} onChange={(e)=>setTeamForm((t)=>({...t,season_id:e.target.value}))}><option value="">Season</option>{seasons.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <input placeholder="Team name" value={teamForm.name} onChange={(e)=>setTeamForm((t)=>({...t,name:e.target.value}))} />
            <select value={teamForm.captain_user_id} onChange={(e)=>setTeamForm((t)=>({...t,captain_user_id:e.target.value}))}><option value="">Captain</option>{profiles.map((p)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select>
            <input placeholder="Logo URL" value={teamForm.logo_url} onChange={(e)=>setTeamForm((t)=>({...t,logo_url:e.target.value}))} />
            <button disabled={!canMutateAdmin || busy} onClick={()=>runAction(teamForm.id ? 'team_update':'team_create',{...teamForm,captain_user_id:teamForm.captain_user_id||null,logo_url:teamForm.logo_url||null})}>{teamForm.id?'Update Team':'Create Team'}</button>
          </div>
          <table className="table"><thead><tr><th>Team</th><th>Season</th><th>Captain</th><th>Actions</th></tr></thead><tbody>{seasonTeams.map((t)=><tr key={t.id}><td>{t.name}</td><td>{seasons.find((s)=>s.id===t.season_id)?.name}</td><td>{t.captain_user_id ? profileNameById.get(t.captain_user_id) ?? t.captain_user_id : '-'}</td><td><button onClick={()=>beginEditTeam(t)}>Edit</button> <button disabled={!canMutateAdmin} onClick={()=>confirm('Delete team?')&&runAction('team_delete',{id:t.id})}>Delete</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'players' && (
        <section className="card">
          <h2 className="section-title">Players</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={teamFilter} onChange={(e)=>setTeamFilter(e.target.value)}><option value="all">All Teams</option>{seasonTeams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <button onClick={()=>setCsvModal('players')}>Import Players CSV</button>
          </div>
          <div className="grid" style={{ marginTop: 8 }}>
            <select value={playerForm.team_id} onChange={(e)=>setPlayerForm((p)=>({...p,team_id:e.target.value}))}><option value="">Team</option>{seasonTeams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <input placeholder="Display name" value={playerForm.name} onChange={(e)=>setPlayerForm((p)=>({...p,name:e.target.value}))} />
            <input placeholder="Jersey #" value={playerForm.jersey} onChange={(e)=>setPlayerForm((p)=>({...p,jersey:e.target.value}))} />
            <input placeholder="Position" value={playerForm.position} onChange={(e)=>setPlayerForm((p)=>({...p,position:e.target.value}))} />
            <input placeholder="Nickname" value={playerForm.nickname} onChange={(e)=>setPlayerForm((p)=>({...p,nickname:e.target.value}))} />
            <select value={playerForm.user_id} onChange={(e)=>setPlayerForm((p)=>({...p,user_id:e.target.value}))}><option value="">Linked user (optional)</option>{profiles.map((pr)=><option key={pr.user_id} value={pr.user_id}>{pr.display_name}</option>)}</select>
            <button disabled={!canMutateAdmin || busy} onClick={()=>runAction(playerForm.id?'player_update':'player_create',{...playerForm,team_id:playerForm.team_id||null,user_id:playerForm.user_id||null,jersey:playerForm.jersey?Number(playerForm.jersey):null,position:playerForm.position||null,nickname:playerForm.nickname||null})}>{playerForm.id?'Update Player':'Create Player'}</button>
          </div>
          <table className="table"><thead><tr><th>Name</th><th>Team</th><th>Pos</th><th>Jersey</th><th>Actions</th></tr></thead><tbody>{seasonPlayers.map((p)=><tr key={p.id}><td>{p.name}</td><td>{teamNameById.get(p.team_id ?? '') ?? '-'}</td><td>{p.position ?? '-'}</td><td>{p.jersey ?? '-'}</td><td><button onClick={()=>beginEditPlayer(p)}>Edit</button> <button disabled={!canMutateAdmin} onClick={()=>confirm('Delete player?')&&runAction('player_delete',{id:p.id})}>Delete</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'registrations' && (
        <section className="card">
          <h2 className="section-title">Registrations</h2>
          <table className="table"><thead><tr><th>User</th><th>Season</th><th>Preferred</th><th>Experience</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredRegistrations.map((r)=><tr key={r.id}><td>{profileNameById.get(r.user_id) ?? r.user_id}</td><td>{seasons.find((s)=>s.id===r.season_id)?.name}</td><td>{(r.preferred_positions ?? []).join(', ')}</td><td>{r.experience ?? '-'}</td><td>{r.status}</td><td><button disabled={!canMutateAdmin} onClick={()=>runAction('registrations_set_status',{id:r.id,status:'approved'})}>Approve</button> <button disabled={!canMutateAdmin} onClick={()=>runAction('registrations_set_status',{id:r.id,status:'rejected'})}>Reject</button> <button disabled={!canMutateAdmin} onClick={()=>{setAssignRegId(r.id); setAssignForm({ team_id:'', name: profileNameById.get(r.user_id) ?? '', jersey:'', position:'', nickname:''});}}>Assign to Team</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'games' && (
        <section className="card">
          <h2 className="section-title">Games & Schedule</h2>
          <button onClick={()=>setCsvModal('games')}>Import Games CSV</button>
          <div className="grid" style={{ marginTop: 8 }}>
            <select value={gameForm.season_id} onChange={(e)=>setGameForm((g)=>({...g,season_id:e.target.value}))}><option value="">Season</option>{seasons.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select value={gameForm.home_team} onChange={(e)=>setGameForm((g)=>({...g,home_team:e.target.value}))}><option value="">Home Team</option>{teams.filter((t)=>!gameForm.season_id||t.season_id===gameForm.season_id).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <select value={gameForm.away_team} onChange={(e)=>setGameForm((g)=>({...g,away_team:e.target.value}))}><option value="">Away Team</option>{teams.filter((t)=>!gameForm.season_id||t.season_id===gameForm.season_id).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <input type="datetime-local" value={gameForm.scheduled_at} onChange={(e)=>setGameForm((g)=>({...g,scheduled_at:e.target.value}))} />
            <input placeholder="Location" value={gameForm.location} onChange={(e)=>setGameForm((g)=>({...g,location:e.target.value}))} />
            <select value={gameForm.status} onChange={(e)=>setGameForm((g)=>({...g,status:e.target.value}))}><option>SCHEDULED</option><option>LIVE</option><option>FINAL</option><option>CANCELED</option></select>
            <button disabled={!canMutateAdmin || busy} onClick={()=>runAction(gameForm.id?'game_update':'game_create',{...gameForm,location:gameForm.location||null})}>{gameForm.id?'Update Game':'Create Game'}</button>
          </div>
          <table className="table"><thead><tr><th>Date</th><th>Matchup</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredGames.map((g)=><tr key={g.id}><td>{new Date(g.scheduled_at).toLocaleString()}</td><td>{teamNameById.get(g.home_team)} vs {teamNameById.get(g.away_team)}</td><td>{g.status}</td><td><button onClick={()=>beginEditGame(g)}>Edit</button> <button disabled={!canMutateAdmin} onClick={()=>confirm('Delete game?')&&runAction('game_delete',{id:g.id})}>Delete</button> <button onClick={()=>openScoreEditor(g)}>Scores</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'scores' && (
        <section className="card">
          <h2 className="section-title">Scores</h2>
          <p className="muted">Select a game from Games & Schedule and click Scores.</p>
          {scoreGame ? <p>Currently editing: {teamNameById.get(scoreGame.home_team)} vs {teamNameById.get(scoreGame.away_team)}</p> : <p>No game selected.</p>}
        </section>
      )}

      {activeTab === 'trades' && (
        <section className="card">
          <h2 className="section-title">Trades</h2>
          <div className="grid">
            <select value={tradeForm.season_id} onChange={(e)=>setTradeForm((t)=>({...t,season_id:e.target.value,from_team_id:'',to_team_id:'',players_out:[],players_in:[]}))}><option value="">Season</option>{seasons.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select value={tradeForm.from_team_id} onChange={(e)=>setTradeForm((t)=>({...t,from_team_id:e.target.value,players_out:[]}))}><option value="">Team A</option>{teams.filter((t)=>!tradeForm.season_id||t.season_id===tradeForm.season_id).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <select value={tradeForm.to_team_id} onChange={(e)=>setTradeForm((t)=>({...t,to_team_id:e.target.value,players_in:[]}))}><option value="">Team B</option>{teams.filter((t)=>!tradeForm.season_id||t.season_id===tradeForm.season_id).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <select multiple value={tradeForm.players_out} onChange={(e)=>setTradeForm((t)=>({...t,players_out:Array.from(e.target.selectedOptions).map((o)=>o.value)}))}>{players.filter((p)=>p.team_id===tradeForm.from_team_id).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select multiple value={tradeForm.players_in} onChange={(e)=>setTradeForm((t)=>({...t,players_in:Array.from(e.target.selectedOptions).map((o)=>o.value)}))}>{players.filter((p)=>p.team_id===tradeForm.to_team_id).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select value={tradeForm.proposed_by} onChange={(e)=>setTradeForm((t)=>({...t,proposed_by:e.target.value}))}><option value="">Proposed by</option>{profiles.filter((p)=>['CAPTAIN','ADMIN'].includes(p.role)).map((p)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select>
            <textarea placeholder="Message (optional)" value={tradeForm.message} onChange={(e)=>setTradeForm((t)=>({...t,message:e.target.value}))} />
            <button disabled={!canProposeTrade || busy} onClick={()=>runAction('trade_propose',{...tradeForm,message:tradeForm.message||null})}>Propose Trade</button>
          </div>

          <table className="table"><thead><tr><th>Season</th><th>A → B</th><th>B → A</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredTrades.map((t)=><tr key={t.id}><td>{seasons.find((s)=>s.id===t.season_id)?.name}</td><td>{(t.players_out ?? []).map((id)=>players.find((p)=>p.id===id)?.name ?? id).join(', ')}</td><td>{(t.players_in ?? []).map((id)=>players.find((p)=>p.id===id)?.name ?? id).join(', ')}</td><td>{t.status}</td><td><button disabled={!canMutateAdmin} onClick={()=>runAction('trade_approve',{tradeId:t.id})}>Approve</button> <button disabled={!canMutateAdmin} onClick={()=>runAction('trade_reject',{tradeId:t.id})}>Reject</button></td></tr>)}</tbody></table>
        </section>
      )}

      {assignRegId && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <h2 className="section-title">Assign Approved Registration to Player</h2>
            <div className="grid">
              <select value={assignForm.team_id} onChange={(e)=>setAssignForm((a)=>({...a,team_id:e.target.value}))}><option value="">Team</option>{seasonTeams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <input placeholder="Player name" value={assignForm.name} onChange={(e)=>setAssignForm((a)=>({...a,name:e.target.value}))} />
              <input placeholder="Jersey" value={assignForm.jersey} onChange={(e)=>setAssignForm((a)=>({...a,jersey:e.target.value}))} />
              <input placeholder="Position" value={assignForm.position} onChange={(e)=>setAssignForm((a)=>({...a,position:e.target.value}))} />
              <input placeholder="Nickname" value={assignForm.nickname} onChange={(e)=>setAssignForm((a)=>({...a,nickname:e.target.value}))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={async ()=>{await runAction('registration_assign_player',{registrationId:assignRegId,...assignForm}); setAssignRegId(null);}}>Assign</button>
              <button onClick={()=>setAssignRegId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scoreGame && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 1150 }}>
            <h2 className="section-title">Score Entry: {teamNameById.get(scoreGame.home_team)} vs {teamNameById.get(scoreGame.away_team)}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>Home Score ({teamNameById.get(scoreGame.home_team)})</label><input type="number" value={homeScore} onChange={(e)=>setHomeScore(e.target.value)} /></div>
              <div><label>Away Score ({teamNameById.get(scoreGame.away_team)})</label><input type="number" value={awayScore} onChange={(e)=>setAwayScore(e.target.value)} /></div>
            </div>
            <h3>{teamNameById.get(scoreGame.home_team)}</h3>
            <table className="table"><thead><tr><th>Player</th><th>Position</th><th>GP</th><th>G</th><th>A</th><th>GA</th></tr></thead><tbody>{homePlayers.map((p)=><tr key={p.id}><td>{p.name}</td><td>{p.position ?? '-'}</td><td><input value={statsRows[p.id]?.games_played ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),games_played:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.goals ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),goals:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.assists ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),assists:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.goals_against ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),goals_against:e.target.value}}))} /></td></tr>)}</tbody></table>
            <h3>{teamNameById.get(scoreGame.away_team)}</h3>
            <table className="table"><thead><tr><th>Player</th><th>Position</th><th>GP</th><th>G</th><th>A</th><th>GA</th></tr></thead><tbody>{awayPlayers.map((p)=><tr key={p.id}><td>{p.name}</td><td>{p.position ?? '-'}</td><td><input value={statsRows[p.id]?.games_played ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),games_played:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.goals ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),goals:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.assists ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),assists:e.target.value}}))} /></td><td><input value={statsRows[p.id]?.goals_against ?? ''} onChange={(e)=>setStatsRows((m)=>({...m,[p.id]:{...(m[p.id]??{games_played:'',goals:'',assists:'',goals_against:''}),goals_against:e.target.value}}))} /></td></tr>)}</tbody></table>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={()=>runAction('game_score_submit',{gameId:scoreGame.id,homeScore:Number(homeScore||0),awayScore:Number(awayScore||0),stats:Object.entries(statsRows).map(([player_id,row])=>({player_id,team_id:players.find((p)=>p.id===player_id)?.team_id,position:players.find((p)=>p.id===player_id)?.position,...row}))})}>Save Score + Stats</button>
              <button onClick={()=>setScoreGameId(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {csvModal && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <h2 className="section-title">Import {csvModal === 'players' ? 'Players' : 'Games'} CSV</h2>
            <input type="file" accept=".csv" onChange={(e)=>onCsvFile(e.target.files?.[0] ?? null)} />
            <div className="grid" style={{ marginTop: 10 }}>
              {Object.keys(csvMapping).map((target)=><div key={target}><label>{target}</label><select value={csvMapping[target] || ''} onChange={(e)=>setCsvMapping((m)=>({...m,[target]:e.target.value}))}><option value="">-- CSV column --</option>{csvHeaders.map((h)=><option key={h} value={h}>{h}</option>)}</select></div>)}
            </div>
            {csvRowErrors.length > 0 && <div className="card" style={{ marginTop: 8 }}>{csvRowErrors.map((err, i) => <p key={i}>{err}</p>)}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={()=>runAction(csvModal === 'players' ? 'import_players_csv' : 'import_games_csv',{rows:csvRows.map((row)=>{const out:any={};Object.entries(csvMapping).forEach(([k,v])=>{const idx=csvHeaders.findIndex((h)=>h===v);out[k]=idx>=0?row[idx]:'';});return out;})})}>Import</button>
              <button onClick={()=>setCsvModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
