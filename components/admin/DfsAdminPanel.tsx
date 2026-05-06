'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatPublicDateTime } from '../../lib/formatters';

type DfsAdminPanelProps = {
  seasonId: string | null;
};

const AVAILABILITY_OPTIONS = ['AVAILABLE', 'QUESTIONABLE', 'OUT'];
const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'F'];

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? `$${Math.round(n)}` : '$0';
}

function byPlayerId(rows: any[]) {
  return new Map((rows ?? []).map((row: any) => [row.player_id, row]));
}

export default function DfsAdminPanel({ seasonId }: DfsAdminPanelProps) {
  const [data, setData] = useState<any>({ slates: [], contests: [], slatePlayers: [], valuationInputs: [], projectionOverrides: [], slateGames: [] });
  const [selectedSlateId, setSelectedSlateId] = useState('');
  const [selectedContestId, setSelectedContestId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedSlate = useMemo(() => (data.slates ?? []).find((slate: any) => slate.id === selectedSlateId) ?? null, [data.slates, selectedSlateId]);
  const contestsForSlate = useMemo(() => (data.contests ?? []).filter((contest: any) => !selectedSlateId || contest.slate_id === selectedSlateId), [data.contests, selectedSlateId]);
  const selectedContest = useMemo(() => contestsForSlate.find((contest: any) => contest.id === selectedContestId) ?? contestsForSlate[0] ?? null, [contestsForSlate, selectedContestId]);
  const valuationByPlayer = useMemo(() => byPlayerId(data.valuationInputs ?? []), [data.valuationInputs]);
  const overrideByPlayer = useMemo(() => byPlayerId(data.projectionOverrides ?? []), [data.projectionOverrides]);

  async function load(opts?: { slateId?: string; contestId?: string }) {
    setError('');
    const querySlateId = opts?.slateId ?? selectedSlateId;
    const queryContestId = opts?.contestId ?? (opts?.slateId ? '' : selectedContestId);
    const params = new URLSearchParams();
    if (querySlateId) params.set('slate_id', querySlateId);
    if (queryContestId) params.set('contest_id', queryContestId);
    if (seasonId) params.set('season_id', seasonId);

    const res = await fetch(`/api/dfs${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to load DFS admin data.');

    const nextSlateId = json.selectedSlateId || querySlateId || json.recommendedSlateId || json.slates?.[0]?.id || '';
    const slateContests = (json.contests ?? []).filter((contest: any) => !nextSlateId || contest.slate_id === nextSlateId);
    const apiContestStillValid = json.selectedContestId && slateContests.some((contest: any) => contest.id === json.selectedContestId);
    const queryContestStillValid = queryContestId && slateContests.some((contest: any) => contest.id === queryContestId);
    const nextContestId = apiContestStillValid ? json.selectedContestId : queryContestStillValid ? queryContestId : slateContests[0]?.id || '';

    setData(json);
    setSelectedSlateId(nextSlateId);
    setSelectedContestId(nextContestId);
    setDrafts({});

    if (!querySlateId && nextSlateId) {
      await load({ slateId: nextSlateId, contestId: nextContestId });
    }
  }

  useEffect(() => {
    void load();
  }, [seasonId]);

  async function post(action: string, payload: any) {
    setPending(action);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/dfs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'DFS request failed.');
      setMessage(json?.message || 'DFS action saved.');
      return json;
    } catch (err: any) {
      setError(err?.message || 'DFS request failed.');
      return null;
    } finally {
      setPending('');
    }
  }

  function patchDraft(id: string, patch: Record<string, string>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? {}), ...patch } }));
  }

  function draftFor(row: any) {
    const valuation = valuationByPlayer.get(row.player_id) ?? {};
    const override = overrideByPlayer.get(row.player_id) ?? {};
    return {
      availability_status: row.availability_status ?? 'AVAILABLE',
      player_grade: valuation.player_grade ?? row.valuation_grade ?? 'C',
      projection_points: override.projection_points ?? '',
      salary_override: override.salary_override ?? '',
      notes: override.notes ?? valuation.notes ?? '',
      ...(drafts[row.id] ?? {}),
    };
  }

  async function reloadSelected() {
    await load({ slateId: selectedSlateId, contestId: selectedContestId });
  }

  async function generateDefaultSlate() {
    const json = await post('auto_generate_weekly_default', {});
    if (json?.slateId) await load({ slateId: json.slateId });
    else await reloadSelected();
  }

  async function rebuildSlate() {
    if (!selectedSlateId) return setError('Select a slate before rebuilding.');
    await post('rebuild_slate_players', { slate_id: selectedSlateId, season_id: seasonId });
    await reloadSelected();
  }

  async function createContest() {
    if (!selectedSlate) return setError('Select a slate before creating a contest.');
    await post('create_contest', {
      slate_id: selectedSlate.id,
      name: `Main (${selectedSlate.name})`,
      salary_cap: 50000,
      max_entries: 10,
      lock_at: selectedSlate.lock_at,
      status: 'open',
      roster_config: { CAPTAIN: 1, SKATER: 4, GOALIE: 1 },
    });
    await reloadSelected();
  }

  async function updateSlateStatus(status: string) {
    if (!selectedSlateId) return setError('Select a slate first.');
    await post('update_slate_status', { slate_id: selectedSlateId, status });
    await reloadSelected();
  }

  async function updateContestStatus(status: string) {
    if (!selectedContest) return setError('Select a contest first.');
    await post('update_contest_status', { contest_id: selectedContest.id, status });
    await reloadSelected();
  }

  async function scoreContest() {
    if (!selectedContest) return setError('Select a contest first.');
    await post('score_contest', { contest_id: selectedContest.id });
    await reloadSelected();
  }

  async function saveSlatePlayer(row: any) {
    const draft = draftFor(row);
    const availabilityResult = await post('update_slate_player_availability', {
      slate_player_id: row.id,
      availability_status: draft.availability_status,
    });
    if (!availabilityResult) return;
    if (!seasonId) {
      setError('Season is required to save grade or projection overrides.');
      return;
    }
    const valuationResult = await post('upsert_player_valuation_input', {
      season_id: seasonId,
      player_id: row.player_id,
      player_grade: draft.player_grade,
      notes: draft.notes,
    });
    if (!valuationResult) return;
    const overrideResult = await post('upsert_player_projection_override', {
      season_id: seasonId,
      player_id: row.player_id,
      slate_player_id: row.id,
      projection_points: draft.projection_points,
      salary_override: draft.salary_override,
      notes: draft.notes,
    });
    if (!overrideResult) return;
    await reloadSelected();
  }

  return (
    <section className="card">
      <div className="section-header-row">
        <div>
          <h2>DFS Admin Panel</h2>
          <p className="muted">
            {selectedSlate ? `${selectedSlate.name} - ${String(selectedSlate.status || '').toUpperCase()} - Locks ${formatPublicDateTime(selectedSlate.lock_at)}` : 'No slate selected'}
          </p>
          <p className="muted">
            {selectedContest ? `${selectedContest.name} - ${String(selectedContest.status || '').toUpperCase()} - Salary cap ${selectedContest.salary_cap}` : 'No contest selected'}
          </p>
        </div>
        <div className="button-row">
          <button type="button" disabled={Boolean(pending)} onClick={generateDefaultSlate}>Generate Default Slate</button>
          <button type="button" disabled={Boolean(pending) || !selectedSlateId} onClick={rebuildSlate}>Rebuild/Reprice</button>
          <button type="button" disabled={Boolean(pending) || !selectedSlateId} onClick={createContest}>Create Contest</button>
        </div>
      </div>

      {message && <p>{message}</p>}
      {error && <p>{error}</p>}

      <div className="form-grid">
        <div className="form-field">
          <label>Slate</label>
          <select value={selectedSlateId} onChange={(event) => {
            const slateId = event.target.value;
            setSelectedSlateId(slateId);
            void load({ slateId });
          }}>
            <option value="">Select slate</option>
            {(data.slates ?? []).map((slate: any) => <option key={slate.id} value={slate.id}>{slate.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Contest</label>
          <select value={selectedContest?.id ?? ''} onChange={(event) => {
            const contestId = event.target.value;
            setSelectedContestId(contestId);
            void load({ slateId: selectedSlateId, contestId });
          }}>
            <option value="">Select contest</option>
            {contestsForSlate.map((contest: any) => <option key={contest.id} value={contest.id}>{contest.name}</option>)}
          </select>
        </div>
      </div>

      <div className="button-row">
        <button type="button" disabled={Boolean(pending) || !selectedSlateId} onClick={() => updateSlateStatus('published')}>Publish Slate</button>
        <button type="button" disabled={Boolean(pending) || !selectedSlateId} onClick={() => updateSlateStatus('locked')}>Lock Slate</button>
        <button type="button" disabled={Boolean(pending) || !selectedContest} onClick={() => updateContestStatus('open')}>Open Contest</button>
        <button type="button" disabled={Boolean(pending) || !selectedContest} onClick={() => updateContestStatus('closed')}>Close Contest</button>
        <button type="button" disabled={Boolean(pending) || !selectedContest} onClick={scoreContest}>Score/Rescore Contest</button>
      </div>

      <h3>Slate Players</h3>
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Position</th>
              <th>Salary</th>
              <th>Projection</th>
              <th>Grade</th>
              <th>Availability</th>
              <th>Source</th>
              <th>Manual Projection</th>
              <th>Manual Salary</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data.slatePlayers ?? []).map((row: any) => {
              const draft = draftFor(row);
              return (
                <tr key={row.id}>
                  <td>{row.player?.name ?? row.player_id}</td>
                  <td>{row.player?.team_name ?? '-'}</td>
                  <td>{row.player?.position ?? row.position ?? '-'}</td>
                  <td>{money(row.salary)}</td>
                  <td>{Number(row.projection_points ?? 0).toFixed(2)}</td>
                  <td>
                    <select value={draft.player_grade} onChange={(event) => patchDraft(row.id, { player_grade: event.target.value })}>
                      {GRADE_OPTIONS.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={draft.availability_status} onChange={(event) => patchDraft(row.id, { availability_status: event.target.value })}>
                      {AVAILABILITY_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>{row.valuation_source ?? '-'}</td>
                  <td><input value={draft.projection_points} onChange={(event) => patchDraft(row.id, { projection_points: event.target.value })} placeholder="Auto" /></td>
                  <td><input value={draft.salary_override} onChange={(event) => patchDraft(row.id, { salary_override: event.target.value })} placeholder="Auto" /></td>
                  <td><input value={draft.notes} onChange={(event) => patchDraft(row.id, { notes: event.target.value })} placeholder="Notes" /></td>
                  <td><button type="button" disabled={Boolean(pending)} onClick={() => saveSlatePlayer(row)}>Save</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!(data.slatePlayers ?? []).length && <p className="muted">No players are currently priced for this slate.</p>}
    </section>
  );
}
