'use client';

import { useEffect, useMemo, useState } from 'react';

type SlotKey = 'CAPTAIN' | 'SKATER_1' | 'SKATER_2' | 'SKATER_3' | 'SKATER_4' | 'GOALIE';
type SortKey = 'name' | 'team' | 'position' | 'salary' | 'past_fppg';

const SLOT_CONFIG: SlotKey[] = ['CAPTAIN', 'SKATER_1', 'SKATER_2', 'SKATER_3', 'SKATER_4', 'GOALIE'];

export default function DfsClient() {
  const [data, setData] = useState<any>({ slates: [], contests: [], slatePlayers: [], slateGames: [], myEntries: [], leaderboardEntries: [] });
  const [selectedSlate, setSelectedSlate] = useState('');
  const [selectedContest, setSelectedContest] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [slots, setSlots] = useState<any[]>(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
  const [activeSlot, setActiveSlot] = useState<SlotKey>('CAPTAIN');
  const [slotSelectorOpen, setSlotSelectorOpen] = useState(false);
  const [positionFilter, setPositionFilter] = useState<'ALL' | 'SKATERS' | 'GOALIES'>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('salary');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [msg, setMsg] = useState('');
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [selectedGameStats, setSelectedGameStats] = useState<any[]>([]);

  const currentContest = data.contests.find((c: any) => c.id === selectedContest);
  const contestLocked = Boolean(currentContest?.lock_at && new Date(currentContest.lock_at).getTime() <= Date.now());

  async function load(opts?: { slateId?: string; contestId?: string }) {
    const slateId = opts?.slateId ?? selectedSlate;
    const contestId = opts?.contestId ?? selectedContest;
    const q = new URLSearchParams();
    if (slateId) q.set('slate_id', slateId);
    if (contestId) q.set('contest_id', contestId);
    const res = await fetch(`/api/dfs${q.toString() ? `?${q.toString()}` : ''}`);
    const json = await res.json();
    setData(json);

    const activeContests = (json.contests ?? []).filter((c: any) => ['open', 'live'].includes(String(c.status || '').toLowerCase()));
    const fallbackContest = activeContests[0] || json.contests?.[0];
    const nextContestId = contestId || fallbackContest?.id || '';
    if (nextContestId && nextContestId !== selectedContest) setSelectedContest(nextContestId);

    const nextSlateId = slateId || json.contests?.find((c: any) => c.id === nextContestId)?.slate_id || json.recommendedSlateId || '';
    if (nextSlateId && nextSlateId !== selectedSlate) setSelectedSlate(nextSlateId);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!selectedContest) return;
    const contest = data.contests.find((c: any) => c.id === selectedContest);
    load({ slateId: contest?.slate_id || selectedSlate, contestId: selectedContest });
  }, [selectedContest]);

  const activeContests = useMemo(() => (data.contests ?? []).slice().sort((a: any, b: any) => {
    const aActive = ['open', 'live'].includes(String(a.status || '').toLowerCase()) ? 0 : 1;
    const bActive = ['open', 'live'].includes(String(b.status || '').toLowerCase()) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return new Date(a.lock_at || 0).getTime() - new Date(b.lock_at || 0).getTime();
  }), [data.contests]);

  const slotByPlayerId = useMemo(() => {
    const map = new Map<string, SlotKey>();
    for (const slot of slots) if (slot.player_id) map.set(slot.player_id, slot.slot);
    return map;
  }, [slots]);

  const salaryUsed = useMemo(() => slots.reduce((sum, s) => {
    const sp = data.slatePlayers.find((p: any) => p.player_id === s.player_id);
    const mult = s.slot === 'CAPTAIN' ? 1.5 : 1;
    return sum + ((sp?.salary || 0) * mult);
  }, 0), [slots, data.slatePlayers]);
  const salaryRemaining = Number(currentContest?.salary_cap ?? 0) - salaryUsed;

  const incompleteSlots = useMemo(() => slots.filter((s) => !String(s.player_id || '').trim()).map((s) => s.slot as SlotKey), [slots]);
  const lineupComplete = incompleteSlots.length === 0;

  function slotLabel(slot: SlotKey) {
    if (slot === 'CAPTAIN') return 'Captain';
    if (slot === 'GOALIE') return 'Goalie';
    return slot.replace('_', ' ');
  }

  function slotAllowsPlayer(slot: SlotKey, player: any) {
    const pos = String(player.player?.position || player.position || '').toLowerCase();
    const isGoalie = pos.includes('goal');
    if (slot === 'GOALIE') return isGoalie;
    return !isGoalie;
  }

  function getPlayerPastFppg(player: any) {
    const currentAvg = Number(player.stats?.fantasy_points_avg);
    if (Number.isFinite(currentAvg) && currentAvg > 0) return currentAvg;
    const historicalAvg = Number(player.historical_projection_input);
    if (Number.isFinite(historicalAvg) && historicalAvg > 0) return historicalAvg;
    return null;
  }

  function choosePlayer(player: any) {
    setMsg('');
    const occupied = slotByPlayerId.get(player.player_id);
    if (occupied) return;
    const targetedIdx = slots.findIndex((s) => s.slot === activeSlot);
    const isTargetValid = targetedIdx >= 0 && slotAllowsPlayer(activeSlot, player);

    setSlots((prev) => {
      const next = [...prev];
      if (isTargetValid) {
        next[targetedIdx] = { ...next[targetedIdx], player_id: player.player_id };
        return next;
      }
      const open = next.findIndex((s) => !s.player_id && slotAllowsPlayer(s.slot, player));
      if (open >= 0) next[open] = { ...next[open], player_id: player.player_id };
      return next;
    });
    setSlotSelectorOpen(false);
  }

  async function post(action: string, payload: any) {
    const res = await fetch('/api/dfs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  }

  async function submit() {
    if (!lineupComplete) return setMsg(`Fill all slots: ${incompleteSlots.map(slotLabel).join(', ')}`);
    if (salaryRemaining < 0) return setMsg('Salary cap exceeded.');
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

  function startBuilder() {
    setBuilderOpen(true);
    setEditingEntryId(null);
    setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
    setActiveSlot('CAPTAIN');
    setMsg('');
  }

  function startEditingEntry(entry: any) {
    const contest = data.contests.find((c: any) => c.id === entry.contest_id);
    const lockAt = contest?.lock_at ? new Date(contest.lock_at).getTime() : null;
    if (lockAt && lockAt <= Date.now()) return;
    setEditingEntryId(entry.id);
    setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: (entry.slots ?? []).find((s: any) => s.slot === slot)?.player_id || '' })));
    setBuilderOpen(true);
    setActiveSlot('CAPTAIN');
    setMsg('');
  }

  async function openGameStats(game: any) {
    setSelectedGame(game);
    const res = await fetch(`/api/games/${game.id}/stats`);
    const json = await res.json();
    setSelectedGameStats(json.stats ?? []);
  }

  const visiblePlayers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (data.slatePlayers ?? []).filter((p: any) => {
      const isGoalie = String(p.player?.position || p.position || '').toLowerCase().includes('goal');
      if (activeSlot === 'GOALIE' && !isGoalie) return false;
      if (activeSlot !== 'GOALIE' && isGoalie) return false;
      if (positionFilter === 'GOALIES' && !isGoalie) return false;
      if (positionFilter === 'SKATERS' && isGoalie) return false;
      if (!normalizedSearch) return true;
      return `${p.player?.name ?? ''} ${p.player?.team_name ?? ''}`.toLowerCase().includes(normalizedSearch);
    }).sort((a: any, b: any) => {
      const alpha = (v: any) => String(v || '');
      const num = (p: any) => sortKey === 'salary' ? Number(p.salary || 0) : Number(getPlayerPastFppg(p) || 0);
      let result = 0;
      if (sortKey === 'name') result = alpha(a.player?.name).localeCompare(alpha(b.player?.name));
      else if (sortKey === 'team') result = alpha(a.player?.team_name).localeCompare(alpha(b.player?.team_name));
      else if (sortKey === 'position') result = alpha(a.player?.position || a.position).localeCompare(alpha(b.player?.position || b.position));
      else result = num(a) - num(b);
      return sortDir === 'asc' ? result : -result;
    });
  }, [data.slatePlayers, activeSlot, positionFilter, search, sortKey, sortDir]);

  return (
    <main>
      <h1>DFS Contests</h1>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Active DFS Contest</h2>
        <div className="form-grid">
          <div className="form-field col-8">
            <label>Contest</label>
            <select value={selectedContest} onChange={(e) => setSelectedContest(e.target.value)}>
              <option value="">Select contest...</option>
              {activeContests.map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.status} · Cap {c.salary_cap}</option>)}
            </select>
          </div>
          <div className="form-field col-4">
            <label>&nbsp;</label>
            <button type="button" onClick={startBuilder} disabled={!selectedContest || contestLocked}>Submit Lineup</button>
          </div>
        </div>
        <p className="muted">Slate: {data.slates.find((s: any) => s.id === selectedSlate)?.name ?? '—'} · Lock: {currentContest?.lock_at ? new Date(currentContest.lock_at).toLocaleString() : 'TBD'}</p>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">How Scoring Works</h2>
        <p className="muted">Lineup format: Captain, 4 Skaters, 1 Goalie. Captain gets 1.5x salary and 1.5x scoring.</p>
        <p className="muted">Skaters: Goal = 3, Assist = 2, 5 weekly real hockey points = +5, 10 weekly real hockey points = additional +5. Goalies: Win = 8, Goal Against = -1.</p>
      </section>

      {msg && <p>{msg}</p>}

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Leaderboard</h2>
        <div className="responsive-table"><table className="table">
          <thead><tr><th>Rank</th><th>Entry</th><th>User</th><th>Score</th><th>Submitted</th></tr></thead>
          <tbody>
            {(data.leaderboardEntries ?? []).map((e: any, idx: number) => <tr key={e.id}><td>{e.rank ?? idx + 1}</td><td>{e.display_label || `Entry #${idx + 1}`}</td><td>{e.user_display}</td><td>{Number(e.actual_points || 0).toFixed(2)}</td><td>{new Date(e.created_at).toLocaleString()}</td></tr>)}
            {!data.leaderboardEntries?.length && <tr><td colSpan={5} className="muted">No entries yet for this contest.</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">My Entries</h2>
        <div className="responsive-table"><table className="table">
          <thead><tr><th>Entry</th><th>Status</th><th>Score</th><th>Action</th></tr></thead>
          <tbody>
            {(data.myEntries ?? []).filter((e: any) => e.contest_id === selectedContest).map((e: any, idx: number) => {
              const contest = data.contests.find((c: any) => c.id === e.contest_id);
              const locked = Boolean(contest?.lock_at && new Date(contest.lock_at).getTime() <= Date.now());
              return <tr key={e.id}><td>{e.display_label || `Entry #${idx + 1}`}</td><td>{locked ? 'Locked' : 'Editable'}</td><td>{Number(e.actual_points || 0).toFixed(2)}</td><td><button type="button" disabled={locked} onClick={() => startEditingEntry(e)}>{locked ? 'Locked' : 'Update'}</button></td></tr>;
            })}
            {!data.myEntries?.filter((e: any) => e.contest_id === selectedContest).length && <tr><td colSpan={4} className="muted">No entries for this contest yet.</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="card">
        <h2 className="section-title">Games in This Slate</h2>
        <div className="game-slate-list">
          {(data.slateGames ?? []).map((g: any) => (
            <article className="game-card" key={g.id}>
              <p><strong>{g.away_team_name}</strong> @ <strong>{g.home_team_name}</strong></p>
              <p className="muted">{new Date(g.scheduled_at).toLocaleString()} · {g.status}</p>
              <p className="muted">Score: {g.away_score} - {g.home_score}</p>
              <button type="button" onClick={() => openGameStats(g)}>View game stats</button>
            </article>
          ))}
          {!data.slateGames?.length && <p className="muted">No games in this slate.</p>}
        </div>
      </section>

      {builderOpen && (
        <div className="modal-overlay">
          <div className="modal-card card dfs-builder-modal">
            <h2 className="section-title">{editingEntryId ? 'Update Lineup' : 'Submit Lineup'}</h2>
            <p className="muted">Salary remaining: {Math.round(salaryRemaining)} · Filled: {slots.length - incompleteSlots.length}/6 · {salaryRemaining >= 0 ? 'Under Cap' : 'Over Cap'}</p>
            <div className="dfs-lineup-stack">
              {slots.map((s) => {
                const player = data.slatePlayers.find((p: any) => p.player_id === s.player_id);
                return (
                  <div key={s.slot} className={`dfs-slot ${s.slot === 'CAPTAIN' ? 'is-captain' : ''}`} draggable={Boolean(player)} onDragStart={(e) => e.dataTransfer.setData('text/plain', s.slot)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                    const src = e.dataTransfer.getData('text/plain') as SlotKey;
                    if (!src || src === s.slot) return;
                    const srcPlayer = slots.find((x) => x.slot === src)?.player_id || '';
                    const tgtPlayer = slots.find((x) => x.slot === s.slot)?.player_id || '';
                    const srcObj = data.slatePlayers.find((p: any) => p.player_id === srcPlayer);
                    const tgtObj = data.slatePlayers.find((p: any) => p.player_id === tgtPlayer);
                    if ((srcObj && !slotAllowsPlayer(s.slot, srcObj)) || (tgtObj && !slotAllowsPlayer(src, tgtObj))) return;
                    setSlots((prev) => prev.map((row) => row.slot === src ? { ...row, player_id: tgtPlayer } : row.slot === s.slot ? { ...row, player_id: srcPlayer } : row));
                  }}>
                    <button type="button" className="link-button" onClick={() => { setActiveSlot(s.slot); setSlotSelectorOpen(true); }}>
                      <div className="dfs-slot-label">{slotLabel(s.slot)}</div>
                      <div className="dfs-slot-player">{player ? `${player.player?.name} · ${player.player?.team_name}` : 'Tap to select player'}</div>
                    </button>
                    {player && <button type="button" onClick={() => setSlots((prev) => prev.map((x) => x.slot === s.slot ? { ...x, player_id: '' } : x))}>✕</button>}
                  </div>
                );
              })}
            </div>
            {!lineupComplete && <p className="muted">Missing: {incompleteSlots.map(slotLabel).join(', ')}</p>}
            <div className="form-actions">
              <button type="button" onClick={submit} disabled={!lineupComplete || salaryRemaining < 0}>{editingEntryId ? 'Update Entry' : 'Submit Entry'}</button>
              <button type="button" onClick={() => setBuilderOpen(false)}>Close</button>
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
              <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value as any)}><option value="ALL">All</option><option value="SKATERS">Skaters</option><option value="GOALIES">Goalies</option></select>
            </div>
            <div className="responsive-table dfs-scroll-table"><table className="table"><thead><tr>
              <th><button type="button" className="link-button" onClick={() => setSortKey('name')}>Player</button></th>
              <th><button type="button" className="link-button" onClick={() => setSortKey('team')}>Team</button></th>
              <th><button type="button" className="link-button" onClick={() => setSortKey('position')}>Position</button></th>
              <th><button type="button" className="link-button" onClick={() => setSortKey('salary')}>Salary</button></th>
              <th><button type="button" className="link-button" onClick={() => setSortKey('past_fppg')}>Past FPPG</button></th>
              <th>Add</th></tr></thead><tbody>
                {visiblePlayers.map((p: any) => {
                  const used = slotByPlayerId.get(p.player_id);
                  const invalid = !slotAllowsPlayer(activeSlot, p) || Boolean(used);
                  return <tr key={p.id} className={invalid ? 'dfs-row-muted' : ''}><td>{p.player?.name} {used && <span className="badge">In {slotLabel(used)}</span>}</td><td>{p.player?.team_name}</td><td>{p.player?.position || p.position}</td><td>${p.salary}</td><td>{getPlayerPastFppg(p)?.toFixed(2) || '—'}</td><td><button type="button" onClick={() => choosePlayer(p)} disabled={invalid}>Add</button></td></tr>;
                })}
              </tbody></table></div>
            <div className="form-actions"><button type="button" onClick={() => setSlotSelectorOpen(false)}>Back to Builder</button></div>
          </div>
        </div>
      )}

      {selectedGame && (
        <div className="modal-overlay">
          <div className="modal-card card">
            <h3 className="card-title">{selectedGame.away_team_name} @ {selectedGame.home_team_name} stats</h3>
            <div className="responsive-table"><table className="table"><thead><tr><th>Player</th><th>Pos</th><th>G</th><th>A</th><th>GA</th></tr></thead><tbody>
              {selectedGameStats.map((s: any) => <tr key={s.id}><td>{s.player_name || 'Team'}</td><td>{s.position || '—'}</td><td>{s.goals}</td><td>{s.assists}</td><td>{s.goals_against}</td></tr>)}
              {!selectedGameStats.length && <tr><td colSpan={5} className="muted">No stats posted yet.</td></tr>}
            </tbody></table></div>
            <button type="button" onClick={() => setSelectedGame(null)}>Close</button>
          </div>
        </div>
      )}
    </main>
  );
}
