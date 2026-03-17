'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatPublicDateTime } from '../lib/formatters';

type SlotKey = 'CAPTAIN' | 'SKATER_1' | 'SKATER_2' | 'SKATER_3' | 'SKATER_4' | 'GOALIE';
type SortKey = 'name' | 'team' | 'position' | 'salary' | 'past_fppg';

const SLOT_CONFIG: SlotKey[] = ['CAPTAIN', 'SKATER_1', 'SKATER_2', 'SKATER_3', 'SKATER_4', 'GOALIE'];

function slotLabel(slot: SlotKey) {
  if (slot === 'CAPTAIN') return 'Captain';
  if (slot === 'GOALIE') return 'Goalie';
  return slot.replace('_', ' ');
}

export default function DfsClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ contests: [], slates: [], slatePlayers: [], slateGames: [], myEntries: [], leaderboardEntries: [] });
  const [selectedContest, setSelectedContest] = useState('');
  const [selectedSlate, setSelectedSlate] = useState('');

  const [builderOpen, setBuilderOpen] = useState(false);
  const [slotSelectorOpen, setSlotSelectorOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<SlotKey>('CAPTAIN');
  const [slots, setSlots] = useState<any[]>(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<'ALL' | 'SKATERS' | 'GOALIES'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('salary');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [msg, setMsg] = useState('');

  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [selectedGameStats, setSelectedGameStats] = useState<any[]>([]);

  const currentContest = useMemo(() => data.contests.find((c: any) => c.id === selectedContest), [data.contests, selectedContest]);
  const contestLocked = Boolean(currentContest?.lock_at && new Date(currentContest.lock_at).getTime() <= Date.now());

  const pickDefaultContest = (contests: any[]) => {
    const ordered = [...(contests ?? [])].sort((a: any, b: any) => new Date(a.lock_at || 0).getTime() - new Date(b.lock_at || 0).getTime());
    const active = ordered.filter((c: any) => ['open', 'live'].includes(String(c.status || '').toLowerCase()));
    const now = Date.now();
    return active.find((c: any) => new Date(c.lock_at || 0).getTime() > now) || active[0] || ordered[0] || null;
  };

  async function load(opts?: { contestId?: string; slateId?: string }) {
    setLoading(true);
    const contestId = opts?.contestId ?? selectedContest;
    const slateId = opts?.slateId ?? selectedSlate;
    const q = new URLSearchParams();
    if (contestId) q.set('contest_id', contestId);
    if (slateId) q.set('slate_id', slateId);
    const res = await fetch(`/api/dfs${q.toString() ? `?${q.toString()}` : ''}`);
    const json = await res.json();

    const chosen = contestId ? (json.contests ?? []).find((c: any) => c.id === contestId) : pickDefaultContest(json.contests ?? []);
    const nextContestId = chosen?.id ?? '';
    const nextSlateId = chosen?.slate_id ?? json.recommendedSlateId ?? '';

    setData(json);
    if (nextContestId !== selectedContest) setSelectedContest(nextContestId);
    if (nextSlateId !== selectedSlate) setSelectedSlate(nextSlateId);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!selectedContest) return;
    const contest = data.contests.find((c: any) => c.id === selectedContest);
    if (!contest) return;
    load({ contestId: selectedContest, slateId: contest.slate_id });
  }, [selectedContest]);

  const slotByPlayer = useMemo(() => {
    const map = new Map<string, SlotKey>();
    slots.forEach((s) => { if (s.player_id) map.set(s.player_id, s.slot); });
    return map;
  }, [slots]);

  function slotAllowsPlayer(slot: SlotKey, player: any) {
    const pos = String(player.player?.position || player.position || '').toLowerCase();
    const isGoalie = pos.includes('goal');
    return slot === 'GOALIE' ? isGoalie : !isGoalie;
  }

  function getPastFppg(player: any) {
    const current = Number(player.stats?.fantasy_points_avg);
    if (Number.isFinite(current) && current > 0) return current;
    const historical = Number(player.historical_projection_input);
    if (Number.isFinite(historical) && historical > 0) return historical;
    return null;
  }

  const salaryUsed = useMemo(() => slots.reduce((sum, s) => {
    const p = data.slatePlayers.find((r: any) => r.player_id === s.player_id);
    return sum + (p ? Number(p.salary) * (s.slot === 'CAPTAIN' ? 1.5 : 1) : 0);
  }, 0), [slots, data.slatePlayers]);

  const salaryRemaining = Number(currentContest?.salary_cap || 0) - salaryUsed;
  const missingSlots = slots.filter((s) => !s.player_id).map((s) => s.slot as SlotKey);
  const lineupComplete = missingSlots.length === 0;

  const visiblePlayers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data.slatePlayers ?? []).filter((p: any) => {
      const pos = String(p.player?.position || p.position || '').toLowerCase();
      const isGoalie = pos.includes('goal');
      if (activeSlot === 'GOALIE' && !isGoalie) return false;
      if (activeSlot !== 'GOALIE' && isGoalie) return false;
      if (positionFilter === 'GOALIES' && !isGoalie) return false;
      if (positionFilter === 'SKATERS' && isGoalie) return false;
      if (!term) return true;
      return `${p.player?.name ?? ''} ${p.player?.team_name ?? ''}`.toLowerCase().includes(term);
    }).sort((a: any, b: any) => {
      const alpha = (v: any) => String(v || '');
      let result = 0;
      if (sortKey === 'name') result = alpha(a.player?.name).localeCompare(alpha(b.player?.name));
      else if (sortKey === 'team') result = alpha(a.player?.team_name).localeCompare(alpha(b.player?.team_name));
      else if (sortKey === 'position') result = alpha(a.player?.position || a.position).localeCompare(alpha(b.player?.position || b.position));
      else if (sortKey === 'salary') result = Number(a.salary || 0) - Number(b.salary || 0);
      else result = Number(getPastFppg(a) || 0) - Number(getPastFppg(b) || 0);
      return sortDir === 'asc' ? result : -result;
    });
  }, [data.slatePlayers, activeSlot, positionFilter, search, sortKey, sortDir]);

  async function post(action: string, payload: any) {
    const res = await fetch('/api/dfs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  }

  async function submitLineup() {
    if (!lineupComplete) return setMsg(`Fill all slots: ${missingSlots.map(slotLabel).join(', ')}`);
    if (salaryRemaining < 0) return setMsg('Over salary cap.');
    try {
      const json = await post(editingEntryId ? 'update_entry' : 'submit_entry', editingEntryId ? { entry_id: editingEntryId, slots } : { contest_id: selectedContest, slots });
      setMsg(editingEntryId ? `Entry updated: ${json.entryId}` : `Entry submitted: ${json.entryId}`);
      setBuilderOpen(false);
      setEditingEntryId(null);
      setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
      await load({ contestId: selectedContest, slateId: selectedSlate });
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  function startSubmit() {
    setEditingEntryId(null);
    setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
    setActiveSlot('CAPTAIN');
    setBuilderOpen(true);
  }

  function editEntry(entry: any) {
    const contest = data.contests.find((c: any) => c.id === entry.contest_id);
    const locked = Boolean(contest?.lock_at && new Date(contest.lock_at).getTime() <= Date.now());
    if (locked) return;
    setEditingEntryId(entry.id);
    setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: (entry.slots ?? []).find((r: any) => r.slot === slot)?.player_id || '' })));
    setActiveSlot('CAPTAIN');
    setBuilderOpen(true);
  }

  function choosePlayer(player: any) {
    const used = slotByPlayer.get(player.player_id);
    if (used) return;
    const targetIdx = slots.findIndex((s) => s.slot === activeSlot);
    setSlots((prev) => {
      const next = [...prev];
      if (targetIdx >= 0 && slotAllowsPlayer(activeSlot, player)) {
        next[targetIdx] = { ...next[targetIdx], player_id: player.player_id };
        return next;
      }
      const fallback = next.findIndex((s) => !s.player_id && slotAllowsPlayer(s.slot, player));
      if (fallback >= 0) next[fallback] = { ...next[fallback], player_id: player.player_id };
      return next;
    });
    setSlotSelectorOpen(false);
  }

  async function openGameStats(game: any) {
    setSelectedGame(game);
    const res = await fetch(`/api/games/${game.id}/stats`);
    const json = await res.json();
    setSelectedGameStats(json.stats ?? []);
  }

  if (loading) {
    return (
      <main>
        <h1>DFS Contest Lobby</h1>
        <section className="card"><p className="muted">Loading next contest, player pool, and slate games…</p></section>
      </main>
    );
  }

  if (!currentContest) {
    return (
      <main>
        <h1>DFS Contest Lobby</h1>
        <section className="card"><p className="muted">No active contest is available right now.</p></section>
      </main>
    );
  }

  return (
    <main>
      <h1>DFS Contest Lobby</h1>
      {msg && <p>{msg}</p>}

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="section-header-row">
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>{currentContest.name}</h2>
            <p className="muted">Locks {formatPublicDateTime(currentContest.lock_at)} · Salary Cap {currentContest.salary_cap} · {String(currentContest.status || '').toUpperCase()}</p>
          </div>
          <button type="button" onClick={startSubmit} disabled={contestLocked}>Submit Lineup</button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">How Scoring Works</h2>
        <p className="muted">Roster: Captain + 4 Skaters + 1 Goalie. Captain receives 1.5x salary and 1.5x scoring.</p>
        <p className="muted">Skaters: Goal = 3, Assist = 2, 5 weekly real points = +5, 10 weekly real points = additional +5. Goalies: Win = 8, Goal Against = -1.</p>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Leaderboard</h2>
        <div className="desktop-only responsive-table">
          <table className="table"><thead><tr><th>Rank</th><th>Entry</th><th>User</th><th>Points</th><th>Submitted</th></tr></thead><tbody>
            {(data.leaderboardEntries ?? []).map((e: any, idx: number) => <tr key={e.id}><td>{e.rank ?? idx + 1}</td><td>{e.display_label || `Entry #${idx + 1}`}</td><td>{e.user_display}</td><td>{Number(e.actual_points || 0).toFixed(2)}</td><td>{formatPublicDateTime(e.created_at)}</td></tr>)}
          </tbody></table>
          {!data.leaderboardEntries?.length && <p className="muted">No entries yet for this contest.</p>}
        </div>
        <div className="mobile-only stack-list">
          {(data.leaderboardEntries ?? []).map((e: any, idx: number) => (
            <article key={e.id} className="list-card compact">
              <p><strong>#{e.rank ?? idx + 1}</strong> · {e.display_label || `Entry #${idx + 1}`}</p>
              <p className="muted">{e.user_display} · {Number(e.actual_points || 0).toFixed(2)} pts</p>
            </article>
          ))}
          {!data.leaderboardEntries?.length && <p className="muted">No entries yet for this contest.</p>}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">My Entries</h2>
        <div className="stack-list">
          {(data.myEntries ?? []).filter((e: any) => e.contest_id === selectedContest).map((e: any, idx: number) => {
            const contest = data.contests.find((c: any) => c.id === e.contest_id);
            const locked = Boolean(contest?.lock_at && new Date(contest.lock_at).getTime() <= Date.now());
            return (
              <article key={e.id} className="list-card compact">
                <p><strong>{e.display_label || `Entry #${idx + 1}`}</strong></p>
                <p className="muted">Score {Number(e.actual_points || 0).toFixed(2)} · {locked ? 'Locked' : 'Editable'}</p>
                <button type="button" onClick={() => editEntry(e)} disabled={locked}>{locked ? 'Locked' : 'Update Entry'}</button>
              </article>
            );
          })}
          {!data.myEntries?.filter((e: any) => e.contest_id === selectedContest).length && <p className="muted">No entries submitted yet.</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Games in This Slate</h2>
        <div className="desktop-only responsive-table">
          <table className="table"><thead><tr><th>Time</th><th>Matchup</th><th>Status</th><th>Score</th><th></th></tr></thead><tbody>
            {(data.slateGames ?? []).map((g: any) => <tr key={g.id}><td>{formatPublicDateTime(g.scheduled_at)}</td><td>{g.away_team_name} @ {g.home_team_name}</td><td>{g.status}</td><td>{g.away_score} - {g.home_score}</td><td><button type="button" onClick={() => openGameStats(g)}>Stats</button></td></tr>)}
          </tbody></table>
          {!data.slateGames?.length && <p className="muted">No games attached to this slate.</p>}
        </div>
        <div className="mobile-only game-slate-list">
          {(data.slateGames ?? []).map((g: any) => (
            <article className="game-card" key={g.id}>
              <p><strong>{g.away_team_name}</strong> @ <strong>{g.home_team_name}</strong></p>
              <p className="muted">{formatPublicDateTime(g.scheduled_at)} · {g.status} · {g.away_score}-{g.home_score}</p>
              <button type="button" onClick={() => openGameStats(g)}>View Game Stats</button>
            </article>
          ))}
          {!data.slateGames?.length && <p className="muted">No games attached to this slate.</p>}
        </div>
      </section>

      {builderOpen && (
        <div className="modal-overlay">
          <div className="modal-card card dfs-builder-modal">
            <h2 className="section-title">{editingEntryId ? 'Update Lineup' : 'Build Lineup'}</h2>
            <p className="muted">Remaining: {Math.round(salaryRemaining)} · Filled: {6 - missingSlots.length}/6 · {salaryRemaining >= 0 ? 'Under Cap' : 'Over Cap'}</p>
            <div className="dfs-lineup-stack">
              {slots.map((s) => {
                const player = data.slatePlayers.find((p: any) => p.player_id === s.player_id);
                return (
                  <div key={s.slot} className={`dfs-slot ${s.slot === 'CAPTAIN' ? 'is-captain' : ''}`} draggable={Boolean(player)} onDragStart={(e) => e.dataTransfer.setData('text/plain', s.slot)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                    const src = e.dataTransfer.getData('text/plain') as SlotKey;
                    if (!src || src === s.slot) return;
                    const a = slots.find((x) => x.slot === src)?.player_id || '';
                    const b = slots.find((x) => x.slot === s.slot)?.player_id || '';
                    const aP = data.slatePlayers.find((p: any) => p.player_id === a);
                    const bP = data.slatePlayers.find((p: any) => p.player_id === b);
                    if ((aP && !slotAllowsPlayer(s.slot, aP)) || (bP && !slotAllowsPlayer(src, bP))) return;
                    setSlots((prev) => prev.map((row) => row.slot === src ? { ...row, player_id: b } : row.slot === s.slot ? { ...row, player_id: a } : row));
                  }}>
                    <button type="button" className="link-button" onClick={() => { setActiveSlot(s.slot); setSlotSelectorOpen(true); }}>
                      <div className="dfs-slot-label">{slotLabel(s.slot)}</div>
                      <div className="dfs-slot-player">{player ? `${player.player?.name} · ${player.player?.team_name}` : 'Tap to choose player'}</div>
                    </button>
                    {player && <button type="button" onClick={() => setSlots((prev) => prev.map((x) => x.slot === s.slot ? { ...x, player_id: '' } : x))}>✕</button>}
                  </div>
                );
              })}
            </div>
            {!lineupComplete && <p className="muted">Missing: {missingSlots.map(slotLabel).join(', ')}</p>}
            <div className="form-actions">
              <button type="button" onClick={submitLineup} disabled={!lineupComplete || salaryRemaining < 0}>{editingEntryId ? 'Update Entry' : 'Submit Entry'}</button>
              <button type="button" onClick={() => setBuilderOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {slotSelectorOpen && (
        <div className="modal-overlay">
          <div className="modal-card card dfs-builder-modal">
            <h2 className="section-title">Select {slotLabel(activeSlot)}</h2>
            <div className="dfs-pool-controls" style={{ marginBottom: 8 }}>
              <input placeholder="Search player or team" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value as any)}>
                <option value="ALL">All</option><option value="SKATERS">Skaters</option><option value="GOALIES">Goalies</option>
              </select>
            </div>
            <div className="stack-list dfs-scroll-list">
              {visiblePlayers.map((p: any) => {
                const used = slotByPlayer.get(p.player_id);
                const invalid = !slotAllowsPlayer(activeSlot, p) || Boolean(used);
                return (
                  <article key={p.id} className={`list-card compact ${invalid ? 'dfs-row-muted' : ''}`}>
                    <p><strong>{p.player?.name}</strong> {used && <span className="badge">In {slotLabel(used)}</span>}</p>
                    <p className="muted">{p.player?.team_name} · {p.player?.position || p.position} · ${activeSlot === 'CAPTAIN' ? Math.round(Number(p.salary || 0) * 1.5) : p.salary}{activeSlot === 'CAPTAIN' ? ' (Captain 1.5x)' : ''} · Past FPPG {getPastFppg(p)?.toFixed(2) || '—'}</p>
                    <button type="button" onClick={() => choosePlayer(p)} disabled={invalid}>Add</button>
                  </article>
                );
              })}
              {!visiblePlayers.length && <p className="muted">No players match these filters.</p>}
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => setSlotSelectorOpen(false)}>Back to Builder</button>
              <button type="button" onClick={() => setSortDir((p) => (p === 'asc' ? 'desc' : 'asc'))}>Sort {sortDir === 'asc' ? '↑' : '↓'}</button>
              <button type="button" onClick={() => setSortKey(sortKey === 'salary' ? 'past_fppg' : 'salary')}>Sort Key: {sortKey === 'salary' ? 'Salary' : sortKey === 'past_fppg' ? 'Past FPPG' : sortKey}</button>
            </div>
          </div>
        </div>
      )}

      {selectedGame && (
        <div className="modal-overlay">
          <div className="modal-card card">
            <h3 className="card-title">{selectedGame.away_team_name} @ {selectedGame.home_team_name}</h3>
            <div className="stack-list">
              {selectedGameStats.map((s: any) => (
                <article key={s.id} className="list-card compact">
                  <p><strong>{s.player_name || 'Team'}</strong> <span className="muted">{s.position || '—'}</span></p>
                  <p className="muted">G {s.goals} · A {s.assists} · GA {s.goals_against}</p>
                </article>
              ))}
              {!selectedGameStats.length && <p className="muted">No game stats posted yet.</p>}
            </div>
            <button type="button" onClick={() => setSelectedGame(null)}>Close</button>
          </div>
        </div>
      )}
    </main>
  );
}
