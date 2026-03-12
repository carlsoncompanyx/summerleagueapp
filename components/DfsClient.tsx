'use client';

import { useEffect, useMemo, useState } from 'react';
import FantasyPlayerModal from './FantasyPlayerModal';

type SlotKey = 'CAPTAIN' | 'SKATER_1' | 'SKATER_2' | 'SKATER_3' | 'SKATER_4' | 'GOALIE';
type SortKey = 'name' | 'team' | 'position' | 'salary' | 'past_fppg';
type DfsTab = 'submit' | 'leaderboard';

const SLOT_CONFIG: SlotKey[] = ['CAPTAIN', 'SKATER_1', 'SKATER_2', 'SKATER_3', 'SKATER_4', 'GOALIE'];

export default function DfsClient() {
  const [data, setData] = useState<any>({
    slates: [], contests: [], seasons: [], slatePlayers: [], slateGames: [], recommendedSlateId: null, myEntries: [], leaderboardEntries: [], actor: { role: 'FAN' },
  });
  const [selectedSlate, setSelectedSlate] = useState('');
  const [selectedContest, setSelectedContest] = useState('');
  const [slots, setSlots] = useState<any[]>(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
  const [activeSlot, setActiveSlot] = useState<SlotKey>('CAPTAIN');
  const [manualSlotTargeting, setManualSlotTargeting] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState<DfsTab>('submit');
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerModalLoading, setPlayerModalLoading] = useState(false);
  const [playerModalData, setPlayerModalData] = useState<any>(null);
  const [selectedPlayerContext, setSelectedPlayerContext] = useState<{ salary?: number; projection?: number; playerId?: string }>({});
  const [positionFilter, setPositionFilter] = useState<'ALL' | 'SKATERS' | 'GOALIES'>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('salary');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  async function load(opts?: { slateId?: string; contestId?: string }) {
    const slateId = opts?.slateId ?? selectedSlate;
    const contestId = opts?.contestId ?? selectedContest;
    const q = new URLSearchParams();
    if (slateId) q.set('slate_id', slateId);
    if (contestId) q.set('contest_id', contestId);
    const res = await fetch(`/api/dfs${q.toString() ? `?${q}` : ''}`);
    const json = await res.json();
    setData(json);

    const activeContests = (json?.contests ?? []).filter((c: any) => ['open', 'live'].includes(String(c.status || '').toLowerCase()));
    const fallbackContest = activeContests[0] || json.contests?.[0] || null;
    const nextContestId = contestId || fallbackContest?.id || '';
    if (nextContestId && nextContestId !== selectedContest) setSelectedContest(nextContestId);

    const nextSlateId = slateId || json.contests?.find((c: any) => c.id === nextContestId)?.slate_id || json.recommendedSlateId || '';
    if (nextSlateId && nextSlateId !== selectedSlate) setSelectedSlate(nextSlateId);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!selectedContest) return;
    const contest = data.contests.find((c: any) => c.id === selectedContest);
    const contestSlate = contest?.slate_id;
    load({ slateId: contestSlate || selectedSlate, contestId: selectedContest });
  }, [selectedContest]);

  const currentContest = data.contests.find((c: any) => c.id === selectedContest);
  const activeContests = useMemo(
    () => (data.contests ?? []).filter((c: any) => ['open', 'live'].includes(String(c.status || '').toLowerCase())),
    [data.contests],
  );

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
      if (!lineupComplete) {
        setMsg(`Lineup incomplete. Fill all required slots: ${incompleteSlots.map((slot) => slotLabel(slot)).join(', ')}.`);
        return;
      }
      const json = await post(editingEntryId ? 'update_entry' : 'submit_entry', editingEntryId
        ? { entry_id: editingEntryId, slots }
        : { contest_id: selectedContest, slots });
      setMsg(editingEntryId ? `Entry updated: ${json.entryId}` : `Entry submitted: ${json.entryId}`);
      setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
      setActiveSlot('CAPTAIN');
      setManualSlotTargeting(false);
      setEditingEntryId(null);
      await load({ contestId: selectedContest, slateId: selectedSlate });
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  }

  function slotAllowsPlayer(slot: SlotKey, player: any) {
    const pos = String(player.player?.position || player.position || '').toLowerCase();
    const isGoalie = pos.includes('goal');
    if (slot === 'GOALIE') return isGoalie;
    return !isGoalie;
  }

  function addPlayerToLineup(player: any) {
    setMsg('');
    const selectedAvailability = String(player.availability_status || 'AVAILABLE').toUpperCase();
    if (selectedAvailability === 'OUT') {
      setMsg('This player is marked Out and cannot be added to new lineups.');
      return;
    }

    if (manualSlotTargeting) {
      if (!slotAllowsPlayer(activeSlot, player)) {
        setMsg('Selected slot is not valid for this player.');
        return;
      }
      if (slots.find((s) => s.slot === activeSlot)?.player_id && !slotByPlayerId.get(player.player_id)) {
        setMsg('Selected slot is occupied. Clear it or drag/swap intentionally.');
        return;
      }
      addPlayerToLineupToSlot(player, activeSlot);
      return;
    }

    const position = String(player.player?.position || player.position || '').toLowerCase();
    const isGoalie = position.includes('goal');
    const openSlots = slots.filter((s) => !s.player_id).map((s) => s.slot as SlotKey);

    let fallbackSlot: SlotKey | undefined;
    if (isGoalie) {
      fallbackSlot = openSlots.find((slot) => slot === 'GOALIE');
    } else {
      const openSkater = openSlots.find((slot) => slot.startsWith('SKATER_'));
      fallbackSlot = openSkater || openSlots.find((slot) => slot === 'CAPTAIN');
      if (!fallbackSlot && !slots.find((s) => s.slot === 'CAPTAIN')?.player_id) fallbackSlot = 'CAPTAIN';
    }

    if (!fallbackSlot) {
      setMsg('No valid lineup slot is available for that player.');
      return;
    }
    setActiveSlot(fallbackSlot);
    addPlayerToLineupToSlot(player, fallbackSlot);
  }

  function addPlayerToLineupToSlot(player: any, slot: SlotKey) {
    const existingSlot = slotByPlayerId.get(player.player_id);
    if (existingSlot === slot) return;

    setSlots((prev) => {
      const next = [...prev];
      const targetIdx = next.findIndex((s) => s.slot === slot);
      if (targetIdx < 0) return prev;

      if (existingSlot) {
        const existingIdx = next.findIndex((s) => s.slot === existingSlot);
        const targetPlayer = next[targetIdx].player_id;
        next[targetIdx] = { ...next[targetIdx], player_id: player.player_id };
        next[existingIdx] = { ...next[existingIdx], player_id: targetPlayer || '' };
        return next;
      }

      next[targetIdx] = { ...next[targetIdx], player_id: player.player_id };
      return next;
    });
  }

  function removePlayerFromSlot(slot: SlotKey) {
    setSlots((prev) => prev.map((s) => (s.slot === slot ? { ...s, player_id: '' } : s)));
    setMsg('');
  }

  function startEditingEntry(entry: any) {
    const contest = data.contests.find((c: any) => c.id === entry.contest_id);
    const lockAt = contest?.lock_at ? new Date(contest.lock_at).getTime() : null;
    if (lockAt && lockAt <= Date.now()) {
      setMsg('This entry is locked and can no longer be edited.');
      return;
    }
    const nextSlots = SLOT_CONFIG.map((slot) => ({
      slot,
      player_id: (entry.slots ?? []).find((r: any) => r.slot === slot)?.player_id || '',
    }));
    setSlots(nextSlots);
    setEditingEntryId(entry.id);
    setActiveTab('submit');
    setMsg(`Editing ${entry.display_label || entry.id.slice(0, 8)}`);
  }

  function onDragStart(e: any, slot: SlotKey) {
    e.dataTransfer.setData('text/plain', slot);
  }

  function onDropSlot(e: any, targetSlot: SlotKey) {
    e.preventDefault();
    const sourceSlot = e.dataTransfer.getData('text/plain') as SlotKey;
    if (!sourceSlot || sourceSlot === targetSlot) return;

    const sourcePlayerId = slots.find((s) => s.slot === sourceSlot)?.player_id || '';
    const targetPlayerId = slots.find((s) => s.slot === targetSlot)?.player_id || '';
    const sourcePlayer = data.slatePlayers.find((p: any) => p.player_id === sourcePlayerId);
    const targetPlayer = data.slatePlayers.find((p: any) => p.player_id === targetPlayerId);

    if ((sourcePlayerId && sourcePlayer && !slotAllowsPlayer(targetSlot, sourcePlayer)) || (targetPlayerId && targetPlayer && !slotAllowsPlayer(sourceSlot, targetPlayer))) {
      setMsg('That swap is invalid for slot positions.');
      return;
    }

    setSlots((prev) => prev.map((row) => {
      if (row.slot === sourceSlot) return { ...row, player_id: targetPlayerId };
      if (row.slot === targetSlot) return { ...row, player_id: sourcePlayerId };
      return row;
    }));
  }

  async function openPlayerResearch(player: any) {
    try {
      setPlayerModalOpen(true);
      setPlayerModalLoading(true);
      setSelectedPlayerContext({ salary: player.salary, playerId: player.player_id });
      const seasonForSlate = data.slates.find((s: any) => s.id === selectedSlate)?.season_id;
      const res = await fetch(`/api/dfs?player_id=${player.player_id}${seasonForSlate ? `&season_id=${encodeURIComponent(seasonForSlate)}` : ''}`);
      const json = await res.json();
      setPlayerModalData(json);
    } finally {
      setPlayerModalLoading(false);
    }
  }

  function getPlayerPastFppg(player: any) {
    const currentAvg = Number(player.stats?.fantasy_points_avg);
    if (Number.isFinite(currentAvg) && currentAvg > 0) return currentAvg;

    const historicalAvg = Number(player.historical_projection_input);
    if (Number.isFinite(historicalAvg) && historicalAvg > 0) return historicalAvg;

    return null;
  }

  function getNumericPlayerField(player: any, key: SortKey) {
    if (key === 'salary') return Number(player.salary || 0);
    if (key === 'past_fppg') return Number(getPlayerPastFppg(player) || 0);
    return 0;
  }

  const visiblePlayers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = (data.slatePlayers ?? []).filter((p: any) => {
      const pos = String(p.player?.position || p.position || '').toLowerCase();
      const isGoalie = pos.includes('goal');
      if (positionFilter === 'GOALIES' && !isGoalie) return false;
      if (positionFilter === 'SKATERS' && isGoalie) return false;
      if (!normalizedSearch) return true;
      const haystack = `${p.player?.name ?? ''} ${p.player?.team_name ?? ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    return filtered.sort((a: any, b: any) => {
      let result = 0;
      if (['salary', 'past_fppg'].includes(sortKey)) {
        result = getNumericPlayerField(a, sortKey) - getNumericPlayerField(b, sortKey);
      } else if (sortKey === 'team') {
        result = String(a.player?.team_name || '').localeCompare(String(b.player?.team_name || ''));
      } else if (sortKey === 'position') {
        result = String(a.player?.position || a.position || '').localeCompare(String(b.player?.position || b.position || ''));
      } else {
        result = String(a.player?.name || '').localeCompare(String(b.player?.name || ''));
      }
      return sortDir === 'asc' ? result : -result;
    });
  }, [data.slatePlayers, positionFilter, search, sortKey, sortDir]);

  function slotLabel(slot: SlotKey) {
    if (slot === 'CAPTAIN') return 'Captain';
    if (slot === 'GOALIE') return 'Goalie';
    return slot.replace('_', ' ');
  }

  function changeSort(newKey: SortKey) {
    if (newKey === sortKey) setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(newKey);
      setSortDir(newKey === 'name' || newKey === 'team' || newKey === 'position' ? 'asc' : 'desc');
    }
  }

  return (
    <main>
      <h1>DFS</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Active DFS Contests</h2>
        <p className="muted">Choose a contest first. Your lineup, leaderboard, and slate games update automatically.</p>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div className="form-field col-8">
            <label>Contest</label>
            <select value={selectedContest} onChange={(e) => setSelectedContest(e.target.value)}>
              <option value="">Select contest...</option>
              {activeContests.map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.status} · Cap {c.salary_cap}</option>)}
              {!activeContests.length && (data.contests ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
            </select>
          </div>
          <div className="form-field col-4">
            <label>Selected Slate</label>
            <div>{data.slates.find((s: any) => s.id === selectedSlate)?.name ?? '—'}</div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">How Scoring Works</h2>
        <p className="muted">Roster: 1 Captain, 4 Skaters, 1 Goalie. Captain receives 1.5x salary and 1.5x fantasy scoring.</p>
        <p className="muted">Skaters: Goal = 3, Assist = 2, +5 bonus at 5 weekly real points, +5 additional at 10 weekly real points. Goalies: Win = 8, Goal Against = -1.</p>
      </section>

      <div className="tabs" style={{ marginBottom: 12, justifyContent: 'flex-start' }}>
        <button className={`tab-link ${activeTab === 'leaderboard' ? 'is-active' : ''}`} onClick={() => setActiveTab('leaderboard')}>Leaderboard</button>
        <button className={`tab-link ${activeTab === 'submit' ? 'is-active' : ''}`} onClick={() => setActiveTab('submit')}>Submit Entries</button>
      </div>

      {msg && <p>{msg}</p>}

      {activeTab === 'leaderboard' && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Leaderboard</h2>
          <table className="table">
            <thead><tr><th>Rank</th><th>Entry</th><th>User</th><th>Actual</th><th>Submitted</th></tr></thead>
            <tbody>
              {(data.leaderboardEntries ?? []).map((e: any, idx: number) => (
                <tr key={e.id}>
                  <td>{e.rank ?? (idx + 1)}</td>
                  <td>{e.lineup_name || `Entry #${idx + 1}`}</td>
                  <td>{e.user_display}</td>
                  <td>{Number(e.actual_points ?? 0).toFixed(2)}</td>
                  <td>{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {!data.leaderboardEntries?.length && <tr><td colSpan={5} className="muted">No entries submitted for this contest yet.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === 'submit' && (
        <>
          <div className="dfs-workspace">
            <section className="card dfs-panel">
              <div className="dfs-panel-header">
                <h2 className="section-title">Player Pool</h2>
                <div className="dfs-pool-controls">
                  <input placeholder="Search player or team" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value as any)}>
                    <option value="ALL">All</option>
                    <option value="SKATERS">Skaters</option>
                    <option value="GOALIES">Goalies</option>
                  </select>
                </div>
              </div>

              <div className="dfs-scroll-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th><button type="button" className="link-button" onClick={() => changeSort('name')}>Player</button></th>
                      <th><button type="button" className="link-button" onClick={() => changeSort('team')}>Team</button></th>
                      <th><button type="button" className="link-button" onClick={() => changeSort('position')}>Pos</button></th>
                      <th><button type="button" className="link-button" onClick={() => changeSort('salary')}>Salary</button></th>
                      <th><button type="button" className="link-button" onClick={() => changeSort('past_fppg')}>Past FPPG</button></th>
                      <th>Add</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePlayers.map((p: any) => {
                      const occupiedSlot = slotByPlayerId.get(p.player_id);
                      const invalidForSelectedSlot = !slotAllowsPlayer(activeSlot, p);
                      const availability = String(p.availability_status || 'AVAILABLE').toUpperCase();
                      const isOut = availability === 'OUT';
                      return (
                        <tr key={p.id} className={invalidForSelectedSlot || isOut ? 'dfs-row-muted' : ''}>
                          <td>
                            <button type="button" className="link-button" onClick={() => openPlayerResearch(p)}>{p.player?.name || p.player_id.slice(0, 8)}</button>
                            {occupiedSlot && <span className="badge" style={{ marginLeft: 6 }}>In {slotLabel(occupiedSlot)}</span>}
                            <span className="badge" style={{ marginLeft: 6 }}>{availability}</span>
                          </td>
                          <td>{p.player?.team_name || '-'}</td>
                          <td>{p.player?.position || p.position || '-'}</td>
                          <td>${p.salary}</td>
                          <td>{(() => { const v = getPlayerPastFppg(p); return v != null ? v.toFixed(2) : '—'; })()}</td>
                          <td><button type="button" onClick={() => addPlayerToLineup(p)} disabled={isOut}>Add</button></td>
                        </tr>
                      );
                    })}
                    {!visiblePlayers.length && <tr><td colSpan={6} className="muted">No players match the current filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card dfs-panel">
              <h2 className="section-title">Lineup Builder</h2>
              <div className="dfs-lineup-stack">
                {slots.map((s) => {
                  const player = data.slatePlayers.find((p: any) => p.player_id === s.player_id);
                  const isActive = s.slot === activeSlot;
                  return (
                    <div
                      key={s.slot}
                      className={`dfs-slot ${isActive ? 'is-active' : ''} ${s.slot === 'CAPTAIN' ? 'is-captain' : ''} ${s.slot === 'GOALIE' ? 'is-goalie' : ''}`}
                      role="button"
                      tabIndex={0}
                      draggable={Boolean(player)}
                      onDragStart={(e) => onDragStart(e, s.slot)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onDropSlot(e, s.slot)}
                      onClick={() => { setActiveSlot(s.slot); setManualSlotTargeting(true); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveSlot(s.slot); setManualSlotTargeting(true); } }}
                    >
                      <div>
                        <div className="dfs-slot-label">{slotLabel(s.slot)}</div>
                        <div className="dfs-slot-player">{player ? player.player?.name : 'Select this slot, then add a player'}</div>
                        {player && <div className="muted">{player.player?.team_name} · {player.player?.position} · ${player.salary} · {String(player.availability_status || 'AVAILABLE')}</div>}
                      </div>
                      <div className="dfs-slot-actions">
                        {player && <button type="button" aria-label={`Remove ${player.player?.name ?? 'player'} from ${slotLabel(s.slot)}`} onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(s.slot); }}>✕</button>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="muted">Active slot: <strong>{slotLabel(activeSlot)}</strong>{manualSlotTargeting ? ' (manual target)' : ' (auto add enabled)'}</p>
              <p className="muted">Salary used: {Math.round(salaryUsed)} / {currentContest?.salary_cap ?? '—'} · Remaining: {isNaN(salaryRemaining) ? '—' : Math.round(salaryRemaining)}</p>
              {!lineupComplete && <p className="muted">Lineup incomplete. Missing: {incompleteSlots.map((slot) => slotLabel(slot)).join(', ')}.</p>}
              {slots.some((s) => {
                const sp = data.slatePlayers.find((p: any) => p.player_id === s.player_id);
                return sp && String(sp.availability_status || 'AVAILABLE').toUpperCase() === 'OUT';
              }) && <p className="muted">⚠ This lineup includes player(s) marked Out. Replace them before saving.</p>}
              <div className="form-actions" style={{ marginTop: 8 }}>
                <button type="button" onClick={submit} disabled={!selectedContest || salaryRemaining < 0 || !lineupComplete}>{editingEntryId ? 'Save Lineup Update' : 'Submit Entry'}</button>
                {editingEntryId && <button type="button" onClick={() => { setEditingEntryId(null); setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' }))); setManualSlotTargeting(false); setMsg('Edit canceled.'); }}>Cancel Edit</button>}
              </div>
            </section>
          </div>

          <section className="card" style={{ marginBottom: 12 }}>
            <h2 className="section-title">My Entries</h2>
            <table className="table">
              <thead><tr><th>Entry</th><th>Contest</th><th>Salary</th><th>Actual</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {(data.myEntries ?? []).map((e: any, idx: number) => (
                  <tr key={e.id}><td>{e.display_label || e.lineup_name || `Entry #${idx + 1}`}</td><td>{e.contest_name || e.contest_id}</td><td>{e.salary_used}</td><td>{e.actual_points}</td><td>{new Date(e.created_at).toLocaleString()}</td><td>{(() => {
                    const contest = data.contests.find((c: any) => c.id === e.contest_id);
                    const lockAt = contest?.lock_at ? new Date(contest.lock_at).getTime() : null;
                    if (lockAt && lockAt <= Date.now()) return 'Locked';
                    const hasOut = (e.slots ?? []).some((slot: any) => {
                      const sp = data.slatePlayers.find((p: any) => p.player_id === slot.player_id);
                      return String(sp?.availability_status || 'AVAILABLE').toUpperCase() === 'OUT';
                    });
                    return hasOut ? 'Needs Update (Out player)' : 'Editable';
                  })()}</td><td><button type="button" onClick={() => startEditingEntry(e)} disabled={(() => {
                    const contest = data.contests.find((c: any) => c.id === e.contest_id);
                    const lockAt = contest?.lock_at ? new Date(contest.lock_at).getTime() : null;
                    return Boolean(lockAt && lockAt <= Date.now());
                  })()}>Update</button></td></tr>
                ))}
                {!data.myEntries?.length && <tr><td colSpan={7} className="muted">No entries yet. Pick a contest and submit your lineup.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="card">
        <h2 className="section-title">Games in This Slate</h2>
        <table className="table">
          <thead><tr><th>Time</th><th>Matchup</th><th>Status</th></tr></thead>
          <tbody>
            {(data.slateGames ?? []).map((g: any) => (
              <tr key={g.id}><td>{new Date(g.scheduled_at).toLocaleString()}</td><td>{g.home_team_name} vs {g.away_team_name}</td><td>{g.status}</td></tr>
            ))}
            {!data.slateGames?.length && <tr><td colSpan={3} className="muted">No games attached to this slate yet.</td></tr>}
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
        onAddToLineup={() => {
          const player = data.slatePlayers.find((p: any) => p.player_id === selectedPlayerContext.playerId);
          if (player) addPlayerToLineup(player);
        }}
      />
    </main>
  );
}
