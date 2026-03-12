'use client';

import { useEffect, useMemo, useState } from 'react';
import FantasyPlayerModal from './FantasyPlayerModal';

type SlotKey = 'CAPTAIN' | 'SKATER_1' | 'SKATER_2' | 'SKATER_3' | 'SKATER_4' | 'GOALIE';
type SortKey = 'name' | 'team' | 'position' | 'salary' | 'projection' | 'goals' | 'assists' | 'points' | 'fantasy';

const SLOT_CONFIG: SlotKey[] = ['CAPTAIN', 'SKATER_1', 'SKATER_2', 'SKATER_3', 'SKATER_4', 'GOALIE'];

export default function DfsClient() {
  const [data, setData] = useState<any>({ slates: [], contests: [], seasons: [], slatePlayers: [], slateGames: [], recommendedSlateId: null, myEntries: [], actor: { role: 'FAN' } });
  const [selectedSlate, setSelectedSlate] = useState('');
  const [selectedContest, setSelectedContest] = useState('');
  const [lineupName, setLineupName] = useState('My Entry');
  const [slots, setSlots] = useState<any[]>(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
  const [activeSlot, setActiveSlot] = useState<SlotKey>('CAPTAIN');
  const [msg, setMsg] = useState('');
  const [seasonIdForCreate, setSeasonIdForCreate] = useState('');
  const [newSlateName, setNewSlateName] = useState('Custom Slate');
  const [newSlateLock, setNewSlateLock] = useState('');
  const [newContestName, setNewContestName] = useState('Main Contest');
  const [newContestLock, setNewContestLock] = useState('');
  const [newContestCap, setNewContestCap] = useState('50000');
  const [newContestMaxEntries, setNewContestMaxEntries] = useState('5');
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerModalLoading, setPlayerModalLoading] = useState(false);
  const [playerModalData, setPlayerModalData] = useState<any>(null);
  const [selectedPlayerContext, setSelectedPlayerContext] = useState<{ salary?: number; projection?: number; playerId?: string }>({});
  const [positionFilter, setPositionFilter] = useState<'ALL' | 'SKATERS' | 'GOALIES'>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('projection');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  async function load(slateId?: string) {
    const res = await fetch(`/api/dfs${slateId ? `?slate_id=${slateId}` : ''}`);
    const json = await res.json();
    setData(json);

    if (!seasonIdForCreate && json?.seasons?.length) {
      const seasonIdsInSlateOrder = (json?.slates ?? []).map((s: any) => s.season_id).filter(Boolean);
      const preferredSeason = seasonIdsInSlateOrder[0] || json.seasons[0]?.id;
      if (preferredSeason) setSeasonIdForCreate(preferredSeason);
    }

    if (!selectedSlate && json?.recommendedSlateId) {
      setSelectedSlate(json.recommendedSlateId);
    }

    if (!selectedContest && json?.contests?.length) {
      const targetSlate = slateId || json.recommendedSlateId;
      const recommendedContest = json.contests.find((c: any) => c.slate_id === targetSlate && ['open', 'live'].includes(String(c.status || '').toLowerCase()))
        || json.contests.find((c: any) => c.slate_id === targetSlate)
        || json.contests[0];
      if (recommendedContest) setSelectedContest(recommendedContest.id);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedSlate) load(selectedSlate); }, [selectedSlate]);

  const currentContest = data.contests.find((c: any) => c.id === selectedContest);

  const slotByPlayerId = useMemo(() => {
    const map = new Map<string, SlotKey>();
    for (const slot of slots) {
      if (slot.player_id) map.set(slot.player_id, slot.slot);
    }
    return map;
  }, [slots]);

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

  const validationMessage = useMemo(() => {
    if (!selectedContest) return 'Select a contest to build a lineup.';
    if (salaryRemaining < 0) return `Over salary cap by $${Math.abs(Math.round(salaryRemaining))}.`;
    if (slots.some((s) => !s.player_id)) return 'Fill all lineup slots before submitting.';
    return 'Lineup is valid and ready to submit.';
  }, [selectedContest, salaryRemaining, slots]);

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
      setActiveSlot('CAPTAIN');
      await load(selectedSlate || undefined);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function createSlate() {
    try {
      setMsg('');
      if (!seasonIdForCreate) throw new Error('Select a season first.');
      const json = await post('create_slate', {
        season_id: seasonIdForCreate,
        name: newSlateName,
        lock_at: newSlateLock || null,
        game_ids: [],
        status: 'draft',
      });
      setSelectedSlate(json.slate.id);
      setMsg('Custom slate created with snapshotted pricing/projections.');
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
        lock_at: newContestLock || null,
        salary_cap: Number(newContestCap),
        max_entries: Number(newContestMaxEntries),
        status: 'open',
      });
      setMsg('Custom contest created.');
      await load(selectedSlate || undefined);
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function generateDefaultSlate() {
    try {
      const json = await post('auto_generate_default_next_slate_day', {});
      setSelectedSlate(json.slateId);
      setMsg(`Default next slate day ready (${json.gameCount ?? 0} games).`);
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

  function slotAllowsPlayer(slot: SlotKey, player: any) {
    const pos = String(player.player?.position || player.position || '').toLowerCase();
    const isGoalie = pos.includes('goal');
    if (slot === 'GOALIE') return isGoalie;
    return !isGoalie;
  }

  function tryAddPlayerToSlot(player: any, slot: SlotKey, { quiet = false }: { quiet?: boolean } = {}) {
    if (!slotAllowsPlayer(slot, player)) {
      if (!quiet) setMsg(slot === 'GOALIE' ? 'Goalie slot only accepts goalies.' : 'Captain/Skater slots only accept skaters.');
      return false;
    }

    const alreadyIn = slotByPlayerId.get(player.player_id);
    if (alreadyIn === slot) {
      if (!quiet) setMsg(`${player.player?.name ?? 'Player'} is already in ${slotLabel(slot)}.`);
      return true;
    }

    let nextSlots = [...slots];
    const slotIndex = nextSlots.findIndex((s) => s.slot === slot);
    if (slotIndex < 0) return false;

    if (alreadyIn) {
      const existingInTarget = nextSlots[slotIndex].player_id;
      nextSlots = nextSlots.map((s) => {
        if (s.slot === alreadyIn) return { ...s, player_id: existingInTarget || '' };
        if (s.slot === slot) return { ...s, player_id: player.player_id };
        return s;
      });
      setSlots(nextSlots);
      if (!quiet) setMsg(`Swapped ${player.player?.name ?? 'player'} from ${slotLabel(alreadyIn)} to ${slotLabel(slot)}.`);
      return true;
    }

    const targetPlayerId = nextSlots[slotIndex].player_id;
    nextSlots[slotIndex] = { ...nextSlots[slotIndex], player_id: player.player_id };
    if (targetPlayerId) {
      const firstOpenCompatible = nextSlots.find((s) => !s.player_id && slotAllowsPlayer(s.slot, { ...player, player: { ...player.player, position: data.slatePlayers.find((p: any) => p.player_id === targetPlayerId)?.player?.position } }));
      if (firstOpenCompatible) {
        firstOpenCompatible.player_id = targetPlayerId;
      } else {
        const displacedPlayer = data.slatePlayers.find((p: any) => p.player_id === targetPlayerId);
        if (displacedPlayer) {
          const fallbackSlot = nextSlots.find((s) => !s.player_id && slotAllowsPlayer(s.slot, displacedPlayer));
          if (fallbackSlot) fallbackSlot.player_id = targetPlayerId;
        }
      }
    }

    setSlots(nextSlots);
    return true;
  }

  function addPlayerToLineup(player: any) {
    setMsg('');
    const orderedTargets: SlotKey[] = [activeSlot, ...SLOT_CONFIG.filter((s) => s !== activeSlot)];
    for (const slot of orderedTargets) {
      if (slotAllowsPlayer(slot, player)) {
        const success = tryAddPlayerToSlot(player, slot, { quiet: true });
        if (success) {
          setActiveSlot(slot);
          return;
        }
      }
    }
    setMsg('No valid lineup slot is available for that player.');
  }

  function removePlayerFromSlot(slot: SlotKey) {
    setSlots((prev) => prev.map((s) => (s.slot === slot ? { ...s, player_id: '' } : s)));
    setMsg('');
  }

  async function openPlayerResearch(player: any) {
    try {
      setPlayerModalOpen(true);
      setPlayerModalLoading(true);
      setSelectedPlayerContext({ salary: player.salary, projection: player.projection_points, playerId: player.player_id });
      const seasonForSlate = data.slates.find((s: any) => s.id === selectedSlate)?.season_id;
      const res = await fetch(`/api/dfs?player_id=${player.player_id}${seasonForSlate ? `&season_id=${encodeURIComponent(seasonForSlate)}` : ''}`);
      const json = await res.json();
      setPlayerModalData(json);
    } finally {
      setPlayerModalLoading(false);
    }
  }

  function getNumericPlayerField(player: any, key: SortKey) {
    if (key === 'salary') return Number(player.salary || 0);
    if (key === 'projection') return Number(player.projection_points || 0);
    if (key === 'goals') return Number(player.stats?.goals || 0);
    if (key === 'assists') return Number(player.stats?.assists || 0);
    if (key === 'points') return Number(player.stats?.points || 0);
    if (key === 'fantasy') return Number(player.stats?.fantasy_points || 0);
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
      if (['salary', 'projection', 'goals', 'assists', 'points', 'fantasy'].includes(sortKey)) {
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
    if (newKey === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(newKey);
    setSortDir(newKey === 'name' || newKey === 'team' || newKey === 'position' ? 'asc' : 'desc');
  }

  const isAdmin = data.actor?.role === 'ADMIN';

  return (
    <main>
      <h1>DFS</h1>
      <p className="muted">Build one lineup with 1 Captain, 4 Skaters, and 1 Goalie. Captain gets 1.5x salary and scoring.</p>
      {msg && <p>{msg}</p>}

      {isAdmin && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Admin DFS Controls</h2>
          <div className="form-actions" style={{ marginTop: 0 }}>
            <button onClick={generateDefaultSlate}>Generate Next Playable Default Slate</button>
            <button onClick={scoreContest} disabled={!selectedContest}>Score Selected Contest</button>
          </div>

          <div className="form-grid">
            <div className="form-field col-4"><label>Season</label><select value={seasonIdForCreate} onChange={(e) => setSeasonIdForCreate(e.target.value)}><option value="">Select season...</option>{(data.seasons ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="form-field col-4"><label>Slate Name</label><input value={newSlateName} onChange={(e) => setNewSlateName(e.target.value)} /></div>
            <div className="form-field col-4"><label>Slate Lock (optional)</label><input type="datetime-local" value={newSlateLock} onChange={(e) => setNewSlateLock(e.target.value)} /></div>
            <div className="form-actions"><button onClick={createSlate}>Create Custom Slate</button></div>
          </div>

          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="form-field col-6"><label>Contest Name</label><input value={newContestName} onChange={(e) => setNewContestName(e.target.value)} /></div>
            <div className="form-field col-6"><label>Contest Lock (optional)</label><input type="datetime-local" value={newContestLock} onChange={(e) => setNewContestLock(e.target.value)} /></div>
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
                  <th><button type="button" className="link-button" onClick={() => changeSort('projection')}>Proj</button></th>
                  <th><button type="button" className="link-button" onClick={() => changeSort('goals')}>G</button></th>
                  <th><button type="button" className="link-button" onClick={() => changeSort('assists')}>A</button></th>
                  <th><button type="button" className="link-button" onClick={() => changeSort('points')}>P</button></th>
                  <th>Add</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlayers.map((p: any) => {
                  const occupiedSlot = slotByPlayerId.get(p.player_id);
                  const invalidForSelectedSlot = !slotAllowsPlayer(activeSlot, p);
                  const captainPremium = activeSlot === 'CAPTAIN' ? Number(p.salary || 0) * 1.5 : Number(p.salary || 0);
                  const wouldExceedCap = Number(currentContest?.salary_cap ?? 0) > 0 && (salaryUsed - (occupiedSlot ? Number(p.salary || 0) : 0) + captainPremium) > Number(currentContest?.salary_cap ?? 0);
                  const muted = invalidForSelectedSlot || wouldExceedCap;

                  return (
                    <tr key={p.id} className={muted ? 'dfs-row-muted' : ''}>
                      <td>
                        <button type="button" className="link-button" onClick={() => openPlayerResearch(p)}>
                          {p.player?.name || p.player_id.slice(0, 8)}
                        </button>
                        {occupiedSlot && <span className="badge" style={{ marginLeft: 6 }}>In {slotLabel(occupiedSlot)}</span>}
                      </td>
                      <td>{p.player?.team_name || '-'}</td>
                      <td>{p.player?.position || p.position || '-'}</td>
                      <td>${p.salary}</td>
                      <td>{Number(p.projection_points || 0).toFixed(2)}</td>
                      <td>{p.stats?.goals ?? 0}</td>
                      <td>{p.stats?.assists ?? 0}</td>
                      <td>{p.stats?.points ?? 0}</td>
                      <td><button type="button" onClick={() => addPlayerToLineup(p)}>Add</button></td>
                    </tr>
                  );
                })}
                {!visiblePlayers.length && <tr><td colSpan={9} className="muted">No players match the current filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card dfs-panel">
          <h2 className="section-title">Lineup Builder</h2>
          <div className="form-field" style={{ marginBottom: 10 }}>
            <label>Lineup Name</label>
            <input value={lineupName} onChange={(e) => setLineupName(e.target.value)} />
          </div>

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
                  onClick={() => setActiveSlot(s.slot)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveSlot(s.slot); } }}
                >
                  <div>
                    <div className="dfs-slot-label">{slotLabel(s.slot)}</div>
                    <div className="dfs-slot-player">{player ? player.player?.name : 'Select this slot, then add a player'}</div>
                    {player && <div className="muted">{player.player?.team_name} · {player.player?.position} · ${player.salary}</div>}
                  </div>
                  <div className="dfs-slot-actions">
                    {player && <button type="button" onClick={(e) => { e.stopPropagation(); removePlayerFromSlot(s.slot); }}>Remove</button>}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="muted">Active slot: <strong>{slotLabel(activeSlot)}</strong></p>
          <p className="muted">Salary used: {Math.round(salaryUsed)} / {currentContest?.salary_cap ?? '—'} · Remaining: {isNaN(salaryRemaining) ? '—' : Math.round(salaryRemaining)}</p>
          <p className="muted">Projected total: {projectedTotal.toFixed(2)}</p>
          <p className="muted">{validationMessage}</p>
          <button type="button" onClick={submit} disabled={!selectedContest || salaryRemaining < 0}>Submit Entry</button>
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">My Entries</h2>
        <table className="table">
          <thead><tr><th>Lineup</th><th>Contest</th><th>Salary</th><th>Projected</th><th>Actual</th><th>Submitted</th></tr></thead>
          <tbody>
            {(data.myEntries ?? []).map((e: any) => (
              <tr key={e.id}><td>{e.lineup_name || e.id.slice(0, 8)}</td><td>{e.contest_name || e.contest_id}</td><td>{e.salary_used}</td><td>{e.projected_points}</td><td>{e.actual_points}</td><td>{new Date(e.created_at).toLocaleString()}</td></tr>
            ))}
            {!data.myEntries?.length && <tr><td colSpan={6} className="muted">No entries yet. Pick a contest and submit your lineup.</td></tr>}
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
