'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatPublicDateTime } from '../lib/formatters';

type SlotKey = 'CAPTAIN' | 'SKATER_1' | 'SKATER_2' | 'SKATER_3' | 'SKATER_4' | 'GOALIE';
type SortKey = 'name' | 'team' | 'position' | 'salary' | 'fantasyPpg';

const SLOT_CONFIG: SlotKey[] = ['CAPTAIN', 'SKATER_1', 'SKATER_2', 'SKATER_3', 'SKATER_4', 'GOALIE'];

function slotLabel(slot: SlotKey) {
  if (slot === 'CAPTAIN') return 'Captain';
  if (slot === 'GOALIE') return 'Goalie';
  return slot.replace('_', ' ');
}

function currency(value: unknown) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function playerName(player: any) {
  return player?.player?.name ?? 'Unknown Player';
}

function playerTeam(player: any) {
  return player?.player?.team_name ?? 'Unassigned';
}

function isGoalie(player: any) {
  return String(player?.player?.position || player?.position || '').toLowerCase().includes('goal');
}

function slotAllowsPlayer(slot: SlotKey, player: any) {
  return slot === 'GOALIE' ? isGoalie(player) : !isGoalie(player);
}

function adjustedSalary(slot: SlotKey, player: any) {
  return Number(player?.salary || 0) * (slot === 'CAPTAIN' ? 1.5 : 1);
}

function adjustedProjection(slot: SlotKey, player: any) {
  return Number(player?.projection_points || 0) * (slot === 'CAPTAIN' ? 1.5 : 1);
}

function fantasyPpg(player: any) {
  const gamesPlayed = Number(player?.stats?.games_played || 0);
  const actualFantasy = Number(player?.stats?.fantasy_points ?? 0);
  if (gamesPlayed > 0) return actualFantasy / gamesPlayed;
  const projected = Number(player?.projection_points ?? player?.baseline_points ?? 0);
  return Number.isFinite(projected) ? projected : 0;
}

function hasActualFantasyPpg(player: any) {
  return Number(player?.stats?.games_played || 0) > 0;
}

function availabilityBadge(status: unknown) {
  const normalized = String(status || 'AVAILABLE').toUpperCase();
  if (normalized === 'OUT') return <span className="availability-badge is-out" title="Out">O</span>;
  if (normalized === 'QUESTIONABLE') return <span className="availability-badge is-questionable" title="Questionable">Q</span>;
  return null;
}

function filterForSlot(slot: SlotKey): 'SKATERS' | 'GOALIES' {
  return slot === 'GOALIE' ? 'GOALIES' : 'SKATERS';
}

function firstEmptySlot(slots: any[]) {
  return (SLOT_CONFIG.find((slot) => !slots.find((row) => row.slot === slot)?.player_id) ?? 'CAPTAIN') as SlotKey;
}

function nextEmptySlotAfter(current: SlotKey, slots: any[]) {
  const startIndex = SLOT_CONFIG.indexOf(current);
  const ordered = [...SLOT_CONFIG.slice(startIndex + 1), ...SLOT_CONFIG.slice(0, startIndex + 1)];
  return (ordered.find((slot) => !slots.find((row) => row.slot === slot)?.player_id) ?? current) as SlotKey;
}

function pointScorerRows(rows: any[]) {
  if (!rows?.length) return <p className="muted">No points recorded yet.</p>;
  return (
    <table className="table dfs-mini-table">
      <tbody>
        {rows.map((row: any) => (
          <tr key={row.id}>
            <td>#{row.jersey ?? '-'}</td>
            <td>{row.player_name}</td>
            <td>G {row.goals}</td>
            <td>A {row.assists}</td>
            <td>{Number(row.fantasy_points || 0).toFixed(1)} FP</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DfsClient({ initialData = null }: { initialData?: any }) {
  const [loading, setLoading] = useState(!initialData);
  const [data, setData] = useState<any>(initialData ?? { contests: [], slates: [], slatePlayers: [], slateGames: [], myEntries: [], leaderboardEntries: [] });
  const [selectedContest, setSelectedContest] = useState(initialData?.selectedContestId ?? initialData?.recommendedContestId ?? '');
  const [selectedSlate, setSelectedSlate] = useState(initialData?.selectedSlateId ?? initialData?.recommendedSlateId ?? '');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<SlotKey>('CAPTAIN');
  const [slots, setSlots] = useState<any[]>(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<'ALL' | 'SKATERS' | 'GOALIES'>('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('fantasyPpg');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [msg, setMsg] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [selectedGameStats, setSelectedGameStats] = useState<any[]>([]);

  const currentContest = useMemo(() => data.contests.find((contest: any) => contest.id === selectedContest), [data.contests, selectedContest]);
  const contestLocked = Boolean(currentContest?.lock_at && new Date(currentContest.lock_at).getTime() <= Date.now());
  const salaryCap = Number(currentContest?.salary_cap || 50000);

  const pickDefaultContest = (contests: any[]) => {
    const ordered = [...(contests ?? [])].sort((a: any, b: any) => new Date(a.lock_at || 0).getTime() - new Date(b.lock_at || 0).getTime());
    const active = ordered.filter((contest: any) => ['open', 'live'].includes(String(contest.status || '').toLowerCase()));
    const now = Date.now();
    return active.find((contest: any) => new Date(contest.lock_at || 0).getTime() > now) || active[0] || ordered[0] || null;
  };

  async function load(opts?: { contestId?: string; slateId?: string }) {
    setLoading(true);
    try {
      const contestId = opts?.contestId ?? selectedContest;
      const slateId = opts?.slateId ?? selectedSlate;
      const params = new URLSearchParams();
      if (contestId) params.set('contest_id', contestId);
      if (slateId) params.set('slate_id', slateId);
      const res = await fetch(`/api/dfs${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Unable to load DFS contest data.');

      const apiSelectedContest = json.selectedContestId
        ? (json.contests ?? []).find((contest: any) => contest.id === json.selectedContestId)
        : null;
      const chosen = apiSelectedContest
        ?? (contestId ? (json.contests ?? []).find((contest: any) => contest.id === contestId) : null)
        ?? pickDefaultContest(json.contests ?? []);
      const nextContestId = chosen?.id ?? json.selectedContestId ?? json.recommendedContestId ?? '';
      const nextSlateId = json.selectedSlateId ?? chosen?.slate_id ?? json.recommendedSlateId ?? '';

      setData(json);
      setSelectedContest(nextContestId);
      setSelectedSlate(nextSlateId);
      setMsg('');
      setLoadError('');
    } catch (error: any) {
      const message = error?.message || 'Unable to load DFS contest data.';
      setMsg(message);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!initialData) void load(); }, []);
  useEffect(() => {
    if (!selectedContest) return;
    const contest = data.contests.find((row: any) => row.id === selectedContest);
    if (!contest || contest.slate_id === selectedSlate) return;
    void load({ contestId: selectedContest, slateId: contest.slate_id });
  }, [selectedContest, selectedSlate, data.contests]);

  const slotByPlayer = useMemo(() => {
    const map = new Map<string, SlotKey>();
    slots.forEach((slot) => { if (slot.player_id) map.set(slot.player_id, slot.slot); });
    return map;
  }, [slots]);

  const activeSlotPlayer = useMemo(() => {
    const active = slots.find((slot) => slot.slot === activeSlot)?.player_id;
    return data.slatePlayers.find((player: any) => player.player_id === active) ?? null;
  }, [slots, activeSlot, data.slatePlayers]);

  const salaryUsed = useMemo(() => slots.reduce((sum, slot) => {
    const player = data.slatePlayers.find((row: any) => row.player_id === slot.player_id);
    return sum + (player ? adjustedSalary(slot.slot, player) : 0);
  }, 0), [slots, data.slatePlayers]);

  const projectedPoints = useMemo(() => slots.reduce((sum, slot) => {
    const player = data.slatePlayers.find((row: any) => row.player_id === slot.player_id);
    return sum + (player ? adjustedProjection(slot.slot, player) : 0);
  }, 0), [slots, data.slatePlayers]);

  const salaryRemaining = salaryCap - salaryUsed;
  const missingSlots = slots.filter((slot) => !slot.player_id).map((slot) => slot.slot as SlotKey);
  const lineupComplete = missingSlots.length === 0;
  const salaryWithoutActiveSlot = salaryUsed - (activeSlotPlayer ? adjustedSalary(activeSlot, activeSlotPlayer) : 0);

  const teamOptions = useMemo<string[]>(() => Array.from(new Set<string>((data.slatePlayers ?? []).map((player: any) => playerTeam(player)).filter(Boolean))).sort(), [data.slatePlayers]);

  function disabledReason(player: any) {
    const usedSlot = slotByPlayer.get(player.player_id);
    if (usedSlot && usedSlot !== activeSlot) return 'Already selected';
    if (!slotAllowsPlayer(activeSlot, player)) return 'Invalid slot';
    if (String(player.availability_status || 'AVAILABLE').toUpperCase() === 'OUT') return 'Out';
    if (salaryWithoutActiveSlot + adjustedSalary(activeSlot, player) > salaryCap) return 'Over salary cap';
    return '';
  }

  const slatePlayers = data.slatePlayers ?? [];
  const slotCompatiblePlayers = useMemo(() => slatePlayers.filter((player: any) => slotAllowsPlayer(activeSlot, player)), [slatePlayers, activeSlot]);

  const visiblePlayers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return slatePlayers
      .filter((player: any) => {
        if (positionFilter === 'GOALIES' && !isGoalie(player)) return false;
        if (positionFilter === 'SKATERS' && isGoalie(player)) return false;
        if (teamFilter !== 'ALL' && playerTeam(player) !== teamFilter) return false;
        if (!term) return true;
        return `${playerName(player)} ${playerTeam(player)} ${player.player?.position ?? player.position ?? ''}`.toLowerCase().includes(term);
      })
      .sort((a: any, b: any) => {
        const alpha = (value: any) => String(value || '');
        let result = 0;
        if (sortKey === 'name') result = alpha(playerName(a)).localeCompare(alpha(playerName(b)));
        else if (sortKey === 'team') result = alpha(playerTeam(a)).localeCompare(alpha(playerTeam(b)));
        else if (sortKey === 'position') result = alpha(a.player?.position || a.position).localeCompare(alpha(b.player?.position || b.position));
        else if (sortKey === 'fantasyPpg') result = fantasyPpg(a) - fantasyPpg(b);
        else result = Number(a.salary || 0) - Number(b.salary || 0);
        return sortDir === 'asc' ? result : -result;
      });
  }, [slatePlayers, search, positionFilter, teamFilter, sortKey, sortDir]);

  function sortPool(key: SortKey) {
    setSortKey((currentKey) => {
      setSortDir((currentDir) => currentKey === key ? (currentDir === 'asc' ? 'desc' : 'asc') : key === 'name' || key === 'team' || key === 'position' ? 'asc' : 'desc');
      return key;
    });
  }

  function sortSuffix(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' up' : ' down';
  }

  const playerPoolEmptyReason = useMemo(() => {
    if (loadError) return `API failed: ${loadError}`;
    if (currentContest?.slate_id && selectedSlate && currentContest.slate_id !== selectedSlate) {
      return 'Wrong slate selected for this contest.';
    }
    if (!slatePlayers.length) return 'No slate players found for the selected slate.';
    if (!slotCompatiblePlayers.length) return `All players filtered out for ${slotLabel(activeSlot)}.`;
    if (!visiblePlayers.length) return 'All players filtered out by search, team, or position filters.';
    return '';
  }, [loadError, currentContest?.slate_id, selectedSlate, slatePlayers.length, slotCompatiblePlayers.length, visiblePlayers.length, activeSlot]);

  async function post(action: string, payload: any) {
    const res = await fetch('/api/dfs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Request failed');
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
    } catch (error: any) {
      setMsg(error.message);
    }
  }

  function startSubmit() {
    setEditingEntryId(null);
    const emptySlots = SLOT_CONFIG.map((slot) => ({ slot, player_id: '' }));
    setSlots(emptySlots);
    setActiveSlot('CAPTAIN');
    setPositionFilter(filterForSlot('CAPTAIN'));
    setBuilderOpen(true);
    if (currentContest?.slate_id && currentContest.slate_id !== selectedSlate) {
      void load({ contestId: selectedContest, slateId: currentContest.slate_id });
    } else if (selectedContest && !slatePlayers.length) {
      void load({ contestId: selectedContest, slateId: selectedSlate || currentContest?.slate_id });
    }
  }

  function editEntry(entry: any) {
    const contest = data.contests.find((row: any) => row.id === entry.contest_id);
    const locked = Boolean(contest?.lock_at && new Date(contest.lock_at).getTime() <= Date.now());
    if (locked) return;
    const entrySlots = SLOT_CONFIG.map((slot) => ({ slot, player_id: (entry.slots ?? []).find((row: any) => row.slot === slot)?.player_id || '' }));
    const nextSlot = firstEmptySlot(entrySlots);
    setEditingEntryId(entry.id);
    setSlots(entrySlots);
    setActiveSlot(nextSlot);
    setPositionFilter(filterForSlot(nextSlot));
    setBuilderOpen(true);
    if (contest?.slate_id && contest.slate_id !== selectedSlate) {
      void load({ contestId: contest.id, slateId: contest.slate_id });
    }
  }

  function choosePlayer(player: any) {
    if (disabledReason(player)) return;
    const nextSlots = slots.map((slot) => slot.slot === activeSlot ? { ...slot, player_id: player.player_id } : slot);
    const nextSlot = nextEmptySlotAfter(activeSlot, nextSlots);
    setSlots(nextSlots);
    setActiveSlot(nextSlot);
    setPositionFilter(filterForSlot(nextSlot));
  }

  function chooseSlot(slot: SlotKey) {
    setActiveSlot(slot);
    setPositionFilter(filterForSlot(slot));
  }

  function removeSlot(slot: SlotKey) {
    setSlots((prev) => prev.map((row) => row.slot === slot ? { ...row, player_id: '' } : row));
    setActiveSlot(slot);
    setPositionFilter(filterForSlot(slot));
  }

  function changePositionFilter(value: 'ALL' | 'SKATERS' | 'GOALIES') {
    if (value === 'ALL') {
      setPositionFilter(value);
      return;
    }
    setPositionFilter(value === filterForSlot(activeSlot) ? value : filterForSlot(activeSlot));
  }

  function clearFilters() {
    setSearch('');
    setTeamFilter('ALL');
    setPositionFilter(filterForSlot(activeSlot));
  }

  async function openGameStats(game: any) {
    setSelectedGame(game);
    const res = await fetch(`/api/games/${game.id}/stats`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error || 'Unable to load game stats.');
      setSelectedGameStats([]);
      return;
    }
    setSelectedGameStats(json.stats ?? []);
  }

  if (loading) {
    return <section className="card"><p className="muted">Loading next contest, player pool, and slate games...</p></section>;
  }

  if (!currentContest) {
    return <section className="card"><p className="muted">No active contest is available right now.</p>{msg && <p>{msg}</p>}</section>;
  }

  return (
    <>
      {msg && <p>{msg}</p>}

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="section-header-row">
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>{currentContest.name}</h2>
            <p className="muted">Locks {formatPublicDateTime(currentContest.lock_at)} - Salary Cap {currency(currentContest.salary_cap)} - {String(currentContest.status || '').toUpperCase()}</p>
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
        <div className="responsive-table">
          <table className="table">
            <thead><tr><th>Rank</th><th>Entry</th><th>User</th><th>Points</th><th>Submitted</th></tr></thead>
            <tbody>
              {(data.leaderboardEntries ?? []).map((entry: any, idx: number) => <tr key={entry.id}><td>{entry.rank ?? idx + 1}</td><td>{entry.display_label || `Entry #${idx + 1}`}</td><td>{entry.user_display}</td><td>{Number(entry.actual_points || 0).toFixed(2)}</td><td>{formatPublicDateTime(entry.created_at)}</td></tr>)}
            </tbody>
          </table>
          {!data.leaderboardEntries?.length && <p className="muted">No entries yet for this contest.</p>}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">My Entries</h2>
        <div className="stack-list">
          {(data.myEntries ?? []).filter((entry: any) => entry.contest_id === selectedContest).map((entry: any, idx: number) => {
            const contest = data.contests.find((row: any) => row.id === entry.contest_id);
            const locked = Boolean(contest?.lock_at && new Date(contest.lock_at).getTime() <= Date.now());
            return (
              <article key={entry.id} className="list-card compact">
                <p><strong>{entry.display_label || `Entry #${idx + 1}`}</strong></p>
                <p className="muted">Score {Number(entry.actual_points || 0).toFixed(2)} - {locked ? 'Locked' : 'Editable'}</p>
                <button type="button" onClick={() => editEntry(entry)} disabled={locked}>{locked ? 'Locked' : 'Update Entry'}</button>
              </article>
            );
          })}
          {!data.myEntries?.filter((entry: any) => entry.contest_id === selectedContest).length && <p className="muted">No entries submitted yet.</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Games in This Slate</h2>
        <div className="stack-list">
          {(data.slateGames ?? []).map((game: any) => (
            <article className="list-card" key={game.id}>
              <div className="section-header-row">
                <div>
                  <p><strong>{game.away_team_name}</strong> @ <strong>{game.home_team_name}</strong></p>
                  <p className="muted">{formatPublicDateTime(game.scheduled_at)} - {game.status} - {game.away_score}-{game.home_score}</p>
                </div>
                <button type="button" onClick={() => openGameStats(game)}>Full Stats</button>
              </div>
              <div className="dfs-game-scorers">
                <div>
                  <h3 className="card-title">{game.away_team_name} point scorers</h3>
                  {pointScorerRows(game.point_scorers?.away ?? [])}
                </div>
                <div>
                  <h3 className="card-title">{game.home_team_name} point scorers</h3>
                  {pointScorerRows(game.point_scorers?.home ?? [])}
                </div>
              </div>
            </article>
          ))}
          {!data.slateGames?.length && <p className="muted">No games attached to this slate.</p>}
        </div>
      </section>

      {builderOpen && (
        <div className="modal-overlay">
          <div className="modal-card card dfs-builder-modal-wide">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">{editingEntryId ? 'Update Lineup' : 'Build Lineup'}</h2>
                <p className="muted">Used {currency(salaryUsed)} - Remaining {currency(salaryRemaining)} - Filled {6 - missingSlots.length}/6 - Projected {projectedPoints.toFixed(2)}</p>
              </div>
              <button type="button" onClick={() => setBuilderOpen(false)}>Close</button>
            </div>

            <div className="dfs-builder-grid">
              <aside className="dfs-lineup-panel">
                <div className="dfs-lineup-summary">
                  <strong>{currency(salaryCap)} Cap</strong>
                  <span>{salaryRemaining >= 0 ? `${currency(salaryRemaining)} remaining` : `${currency(Math.abs(salaryRemaining))} over cap`}</span>
                </div>
                <div className="dfs-lineup-stack">
                  {slots.map((slot) => {
                    const player = data.slatePlayers.find((row: any) => row.player_id === slot.player_id);
                    return (
                      <div
                        key={slot.slot}
                        role="button"
                        tabIndex={0}
                        className={`dfs-slot ${activeSlot === slot.slot ? 'is-active' : ''} ${slot.slot === 'CAPTAIN' ? 'is-captain' : ''} ${slot.slot === 'GOALIE' ? 'is-goalie' : ''}`}
                        onClick={() => chooseSlot(slot.slot)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') chooseSlot(slot.slot);
                        }}
                      >
                        <div>
                          <div className="dfs-slot-label">{slotLabel(slot.slot)}</div>
                          <div className="dfs-slot-player">{player ? `${playerName(player)} - ${playerTeam(player)}` : 'Choose player'}</div>
                          {player && <div className="muted">{currency(adjustedSalary(slot.slot, player))} - {adjustedProjection(slot.slot, player).toFixed(2)} proj</div>}
                        </div>
                        {player && (
                          <button
                            type="button"
                            className="dfs-slot-remove"
                            aria-label={`Remove ${playerName(player)} from ${slotLabel(slot.slot)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeSlot(slot.slot);
                            }}
                          >
                            X
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {salaryRemaining < 0 && <p>Lineup is over the salary cap.</p>}
                <div className="form-actions">
                  <button type="button" onClick={submitLineup} disabled={!lineupComplete || salaryRemaining < 0}>{editingEntryId ? 'Update Entry' : 'Submit Entry'}</button>
                  <button type="button" onClick={() => {
                    setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
                    chooseSlot('CAPTAIN');
                  }}>Clear</button>
                </div>
              </aside>

              <section className="dfs-player-pool">
                <div className="dfs-pool-controls">
                  <input placeholder="Search player or team" value={search} onChange={(event) => setSearch(event.target.value)} />
                  <select value={positionFilter} onChange={(event) => changePositionFilter(event.target.value as any)}>
                    <option value="ALL">All</option>
                    <option value="SKATERS">Skaters</option>
                    <option value="GOALIES">Goalies</option>
                  </select>
                  <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
                    <option value="ALL">All Teams</option>
                    {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
                  </select>
                  <button type="button" onClick={clearFilters}>Clear filters</button>
                </div>
                <div className="responsive-table dfs-scroll-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th><button type="button" className="table-sort" onClick={() => sortPool('name')}>Name{sortSuffix('name')}</button></th>
                        <th><button type="button" className="table-sort" onClick={() => sortPool('team')}>Team{sortSuffix('team')}</button></th>
                        <th><button type="button" className="table-sort" onClick={() => sortPool('position')}>Pos{sortSuffix('position')}</button></th>
                        <th><button type="button" className="table-sort" onClick={() => sortPool('salary')}>Salary{sortSuffix('salary')}</button></th>
                        <th><button type="button" className="table-sort" onClick={() => sortPool('fantasyPpg')}>Fantasy PPG{sortSuffix('fantasyPpg')}</button></th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePlayers.map((player: any) => {
                        const reason = disabledReason(player);
                        const fppg = fantasyPpg(player);
                        return (
                          <tr key={player.id} className={reason ? 'dfs-row-muted' : ''}>
                            <td><span className="dfs-player-name-cell"><strong>{playerName(player)}</strong>{availabilityBadge(player.availability_status)}</span></td>
                            <td>{playerTeam(player)}</td>
                            <td>{player.player?.position || player.position || '-'}</td>
                            <td>{currency(adjustedSalary(activeSlot, player))}{activeSlot === 'CAPTAIN' ? ' CPT' : ''}</td>
                            <td>{fppg.toFixed(2)} {!hasActualFantasyPpg(player) && <span className="muted">proj</span>}</td>
                            <td><button type="button" disabled={Boolean(reason)} title={reason || 'Add player'} onClick={() => choosePlayer(player)}>{reason || 'Add'}</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {playerPoolEmptyReason && (
                    <div className="list-card compact">
                      <p className="muted">{playerPoolEmptyReason}</p>
                      {!visiblePlayers.length && slatePlayers.length ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {selectedGame && (
        <div className="modal-overlay">
          <div className="modal-card card">
            <h3 className="card-title">{selectedGame.away_team_name} @ {selectedGame.home_team_name}</h3>
            <div className="stack-list">
              {selectedGameStats.map((stat: any) => (
                <article key={stat.id} className="list-card compact">
                  <p><strong>{stat.player_name || 'Team'}</strong> <span className="muted">{stat.position || '-'}</span></p>
                  <p className="muted">G {stat.goals} - A {stat.assists} - GA {stat.goals_against}</p>
                </article>
              ))}
              {!selectedGameStats.length && <p className="muted">No game stats posted yet.</p>}
            </div>
            <button type="button" onClick={() => setSelectedGame(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
