'use client';

import { useEffect, useMemo, useState } from 'react';
import FantasyPlayerModal from './FantasyPlayerModal';

const SLOT_CONFIG = ['CAPTAIN', 'SKATER_1', 'SKATER_2', 'SKATER_3', 'SKATER_4', 'GOALIE'];

export default function DfsClient() {
  const [data, setData] = useState<any>({ slates: [], contests: [], slatePlayers: [], slateGames: [], recommendedSlateId: null, myEntries: [], actor: { role: 'FAN' } });
  const [selectedSlate, setSelectedSlate] = useState('');
  const [selectedContest, setSelectedContest] = useState('');
  const [lineupName, setLineupName] = useState('My Entry');
  const [slots, setSlots] = useState<any[]>(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
  const [msg, setMsg] = useState('');
  const [seasonIdForCreate, setSeasonIdForCreate] = useState('');
  const [newSlateName, setNewSlateName] = useState('Weekly Slate');
  const [newSlateLock, setNewSlateLock] = useState('');
  const [newContestName, setNewContestName] = useState('Main Contest');
  const [newContestLock, setNewContestLock] = useState('');
  const [newContestCap, setNewContestCap] = useState('50000');
  const [newContestMaxEntries, setNewContestMaxEntries] = useState('5');
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerModalLoading, setPlayerModalLoading] = useState(false);
  const [playerModalData, setPlayerModalData] = useState<any>(null);
  const [selectedPlayerContext, setSelectedPlayerContext] = useState<{ salary?: number; projection?: number }>({});

  async function load(slateId?: string) {
    const res = await fetch(`/api/dfs${slateId ? `?slate_id=${slateId}` : ''}`);
    const json = await res.json();
    setData(json);

    if (!selectedSlate && json?.recommendedSlateId) {
      setSelectedSlate(json.recommendedSlateId);
    }

    if (!selectedContest && json?.contests?.length) {
      const recommendedContest = json.contests.find((c: any) => c.slate_id === (slateId || json.recommendedSlateId) && ['open', 'live'].includes(String(c.status || '').toLowerCase()))
        || json.contests.find((c: any) => c.slate_id === (slateId || json.recommendedSlateId))
        || json.contests[0];
      if (recommendedContest) setSelectedContest(recommendedContest.id);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedSlate) load(selectedSlate); }, [selectedSlate]);

  const currentContest = data.contests.find((c: any) => c.id === selectedContest);
  const salaryUsed = useMemo(() => slots.reduce((sum, s) => {
    const sp = data.slatePlayers.find((p: any) => p.player_id === s.player_id);
    const mult = s.slot === 'CAPTAIN' ? 1.5 : 1;
    return sum + ((sp?.salary || 0) * mult);
  }, 0), [slots, data.slatePlayers]);
  const projectedTotal = useMemo(() => slots.reduce((sum, s) => {
    const sp = data.slatePlayers.find((p: any) => p.player_id === s.player_id);
    const mult = s.slot === 'CAPTAIN' ? 1.5 : 1;
    return sum + (Number(sp?.projection_points || 0) * mult);
  }, 0), [slots, data.slatePlayers]);

  const salaryRemaining = Number(currentContest?.salary_cap ?? 0) - salaryUsed;

  async function post(action: string, payload: any) {
    const res = await fetch('/api/dfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  }

  async function submit() {
    try {
      setMsg('');
      const json = await post('submit_entry', {
        contest_id: selectedContest,
        lineup_name: lineupName,
        slots,
      });
      setMsg(`Entry submitted: ${json.entryId}`);
      setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
      await load(selectedSlate || undefined);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function createSlate() {
    try {
      setMsg('');
      const json = await post('create_slate', {
        season_id: seasonIdForCreate,
        name: newSlateName,
        lock_at: newSlateLock,
        game_ids: [],
        status: 'draft',
      });
      setSelectedSlate(json.slate.id);
      setMsg('Slate created with snapshotted pricing/projections.');
      await load(json.slate.id);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function createContest() {
    try {
      setMsg('');
      await post('create_contest', {
        slate_id: selectedSlate,
        name: newContestName,
        lock_at: newContestLock,
        salary_cap: Number(newContestCap),
        max_entries: Number(newContestMaxEntries),
        status: 'open',
      });
      setMsg('Contest created.');
      await load(selectedSlate || undefined);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function generateWeeklyDefault() {
    try {
      const json = await post('auto_generate_default_next_slate_day', {});
      setSelectedSlate(json.slateId);
      setMsg(`Default next slate day is ready (${json.gameCount ?? 0} games).`);
      await load(json.slateId);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function scoreContest() {
    if (!selectedContest) return;
    try {
      const json = await post('score_contest', { contest_id: selectedContest });
      setMsg(`Contest scored. ${json.scoredEntries} entries updated.`);
      await load(selectedSlate || undefined);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function openPlayerResearch(player: any) {
    try {
      setPlayerModalOpen(true);
      setPlayerModalLoading(true);
      setSelectedPlayerContext({ salary: player.salary, projection: player.projection_points });
      const res = await fetch(`/api/dfs?player_id=${player.player_id}${selectedSlate ? `&season_id=${encodeURIComponent((data.slates.find((s: any) => s.id === selectedSlate)?.season_id) || '')}` : ''}`);
      const json = await res.json();
      setPlayerModalData(json);
    } finally {
      setPlayerModalLoading(false);
    }
  }

  const isAdmin = data.actor?.role === 'ADMIN';

  return (
    <main>
      <h1>DFS</h1>
      <p className="muted">Lineup format: 1 Captain, 4 Skaters, 1 Goalie. Captain uses 1.5x salary and 1.5x scoring.</p>
      {msg && <p>{msg}</p>}

      {isAdmin && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Admin DFS Controls</h2>
          <div className="form-actions" style={{ marginTop: 0 }}>
            <button onClick={generateWeeklyDefault}>Auto-Generate Upcoming Weekly Default Slate + Contest</button>
            <button onClick={scoreContest} disabled={!selectedContest}>Score Selected Contest</button>
          </div>

          <div className="form-grid">
            <div className="form-field col-4"><label>Season ID</label><input value={seasonIdForCreate} onChange={(e) => setSeasonIdForCreate(e.target.value)} placeholder="season uuid" /></div>
            <div className="form-field col-4"><label>Slate Name</label><input value={newSlateName} onChange={(e) => setNewSlateName(e.target.value)} /></div>
            <div className="form-field col-4"><label>Slate Lock</label><input type="datetime-local" value={newSlateLock} onChange={(e) => setNewSlateLock(e.target.value)} /></div>
            <div className="form-actions"><button onClick={createSlate}>Create Custom Slate</button></div>
          </div>

          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="form-field col-6"><label>Contest Name</label><input value={newContestName} onChange={(e) => setNewContestName(e.target.value)} /></div>
            <div className="form-field col-6"><label>Contest Lock</label><input type="datetime-local" value={newContestLock} onChange={(e) => setNewContestLock(e.target.value)} /></div>
            <div className="form-field col-6"><label>Salary Cap</label><input value={newContestCap} onChange={(e) => setNewContestCap(e.target.value)} /></div>
            <div className="form-field col-6"><label>Max Entries / User</label><input value={newContestMaxEntries} onChange={(e) => setNewContestMaxEntries(e.target.value)} /></div>
            <div className="form-actions"><button onClick={createContest} disabled={!selectedSlate}>Create Custom Contest</button></div>
          </div>
        </section>
      )}

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Slates & Contests</h2>
        <div className="form-grid">
          <div className="form-field col-6">
            <label>Active Slates</label>
            <select value={selectedSlate} onChange={(e) => setSelectedSlate(e.target.value)}>
              <option value="">Select slate...</option>
              {data.slates.map((s: any) => <option key={s.id} value={s.id}>{s.name} · {s.status}{s.is_default_weekly ? ' · default' : ''}</option>)}
            </select>
          </div>
          <div className="form-field col-6">
            <label>Contests</label>
            <select value={selectedContest} onChange={(e) => setSelectedContest(e.target.value)}>
              <option value="">Select contest...</option>
              {data.contests.filter((c: any) => !selectedSlate || c.slate_id === selectedSlate).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} · {c.status} · Cap {c.salary_cap}{c.is_default_weekly ? ' · default' : ''}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Current Slate Games</h2>
        <table className="table">
          <thead><tr><th>Time</th><th>Matchup</th><th>Status</th></tr></thead>
          <tbody>
            {(data.slateGames ?? []).map((g: any) => (
              <tr key={g.id}>
                <td>{new Date(g.scheduled_at).toLocaleString()}</td>
                <td>{g.home_team_name} vs {g.away_team_name}</td>
                <td>{g.status}</td>
              </tr>
            ))}
            {!data.slateGames?.length && <tr><td colSpan={3} className="muted">No games attached to this slate yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(340px, 0.9fr)' }}>
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Player Pool</h2>
          <table className="table">
            <thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>Salary</th><th>Proj</th></tr></thead>
            <tbody>
              {data.slatePlayers.map((p: any) => (
                <tr key={p.id}>
                  <td><button type="button" onClick={() => openPlayerResearch(p)}>{p.player?.name || p.player_id.slice(0, 8)}</button></td>
                  <td>{p.player?.team_name || '-'}</td>
                  <td>{p.player?.position || p.position || '-'}</td>
                  <td>${p.salary}</td>
                  <td>{Number(p.projection_points || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Lineup Builder</h2>
          <div className="form-grid">
            <div className="form-field col-12">
              <label>Lineup Name</label>
              <input value={lineupName} onChange={(e) => setLineupName(e.target.value)} />
            </div>
            {slots.map((s, idx) => (
              <div key={s.slot} className="form-field col-6">
                <label>{s.slot === 'CAPTAIN' ? 'Captain (1.5x)' : s.slot}</label>
                <select value={s.player_id} onChange={(e) => setSlots((prev) => prev.map((row, i) => i === idx ? { ...row, player_id: e.target.value } : row))}>
                  <option value="">Select player...</option>
                  {data.slatePlayers
                    .filter((p: any) => {
                      const pos = (p.player?.position || p.position || '').toLowerCase();
                      const isGoalie = pos.includes('goal');
                      if (s.slot === 'GOALIE') return isGoalie;
                      return !isGoalie;
                    })
                    .map((p: any) => <option key={`${s.slot}-${p.player_id}`} value={p.player_id}>{p.player?.name || p.player_id.slice(0, 8)} · {p.player?.position || p.position} · ${p.salary}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="muted">Salary used: {Math.round(salaryUsed)} / {currentContest?.salary_cap ?? '—'} · Remaining: {isNaN(salaryRemaining) ? '—' : Math.round(salaryRemaining)}</p>
          <p className="muted">Projected total: {projectedTotal.toFixed(2)}</p>
          <button type="button" onClick={submit} disabled={!selectedContest}>Submit Entry</button>
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">My Entries</h2>
        <table className="table">
          <thead><tr><th>Lineup</th><th>Contest</th><th>Salary</th><th>Projected</th><th>Actual</th><th>Submitted</th></tr></thead>
          <tbody>
            {(data.myEntries ?? []).map((e: any) => (
              <tr key={e.id}><td>{e.lineup_name || e.id.slice(0, 8)}</td><td>{e.contest_id}</td><td>{e.salary_used}</td><td>{e.projected_points}</td><td>{e.actual_points}</td><td>{new Date(e.created_at).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <FantasyPlayerModal
        open={playerModalOpen}
        onClose={() => setPlayerModalOpen(false)}
        loading={playerModalLoading}
        details={playerModalData}
        salary={selectedPlayerContext.salary}
        projection={selectedPlayerContext.projection}
      />
    </main>
  );
}
