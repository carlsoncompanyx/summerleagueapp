'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseCsv } from '../lib/csv/parse';
import { formatPublicDateTime, fromLeagueDateTimeInput, toLeagueDateTimeInput } from '../lib/formatters';

type Role = 'FAN' | 'PLAYER' | 'CAPTAIN' | 'ADMIN';
type Tab = 'dashboard' | 'seasons' | 'teams' | 'players' | 'registrations' | 'games' | 'scores' | 'trades' | 'dfs';

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
type Player = { id: string; season_id: string | null; team_id: string | null; user_id: string | null; name: string; jersey: number | null; position: string | null; nickname: string | null };
type Profile = { user_id: string; first_name?: string | null; last_name?: string | null; display_name: string | null; role: Role; team_id: string | null };
type Registration = { id: string; season_id: string; user_id: string; status: string; preferred_positions: string[] | null; experience: string | null };
type Trade = { id: string; season_id: string; from_team_id: string; to_team_id: string; players_out: string[]; players_in: string[]; proposed_by: string; message: string | null; status: string };
type Game = { id: string; season_id: string; home_team: string; away_team: string; scheduled_at: string; location: string | null; status: string; home_score: number; away_score: number };

type DashboardResponse = {
  role: Role;
  testMode: boolean;
  currentSeasonId?: string | null;
  seasons: Season[];
  teams: Team[];
  players: Player[];
  profiles: Profile[];
  registrations: Registration[];
  games: Game[];
  trades: Trade[];
};

type DfsSlate = { id: string; name: string; status: string; season_id: string | null };
type DfsSlatePlayer = { id: string; player_id: string; salary: number; projection_points: number; baseline_points?: number; availability_status?: string; valuation_source?: string; valuation_grade?: string; historical_match_name?: string | null; historical_match_confidence?: string | null; current_projection_input?: number | null; historical_projection_input?: number | null; league_average_projection_input?: number | null; player?: { name?: string; position?: string; team_name?: string } };
type DfsValuationRow = {
  player_id: string;
  player_name: string;
  position: string;
  grade: string;
  min_sample_games: string;
  manual_projection: string;
  manual_salary: string;
  notes: string;
};

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'seasons', label: 'Seasons' },
  { key: 'teams', label: 'Teams' },
  { key: 'players', label: 'Players' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'games', label: 'Games & Schedule' },
  { key: 'scores', label: 'Scores' },
  { key: 'trades', label: 'Trades' },
  { key: 'dfs', label: 'DFS' },
];


export default function AdminClient() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [role, setRole] = useState<Role>('FAN');
  const [testMode, setTestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
  const [playerForm, setPlayerForm] = useState({ id: '', season_id: '', team_id: '', user_id: '', name: '', jersey: '', position: '' });
  const [gameForm, setGameForm] = useState({ id: '', season_id: '', home_team: '', away_team: '', scheduled_at: '', location: '', status: 'SCHEDULED' });
  const [dfsSlateSeasonId, setDfsSlateSeasonId] = useState('');
  const [dfsSlateName, setDfsSlateName] = useState('Custom Slate');
  const [dfsSlateLock, setDfsSlateLock] = useState('');
  const [dfsContestSlateId, setDfsContestSlateId] = useState('');
  const [dfsContestName, setDfsContestName] = useState('Main Contest');
  const [dfsContestLock, setDfsContestLock] = useState('');
  const [dfsContestCap, setDfsContestCap] = useState('50000');
  const [dfsContestMaxEntries, setDfsContestMaxEntries] = useState('5');
  const [dfsSlates, setDfsSlates] = useState<DfsSlate[]>([]);
  const [dfsAvailabilitySlateId, setDfsAvailabilitySlateId] = useState('');
  const [dfsSlatePlayers, setDfsSlatePlayers] = useState<DfsSlatePlayer[]>([]);
  const [dfsValSeasonId, setDfsValSeasonId] = useState('');
  const [dfsValuationRows, setDfsValuationRows] = useState<DfsValuationRow[]>([]);

  const [assignRegId, setAssignRegId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ team_id: '', name: '', jersey: '', position: '' });

  const [scoreGameId, setScoreGameId] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [statsRows, setStatsRows] = useState<Record<string, { games_played: string; goals: string; assists: string; goals_against: string }>>({});

  const [csvModal, setCsvModal] = useState<null | 'players' | 'games'>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvRowErrors, setCsvRowErrors] = useState<string[]>([]);

  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const profileNameById = useMemo(() => new Map(profiles.map((p) => { const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(); return [p.user_id, (p.display_name && p.display_name.trim()) || full || 'Unknown']; })), [profiles]);

  const seasonTeams = useMemo(() => seasonFilter === 'all' ? teams : teams.filter((t) => t.season_id === seasonFilter), [teams, seasonFilter]);
  const seasonPlayers = useMemo(() => {
    const teamIds = new Set(seasonTeams.map((t) => t.id));
    const base = seasonFilter === 'all'
      ? players
      : players.filter((p) => p.season_id === seasonFilter || (p.team_id ? teamIds.has(p.team_id) : false));

    if (teamFilter === 'all') return base;
    if (teamFilter === 'unassigned') return base.filter((p) => !p.team_id);
    return base.filter((p) => p.team_id === teamFilter);
  }, [players, seasonTeams, seasonFilter, teamFilter]);

  const unassignedSeasonPlayers = useMemo(
    () => seasonPlayers.filter((p) => !p.team_id),
    [seasonPlayers],
  );

  const filteredRegistrations = useMemo(() => {
    const rows = seasonFilter === 'all' ? registrations : registrations.filter((r) => r.season_id === seasonFilter);
    return [...rows].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1));
  }, [registrations, seasonFilter]);
  const filteredGames = useMemo(() => seasonFilter === 'all' ? games : games.filter((g) => g.season_id === seasonFilter), [games, seasonFilter]);
  const filteredTrades = useMemo(() => seasonFilter === 'all' ? trades : trades.filter((t) => t.season_id === seasonFilter), [trades, seasonFilter]);

  const scoreGame = games.find((g) => g.id === scoreGameId) ?? null;
  const homePlayers = scoreGame ? players.filter((p) => p.team_id === scoreGame.home_team) : [];
  const awayPlayers = scoreGame ? players.filter((p) => p.team_id === scoreGame.away_team) : [];

  const refreshDfsSlatePlayers = async (slateId: string) => {
    if (!slateId) return;
    const j = await fetch(`/api/dfs?slate_id=${encodeURIComponent(slateId)}`).then((r) => r.json());
    setDfsSlatePlayers(j?.slatePlayers ?? []);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dashboard', { cache: 'no-store' });
      const body: DashboardResponse | { error?: string } = await res.json();
      if (!res.ok) throw new Error((body as any)?.error ?? 'Unable to load dashboard.');

      const data = body as DashboardResponse;
      setRole(data.role);
      setTestMode(data.testMode);
      setSeasons(data.seasons ?? []);
      setTeams(data.teams ?? []);
      setPlayers(data.players ?? []);
      setProfiles(data.profiles ?? []);
      setRegistrations(data.registrations ?? []);
      setGames(data.games ?? []);
      setTrades(data.trades ?? []);
      if ((data as any).currentSeasonId) setSeasonFilter((data as any).currentSeasonId);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (activeTab !== 'dfs') return;
    fetch('/api/dfs')
      .then((r) => r.json())
      .then((j) => {
        setDfsSlates(j?.slates ?? []);
        if (!dfsAvailabilitySlateId && j?.recommendedSlateId) setDfsAvailabilitySlateId(j.recommendedSlateId);
        if (!dfsValSeasonId && seasons.length) setDfsValSeasonId(seasons[0].id);
      })
      .catch(() => setDfsSlates([]));
  }, [activeTab, seasons]);

  useEffect(() => {
    if (activeTab !== 'dfs' || !dfsAvailabilitySlateId) return;
    refreshDfsSlatePlayers(dfsAvailabilitySlateId).catch(() => setDfsSlatePlayers([]));
  }, [activeTab, dfsAvailabilitySlateId]);

  useEffect(() => {
    if (activeTab !== 'dfs' || !dfsValSeasonId) return;
    Promise.all([
      fetch(`/api/dfs?season_id=${encodeURIComponent(dfsValSeasonId)}`).then((r) => r.json()),
    ]).then(([dfsJson]) => {
      const inputByPlayer = new Map((dfsJson?.valuationInputs ?? []).map((r: any) => [r.player_id, r]));
      const overrideByPlayer = new Map((dfsJson?.projectionOverrides ?? []).map((r: any) => [r.player_id, r]));
      const seasonPlayers = players.filter((p) => p.season_id === dfsValSeasonId);
      setDfsValuationRows(seasonPlayers.map((p) => {
        const input: any = inputByPlayer.get(p.id);
        const override: any = overrideByPlayer.get(p.id);
        return {
          player_id: p.id,
          player_name: p.name,
          position: p.position ?? '-',
          grade: String(input?.player_grade ?? 'C').toUpperCase(),
          min_sample_games: String(input?.min_sample_games ?? 2),
          manual_projection: override?.projection_points != null ? String(override.projection_points) : '',
          manual_salary: override?.salary_override != null ? String(override.salary_override) : '',
          notes: (override?.notes ?? input?.notes ?? ''),
        };
      }));
    }).catch(() => setDfsValuationRows([]));
  }, [activeTab, dfsValSeasonId, players]);

  const runAction = async (action: string, payload?: any) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/dashboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body?.rowErrors) setCsvRowErrors(body.rowErrors);
        throw new Error(body?.error ?? 'Operation failed');
      }
      setSuccess('Saved successfully.');
      return body;
    } catch (e: any) {
      setError(e?.message ?? 'Operation failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveAndReload = async (action: string, payload?: any, onSuccess?: () => void) => {
    const result = await runAction(action, payload);
    if (!result) return;
    if (onSuccess) onSuccess();
    await load();
  };

  const openScoreEditor = (game: Game) => {
    setScoreGameId(game.id);
    setHomeScore(String(game.home_score ?? 0));
    setAwayScore(String(game.away_score ?? 0));
    const next: Record<string, { games_played: string; goals: string; assists: string; goals_against: string }> = {};
    players.filter((p) => p.team_id === game.home_team || p.team_id === game.away_team).forEach((p) => {
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
      setCsvMapping({ season_name: '', team_name: '', name: '', jersey_number: '', position: '', user_id: '' });
    } else {
      setCsvMapping({ season_name: '', home_team_name: '', away_team_name: '', scheduled_at: '', location: '', status: '' });
    }
  };

  if (loading) return <main><h1>League Operations Dashboard</h1><p>Loading...</p></main>;
  const canAdmin = role === 'ADMIN' || testMode;

  return (
    <main>
      <h1>League Operations Dashboard</h1>
      <p className="muted">Role: {role}{testMode ? ' (test mode active)' : ''}</p>

      <div className="form-grid" style={{ marginBottom: 10 }}>
        <div className="form-field col-6">
          <label htmlFor="season-filter">Season Filter</label>
          <select id="season-filter" value={seasonFilter} onChange={(e) => { setSeasonFilter(e.target.value); setTeamFilter('all'); }}>
            <option value="all">All Seasons</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {TABS.map((tab) => (
          <button key={tab.key} className={`tab-link ${activeTab === tab.key ? 'is-active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p>{error}</p>}
      {success && <p>{success}</p>}

      {activeTab === 'dashboard' && (
        <section className="card">
          <h2 className="section-title">Dashboard</h2>
          <p className="muted">Seasons {seasons.length} · Teams {seasonTeams.length} · Players {seasonPlayers.length} · Registrations {filteredRegistrations.length} · Games {filteredGames.length} · Trades {filteredTrades.length}</p>
        </section>
      )}

      {activeTab === 'seasons' && (
        <section className="card">
          <h2 className="section-title">Seasons</h2>
          <p className="muted"><strong>Season start/end:</strong> official season boundaries. <strong>Registration open/close:</strong> when signups are allowed.</p>
          <div className="form-grid">
            <div className="form-field col-6"><label>Name</label><input value={seasonForm.name} onChange={(e) => setSeasonForm((s) => ({ ...s, name: e.target.value }))} /></div>
            <div className="form-field col-6"><label>Season Start Date</label><input type="date" value={seasonForm.start_date} onChange={(e) => setSeasonForm((s) => ({ ...s, start_date: e.target.value }))} /></div>
            <div className="form-field col-6"><label>Season End Date</label><input type="date" value={seasonForm.end_date} onChange={(e) => setSeasonForm((s) => ({ ...s, end_date: e.target.value }))} /></div>
            <div className="form-field col-6"><label>Registration Opens At</label><input type="datetime-local" value={seasonForm.registration_open_at} onChange={(e) => setSeasonForm((s) => ({ ...s, registration_open_at: e.target.value }))} /></div>
            <div className="form-field col-6"><label>Registration Closes At</label><input type="datetime-local" value={seasonForm.registration_close_at} onChange={(e) => setSeasonForm((s) => ({ ...s, registration_close_at: e.target.value }))} /></div>
            <div className="form-field col-12"><label>Waiver Text</label><textarea value={seasonForm.waiver_text} onChange={(e) => setSeasonForm((s) => ({ ...s, waiver_text: e.target.value }))} /></div>
            <div className="form-field col-12"><label>Rules</label><textarea value={seasonForm.rules} onChange={(e) => setSeasonForm((s) => ({ ...s, rules: e.target.value }))} /></div>
            <div className="form-actions"><button disabled={!canAdmin || busy} onClick={() => saveAndReload(seasonForm.id ? 'season_update' : 'season_create', { ...seasonForm, registration_open_at: fromLeagueDateTimeInput(seasonForm.registration_open_at), registration_close_at: fromLeagueDateTimeInput(seasonForm.registration_close_at) })}>{seasonForm.id ? 'Update Season' : 'Create Season'}</button></div>
          </div>
          <table className="table"><thead><tr><th>Name</th><th>Dates</th><th>Registration Window</th><th>Actions</th></tr></thead><tbody>{seasons.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.start_date} → {s.end_date}</td><td>{s.registration_open_at ?? '-'} → {s.registration_close_at ?? '-'}</td><td><button onClick={() => setSeasonForm({ id: s.id, name: s.name, start_date: String(s.start_date).slice(0, 10), end_date: String(s.end_date).slice(0, 10), registration_open_at: toLeagueDateTimeInput(s.registration_open_at), registration_close_at: toLeagueDateTimeInput(s.registration_close_at), waiver_text: s.waiver_text ?? '', rules: s.rules ?? '' })}>Edit</button> <button disabled={!canAdmin} onClick={() => confirm('Delete season?') && saveAndReload('season_delete', { id: s.id })}>Delete</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'teams' && (
        <section className="card">
          <h2 className="section-title">Teams</h2>
          <div className="form-grid">
            <div className="form-field col-6"><label>Season</label><select value={teamForm.season_id} onChange={(e) => setTeamForm((t) => ({ ...t, season_id: e.target.value }))}><option value="">Select season</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="form-field col-6"><label>Team Name</label><input value={teamForm.name} onChange={(e) => setTeamForm((t) => ({ ...t, name: e.target.value }))} /></div>
            <div className="form-field col-6"><label>Captain</label><select value={teamForm.captain_user_id} onChange={(e) => setTeamForm((t) => ({ ...t, captain_user_id: e.target.value }))}><option value="">Select captain</option>{profiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></div>
            <div className="form-field col-6"><label>Logo URL</label><input value={teamForm.logo_url} onChange={(e) => setTeamForm((t) => ({ ...t, logo_url: e.target.value }))} /></div>
            <div className="form-actions"><button disabled={!canAdmin || busy} onClick={() => saveAndReload(teamForm.id ? 'team_update' : 'team_create', { ...teamForm, captain_user_id: teamForm.captain_user_id || null, logo_url: teamForm.logo_url || null })}>{teamForm.id ? 'Update Team' : 'Create Team'}</button></div>
          </div>
          <table className="table"><thead><tr><th>Team</th><th>Season</th><th>Captain</th><th>Actions</th></tr></thead><tbody>{seasonTeams.map((t) => <tr key={t.id}><td>{t.name}</td><td>{seasons.find((s) => s.id === t.season_id)?.name}</td><td>{t.captain_user_id ? profileNameById.get(t.captain_user_id) ?? t.captain_user_id : '-'}</td><td><button onClick={() => setTeamForm({ id: t.id, season_id: t.season_id, name: t.name, captain_user_id: t.captain_user_id ?? '', logo_url: t.logo_url ?? '' })}>Edit</button> <button disabled={!canAdmin} onClick={() => confirm('Delete team?') && saveAndReload('team_delete', { id: t.id })}>Delete</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'players' && (
        <section className="card">
          <h2 className="section-title">Players</h2>
          <div className="form-grid" style={{ marginBottom: 8 }}>
            <div className="form-field col-6">
              <label>Team filter</label>
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                <option value="all">All Teams</option>
                <option value="unassigned">Unassigned</option>
                {seasonTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-actions"><button onClick={() => setCsvModal('players')}>Import Players CSV</button></div>
          </div>
          <div className="form-grid">
            <div className="form-field col-6"><label>Season</label><select value={playerForm.season_id} onChange={(e) => setPlayerForm((p) => ({ ...p, season_id: e.target.value }))}><option value="">Select season</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="form-field col-6"><label>Team</label><select value={playerForm.team_id} onChange={(e) => setPlayerForm((p) => ({ ...p, team_id: e.target.value }))}><option value="">Unassigned / Free Agent</option>{teams.filter((t) => !playerForm.season_id || t.season_id === playerForm.season_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="form-field col-6"><label>Official Name</label><input value={playerForm.name} onChange={(e) => setPlayerForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="form-field col-4"><label>Jersey Number</label><input value={playerForm.jersey} onChange={(e) => setPlayerForm((p) => ({ ...p, jersey: e.target.value }))} /></div>
            <div className="form-field col-4"><label>Position</label><input value={playerForm.position} onChange={(e) => setPlayerForm((p) => ({ ...p, position: e.target.value }))} /></div>
            <div className="form-field col-6"><label>Linked User (optional)</label><select value={playerForm.user_id} onChange={(e) => setPlayerForm((p) => ({ ...p, user_id: e.target.value }))}><option value="">Select user</option>{profiles.map((pr) => <option key={pr.user_id} value={pr.user_id}>{profileNameById.get(pr.user_id)}</option>)}</select></div>
            <div className="form-actions"><button disabled={!canAdmin || busy} onClick={() => saveAndReload(playerForm.id ? 'player_update' : 'player_create', { ...playerForm, season_id: playerForm.season_id || null, team_id: playerForm.team_id || null, user_id: playerForm.user_id || null, jersey: playerForm.jersey ? Number(playerForm.jersey) : null, position: playerForm.position || null })}>{playerForm.id ? 'Update Player' : 'Create Player'}</button></div>
          </div>
          <table className="table"><thead><tr><th>Name</th><th>Team</th><th>Position</th><th>Jersey</th><th>Actions</th></tr></thead><tbody>{seasonPlayers.map((p) => <tr key={p.id}><td>{p.name}</td><td>{teamNameById.get(p.team_id ?? '') ?? '-'}</td><td>{p.position ?? '-'}</td><td>{p.jersey ?? '-'}</td><td><button onClick={() => setPlayerForm({ id: p.id, season_id: p.season_id ?? (seasonFilter === 'all' ? '' : seasonFilter), team_id: p.team_id ?? '', user_id: p.user_id ?? '', name: p.name, jersey: p.jersey?.toString() ?? '', position: p.position ?? '' })}>Edit</button> <button disabled={!canAdmin} onClick={() => confirm('Delete player?') && saveAndReload('player_delete', { id: p.id })}>Delete</button></td></tr>)}</tbody></table>
          <p className="muted">Unassigned players in current filter: {unassignedSeasonPlayers.length}</p>
        </section>
      )}

      {activeTab === 'registrations' && (
        <section className="card">
          <h2 className="section-title">Legacy Registrations</h2>
          <p className="muted">Season participation now lives in Players. Use this tab only for legacy records.</p>
          <table className="table"><thead><tr><th>User</th><th>Season</th><th>Preferred Positions</th><th>Experience</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredRegistrations.map((r) => <tr key={r.id}><td>{profileNameById.get(r.user_id) ?? r.user_id}</td><td>{seasons.find((s) => s.id === r.season_id)?.name}</td><td>{(r.preferred_positions ?? []).join(', ')}</td><td>{r.experience ?? '-'}</td><td>{r.status}</td><td><button disabled={!canAdmin} onClick={() => saveAndReload('registrations_set_status', { id: r.id, status: 'approved' })}>Approve</button> <button disabled={!canAdmin} onClick={() => saveAndReload('registrations_set_status', { id: r.id, status: 'rejected' })}>Reject</button> <button disabled={!canAdmin} onClick={() => { setAssignRegId(r.id); setAssignForm({ team_id: '', name: profileNameById.get(r.user_id) ?? '', jersey: '', position: '' }); }}>Assign to Team</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'games' && (
        <section className="card">
          <h2 className="section-title">Games & Schedule</h2>
          <button onClick={() => setCsvModal('games')}>Import Games CSV</button>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="form-field col-6"><label>Season</label><select value={gameForm.season_id} onChange={(e) => setGameForm((g) => ({ ...g, season_id: e.target.value }))}><option value="">Select season</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="form-field col-6"><label>Home Team</label><select value={gameForm.home_team} onChange={(e) => setGameForm((g) => ({ ...g, home_team: e.target.value }))}><option value="">Select home team</option>{teams.filter((t) => !gameForm.season_id || t.season_id === gameForm.season_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="form-field col-6"><label>Away Team</label><select value={gameForm.away_team} onChange={(e) => setGameForm((g) => ({ ...g, away_team: e.target.value }))}><option value="">Select away team</option>{teams.filter((t) => !gameForm.season_id || t.season_id === gameForm.season_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="form-field col-6"><label>Scheduled At</label><input type="datetime-local" value={gameForm.scheduled_at} onChange={(e) => setGameForm((g) => ({ ...g, scheduled_at: e.target.value }))} /></div>
            <div className="form-field col-6"><label>Location</label><input value={gameForm.location} onChange={(e) => setGameForm((g) => ({ ...g, location: e.target.value }))} /></div>
            <div className="form-field col-6"><label>Status</label><select value={gameForm.status} onChange={(e) => setGameForm((g) => ({ ...g, status: e.target.value }))}><option>SCHEDULED</option><option>LIVE</option><option>FINAL</option><option>CANCELED</option></select></div>
            <div className="form-actions"><button disabled={!canAdmin || busy} onClick={() => saveAndReload(gameForm.id ? 'game_update' : 'game_create', { ...gameForm, scheduled_at: fromLeagueDateTimeInput(gameForm.scheduled_at), location: gameForm.location || null })}>{gameForm.id ? 'Update Game' : 'Create Game'}</button></div>
          </div>
          <table className="table"><thead><tr><th>Date</th><th>Matchup</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredGames.map((g) => <tr key={g.id}><td>{formatPublicDateTime(g.scheduled_at)}</td><td>{teamNameById.get(g.home_team)} vs {teamNameById.get(g.away_team)}</td><td>{g.status === 'FINAL' ? 'Completed' : g.status}</td><td><button onClick={() => setGameForm({ id: g.id, season_id: g.season_id, home_team: g.home_team, away_team: g.away_team, scheduled_at: toLeagueDateTimeInput(g.scheduled_at), location: g.location ?? '', status: g.status })}>Edit</button> <button disabled={!canAdmin} onClick={() => confirm('Delete game?') && saveAndReload('game_delete', { id: g.id })}>Delete</button> <button onClick={() => openScoreEditor(g)}>Scores</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'scores' && (
        <section className="card">
          <h2 className="section-title">Scores</h2>
          <p className="muted">Select a game to update score and player stats.</p>
          <table className="table"><thead><tr><th>Date</th><th>Matchup</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredGames.map((g) => <tr key={g.id}><td>{formatPublicDateTime(g.scheduled_at)}</td><td>{teamNameById.get(g.home_team)} vs {teamNameById.get(g.away_team)}</td><td>{g.status === 'FINAL' ? 'Completed' : g.status}</td><td><button onClick={() => openScoreEditor(g)}>Update Score</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'trades' && (
        <section className="card">
          <h2 className="section-title">Trades (Approval Queue)</h2>
          <p className="muted">Trade proposals are created on the Trades screen by captains. Admin reviews here.</p>
          <table className="table"><thead><tr><th>Season</th><th>Team A → Team B</th><th>Team B → Team A</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredTrades.map((t) => <tr key={t.id}><td>{seasons.find((s) => s.id === t.season_id)?.name}</td><td>{(t.players_out ?? []).map((id) => players.find((p) => p.id === id)?.name ?? id).join(', ')}</td><td>{(t.players_in ?? []).map((id) => players.find((p) => p.id === id)?.name ?? id).join(', ')}</td><td>{t.status}</td><td><button disabled={!canAdmin} onClick={() => saveAndReload('trade_approve', { tradeId: t.id })}>Approve</button> <button disabled={!canAdmin} onClick={() => saveAndReload('trade_reject', { tradeId: t.id })}>Reject</button></td></tr>)}</tbody></table>
        </section>
      )}

      {activeTab === 'dfs' && (
        <section className="card">
          <h2 className="section-title">DFS Admin Controls</h2>
          <p className="muted">Manage default slate generation and custom slate/contest setup from admin only.</p>
          <div className="form-actions">
            <button disabled={busy} onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await fetch('/api/dfs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'auto_generate_default_next_slate_day', payload: {} }) });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Failed to generate default slate');
                const mode = json?.repriced ? 'repriced' : 'generated';
                const rebuilt = json?.rebuiltCount != null ? ` · ${json.rebuiltCount} players` : '';
                setSuccess(`Default slate ${mode}: ${json.slateId}${rebuilt}`);
                const refreshed = await fetch('/api/dfs').then((r) => r.json());
                setDfsSlates(refreshed?.slates ?? []);
                if (json?.slateId) {
                  setDfsAvailabilitySlateId(json.slateId);
                  await refreshDfsSlatePlayers(json.slateId);
                }
              } catch (e: any) {
                setError(e?.message || 'Failed to generate default slate');
              } finally {
                setBusy(false);
              }
            }}>Generate / Reprice Next Default Slate</button>
            <button disabled={busy || !dfsAvailabilitySlateId} onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await fetch('/api/dfs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'rebuild_slate_players', payload: { slate_id: dfsAvailabilitySlateId } }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Failed to rebuild slate players');
                setSuccess(`Slate repriced (${json.rebuiltCount ?? 0} players rebuilt).`);
                await refreshDfsSlatePlayers(dfsAvailabilitySlateId);
              } catch (e: any) {
                setError(e?.message || 'Failed to rebuild slate players');
              } finally {
                setBusy(false);
              }
            }}>Rebuild/Reprice Selected Slate Players</button>
          </div>

          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="form-field col-3"><label>Season</label><select value={dfsSlateSeasonId} onChange={(e) => setDfsSlateSeasonId(e.target.value)}><option value="">Select season...</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="form-field col-3"><label>Slate Name</label><input value={dfsSlateName} onChange={(e) => setDfsSlateName(e.target.value)} /></div>
            <div className="form-field col-3"><label>Slate Lock</label><input type="datetime-local" value={dfsSlateLock} onChange={(e) => setDfsSlateLock(e.target.value)} /></div>
            <div className="form-actions"><button disabled={busy || !dfsSlateSeasonId} onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await fetch('/api/dfs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_slate', payload: { season_id: dfsSlateSeasonId, name: dfsSlateName, lock_at: fromLeagueDateTimeInput(dfsSlateLock), game_ids: [], status: 'draft' } }) });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Failed to create slate');
                setSuccess('Custom slate created.');
                setDfsContestSlateId(json?.slate?.id || '');
              } catch (e: any) {
                setError(e?.message || 'Failed to create slate');
              } finally {
                setBusy(false);
              }
            }}>Create Custom Slate</button></div>
          </div>

          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="form-field col-3"><label>Slate</label><select value={dfsContestSlateId} onChange={(e) => setDfsContestSlateId(e.target.value)}><option value="">Select slate...</option>{dfsSlates.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.status}</option>)}</select></div>
            <div className="form-field col-3"><label>Contest Name</label><input value={dfsContestName} onChange={(e) => setDfsContestName(e.target.value)} /></div>
            <div className="form-field col-3"><label>Contest Lock</label><input type="datetime-local" value={dfsContestLock} onChange={(e) => setDfsContestLock(e.target.value)} /></div>
            <div className="form-field col-3"><label>Salary Cap</label><input value={dfsContestCap} onChange={(e) => setDfsContestCap(e.target.value)} /></div>
            <div className="form-field col-3"><label>Max Entries</label><input value={dfsContestMaxEntries} onChange={(e) => setDfsContestMaxEntries(e.target.value)} /></div>
            <div className="form-actions"><button disabled={busy || !dfsContestSlateId} onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await fetch('/api/dfs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_contest', payload: { slate_id: dfsContestSlateId, name: dfsContestName, lock_at: fromLeagueDateTimeInput(dfsContestLock), salary_cap: Number(dfsContestCap), max_entries: Number(dfsContestMaxEntries), status: 'open' } }) });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Failed to create contest');
                setSuccess('Custom contest created.');
              } catch (e: any) {
                setError(e?.message || 'Failed to create contest');
              } finally {
                setBusy(false);
              }
            }}>Create Contest</button></div>
          </div>

          <h3 style={{ marginTop: 14 }}>Slate Player Availability</h3>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="form-field col-6"><label>Slate</label><select value={dfsAvailabilitySlateId} onChange={(e) => setDfsAvailabilitySlateId(e.target.value)}><option value="">Select slate...</option>{dfsSlates.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.status}</option>)}</select></div>
          </div>
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>Grade</th><th>Source</th><th>Hist Match</th><th>Salary</th><th>Projection</th><th>Current In</th><th>Hist In</th><th>Lg Avg In</th><th>Availability</th></tr></thead>
            <tbody>
              {dfsSlatePlayers.map((p) => (
                <tr key={p.id}>
                  <td>{p.player?.name ?? p.player_id}</td>
                  <td>{p.player?.team_name ?? '-'}</td>
                  <td>{p.player?.position ?? '-'}</td>
                  <td>{p.valuation_grade ?? '-'}</td>
                  <td>{p.valuation_source ?? '-'}</td>
                  <td>{p.historical_match_name ? `${p.historical_match_name} (${p.historical_match_confidence ?? 'n/a'})` : '-'}</td>
                  <td>{p.salary}</td>
                  <td>{Number(p.projection_points ?? 0).toFixed(2)}</td>
                  <td>{p.current_projection_input != null ? Number(p.current_projection_input).toFixed(2) : '-'}</td>
                  <td>{p.historical_projection_input != null ? Number(p.historical_projection_input).toFixed(2) : '-'}</td>
                  <td>{p.league_average_projection_input != null ? Number(p.league_average_projection_input).toFixed(2) : '-'}</td>
                  <td>
                    <select value={(p.availability_status ?? 'AVAILABLE').toUpperCase()} onChange={async (e) => {
                      const status = e.target.value;
                      await fetch('/api/dfs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update_slate_player_availability', payload: { slate_player_id: p.id, availability_status: status } }),
                      });
                      await refreshDfsSlatePlayers(dfsAvailabilitySlateId);
                    }}>
                      <option value="AVAILABLE">Available</option>
                      <option value="QUESTIONABLE">Questionable</option>
                      <option value="OUT">Out</option>
                    </select>
                  </td>
                </tr>
              ))}
              {!dfsSlatePlayers.length && <tr><td colSpan={12} className="muted">Select a slate to manage player availability.</td></tr>}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Player Valuation Controls</h3>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="form-field col-6"><label>Season</label><select value={dfsValSeasonId} onChange={(e) => setDfsValSeasonId(e.target.value)}><option value="">Select season...</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>Player</th><th>Pos</th><th>Grade</th><th>Min Games</th><th>Manual Proj</th><th>Manual Salary</th><th>Notes</th><th>Save</th></tr></thead>
            <tbody>
              {dfsValuationRows.map((row) => (
                <tr key={row.player_id}>
                  <td>{row.player_name}</td>
                  <td>{row.position}</td>
                  <td><select value={row.grade} onChange={(e) => setDfsValuationRows((prev) => prev.map((r) => r.player_id === row.player_id ? { ...r, grade: e.target.value } : r))}><option>A</option><option>B</option><option>C</option><option>D</option><option>F</option></select></td>
                  <td><input value={row.min_sample_games} onChange={(e) => setDfsValuationRows((prev) => prev.map((r) => r.player_id === row.player_id ? { ...r, min_sample_games: e.target.value } : r))} /></td>
                  <td><input value={row.manual_projection} onChange={(e) => setDfsValuationRows((prev) => prev.map((r) => r.player_id === row.player_id ? { ...r, manual_projection: e.target.value } : r))} /></td>
                  <td><input value={row.manual_salary} onChange={(e) => setDfsValuationRows((prev) => prev.map((r) => r.player_id === row.player_id ? { ...r, manual_salary: e.target.value } : r))} /></td>
                  <td><input value={row.notes} onChange={(e) => setDfsValuationRows((prev) => prev.map((r) => r.player_id === row.player_id ? { ...r, notes: e.target.value } : r))} /></td>
                  <td><button type="button" onClick={async () => {
                    await fetch('/api/dfs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upsert_player_valuation_input', payload: { season_id: dfsValSeasonId, player_id: row.player_id, player_grade: row.grade, min_sample_games: Number(row.min_sample_games || 2), notes: row.notes || null } }) });
                    await fetch('/api/dfs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upsert_player_projection_override', payload: { season_id: dfsValSeasonId, player_id: row.player_id, projection_points: row.manual_projection || null, salary_override: row.manual_salary || null, notes: row.notes || null } }) });
                    setSuccess(`Saved valuation controls for ${row.player_name}.`);
                  }}>Save</button></td>
                </tr>
              ))}
              {!dfsValuationRows.length && <tr><td colSpan={8} className="muted">Select a season to edit player grades and valuation overrides.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {assignRegId && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <h2 className="section-title">Assign Registration to Team</h2>
            <div className="form-grid">
              <div className="form-field col-6"><label>Team</label><select value={assignForm.team_id} onChange={(e) => setAssignForm((a) => ({ ...a, team_id: e.target.value }))}><option value="">Select team</option>{seasonTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div className="form-field col-6"><label>Player Name</label><input value={assignForm.name} onChange={(e) => setAssignForm((a) => ({ ...a, name: e.target.value }))} /></div>
              <div className="form-field col-4"><label>Jersey</label><input value={assignForm.jersey} onChange={(e) => setAssignForm((a) => ({ ...a, jersey: e.target.value }))} /></div>
              <div className="form-field col-4"><label>Position</label><input value={assignForm.position} onChange={(e) => setAssignForm((a) => ({ ...a, position: e.target.value }))} /></div>
                          </div>
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button onClick={() => saveAndReload('registration_assign_player', { registrationId: assignRegId, ...assignForm }, () => setAssignRegId(null))}>Assign</button>
              <button onClick={() => setAssignRegId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scoreGame && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 1150 }}>
            <h2 className="section-title">Score Entry: {teamNameById.get(scoreGame.home_team)} vs {teamNameById.get(scoreGame.away_team)}</h2>
            <div className="form-grid">
              <div className="form-field col-6"><label>Home Score ({teamNameById.get(scoreGame.home_team)})</label><input type="number" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} /></div>
              <div className="form-field col-6"><label>Away Score ({teamNameById.get(scoreGame.away_team)})</label><input type="number" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} /></div>
            </div>

            <h3>{teamNameById.get(scoreGame.home_team)}</h3>
            <table className="table"><thead><tr><th>Player</th><th>Position</th><th>GP</th><th>G</th><th>A</th><th>GA</th></tr></thead><tbody>{homePlayers.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.position ?? '-'}</td><td><input value={statsRows[p.id]?.games_played ?? ''} onChange={(e) => setStatsRows((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? { games_played: '', goals: '', assists: '', goals_against: '' }), games_played: e.target.value } }))} /></td><td><input value={statsRows[p.id]?.goals ?? ''} onChange={(e) => setStatsRows((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? { games_played: '', goals: '', assists: '', goals_against: '' }), goals: e.target.value } }))} /></td><td><input value={statsRows[p.id]?.assists ?? ''} onChange={(e) => setStatsRows((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? { games_played: '', goals: '', assists: '', goals_against: '' }), assists: e.target.value } }))} /></td><td><input value={statsRows[p.id]?.goals_against ?? ''} onChange={(e) => setStatsRows((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? { games_played: '', goals: '', assists: '', goals_against: '' }), goals_against: e.target.value } }))} /></td></tr>)}</tbody></table>
            <h3>{teamNameById.get(scoreGame.away_team)}</h3>
            <table className="table"><thead><tr><th>Player</th><th>Position</th><th>GP</th><th>G</th><th>A</th><th>GA</th></tr></thead><tbody>{awayPlayers.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.position ?? '-'}</td><td><input value={statsRows[p.id]?.games_played ?? ''} onChange={(e) => setStatsRows((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? { games_played: '', goals: '', assists: '', goals_against: '' }), games_played: e.target.value } }))} /></td><td><input value={statsRows[p.id]?.goals ?? ''} onChange={(e) => setStatsRows((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? { games_played: '', goals: '', assists: '', goals_against: '' }), goals: e.target.value } }))} /></td><td><input value={statsRows[p.id]?.assists ?? ''} onChange={(e) => setStatsRows((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? { games_played: '', goals: '', assists: '', goals_against: '' }), assists: e.target.value } }))} /></td><td><input value={statsRows[p.id]?.goals_against ?? ''} onChange={(e) => setStatsRows((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? { games_played: '', goals: '', assists: '', goals_against: '' }), goals_against: e.target.value } }))} /></td></tr>)}</tbody></table>

            <div className="form-actions">
              <button onClick={() => saveAndReload('game_score_submit', { gameId: scoreGame.id, homeScore: Number(homeScore || 0), awayScore: Number(awayScore || 0), stats: Object.entries(statsRows).map(([player_id, row]) => ({ player_id, team_id: players.find((p) => p.id === player_id)?.team_id, position: players.find((p) => p.id === player_id)?.position, ...row })) }, () => { setScoreGameId(null); setSuccess('Score saved. Game marked as Completed.'); })}>Save Score + Stats</button>
              <button onClick={() => setScoreGameId(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {csvModal && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <h2 className="section-title">Import {csvModal === 'players' ? 'Players' : 'Games'} CSV</h2>
            <input type="file" accept=".csv" onChange={(e) => onCsvFile(e.target.files?.[0] ?? null)} />
            <div className="form-grid" style={{ marginTop: 10 }}>
              {Object.keys(csvMapping).map((target) => (
                <div key={target} className="form-field col-6">
                  <label>{target}</label>
                  <select value={csvMapping[target] || ''} onChange={(e) => setCsvMapping((m) => ({ ...m, [target]: e.target.value }))}>
                    <option value="">-- CSV column --</option>
                    {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {csvRowErrors.length > 0 && <div className="card" style={{ marginTop: 8 }}>{csvRowErrors.map((err, i) => <p key={i}>{err}</p>)}</div>}
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button onClick={async () => {
                const mappedRows = csvRows.map((row) => {
                  const out: any = {};
                  Object.entries(csvMapping).forEach(([k, v]) => {
                    const idx = csvHeaders.findIndex((h) => h === v);
                    out[k] = idx >= 0 ? row[idx] : '';
                  });
                  return out;
                });
                const result = await runAction(csvModal === 'players' ? 'import_players_csv' : 'import_games_csv', { rows: mappedRows });
                if (result) {
                  setCsvModal(null);
                  setCsvRows([]);
                  setCsvHeaders([]);
                  setCsvRowErrors([]);
                  setSuccess(`${csvModal === 'players' ? 'Players' : 'Games'} import completed successfully.`);
                  await load();
                }
              }}>Import</button>
              <button onClick={() => setCsvModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
