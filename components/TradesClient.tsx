'use client';

import { useEffect, useMemo, useState } from 'react';

type Trade = {
  id: string;
  from_team_id: string;
  to_team_id: string;
  players_out: string[];
  players_in: string[];
  status: string;
  message?: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  proposed: 'Proposed',
  accepted_by_other: 'Accepted by receiving captain · Awaiting league review',
  declined: 'Declined by receiving captain',
  admin_approved: 'Admin approved',
  admin_declined: 'Rejected by league/admin',
  completed: 'Executed',
};

function TradeCard({
  trade,
  teamsById,
  onAccept,
  onDecline,
  onApprove,
  onReject,
  canRespond,
  canReview,
}: {
  trade: Trade;
  teamsById: Map<string, string>;
  canRespond?: boolean;
  canReview?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <div style={{ marginBottom: 10, borderBottom: '1px solid #333', paddingBottom: 10 }}>
      <p><strong>{teamsById.get(trade.from_team_id)}</strong> ↔ <strong>{teamsById.get(trade.to_team_id)}</strong></p>
      <p className="muted">Status: {STATUS_LABEL[trade.status] || trade.status}</p>
      <p className="muted">Out: {trade.players_out.length} · In: {trade.players_in.length}</p>
      <p className="muted">{trade.message || 'No note'}</p>
      {canRespond && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onAccept}>Accept</button>
          <button type="button" onClick={onDecline}>Decline</button>
        </div>
      )}
      {canReview && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onApprove}>Approve + Execute</button>
          <button type="button" onClick={onReject}>Reject</button>
        </div>
      )}
    </div>
  );
}

export default function TradesClient() {
  const [payload, setPayload] = useState<any>({
    trades: [],
    teams: [],
    players: [],
    tradeBuckets: { incoming: [], outgoing: [], awaitingLeagueReview: [], finalized: [] },
    actor: { role: 'FAN' },
  });
  const [form, setForm] = useState<any>({ season_id: '', from_team_id: '', to_team_id: '', players_out: [], players_in: [], message: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const res = await fetch('/api/trades');
    const json = await res.json();
    setPayload(json);
  }

  useEffect(() => { load(); }, []);

  const teamsById = useMemo(() => new Map<string, string>(payload.teams.map((t: any) => [t.id, t.name])), [payload.teams]);
  const playersByTeam = (teamId: string) => payload.players.filter((p: any) => p.team_id === teamId);

  async function doAction(action: string, actionPayload: any) {
    setError('');
    setSuccess('');
    const res = await fetch('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload: actionPayload }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error || 'Trade operation failed');
    setSuccess('Trade action completed.');
    if (action === 'propose') {
      setForm({ season_id: '', from_team_id: '', to_team_id: '', players_out: [], players_in: [], message: '' });
    }
    await load();
  }

  return (
    <main>
      <h1>Trades</h1>
      <p className="muted">League workflow: proposing captain → receiving captain response → league/admin execution review.</p>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
      {success && <p style={{ color: '#76e8a1' }}>{success}</p>}

      {['CAPTAIN', 'ADMIN'].includes(payload.actor.role) && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Propose Trade</h2>
          <div className="form-grid">
            <div className="form-field col-6">
              <label>From Team</label>
              <select value={form.from_team_id} onChange={(e) => setForm((f: any) => ({ ...f, from_team_id: e.target.value }))}>
                <option value="">Select...</option>
                {payload.teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-field col-6">
              <label>To Team</label>
              <select value={form.to_team_id} onChange={(e) => setForm((f: any) => ({ ...f, to_team_id: e.target.value }))}>
                <option value="">Select...</option>
                {payload.teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-field col-6">
              <label>Players Out (Source Team)</label>
              <select multiple value={form.players_out} onChange={(e) => setForm((f: any) => ({ ...f, players_out: Array.from(e.target.selectedOptions).map((o) => o.value) }))}>
                {playersByTeam(form.from_team_id).map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.position || '-'} · #{p.jersey || '-'}</option>)}
              </select>
            </div>
            <div className="form-field col-6">
              <label>Players In (Target Team)</label>
              <select multiple value={form.players_in} onChange={(e) => setForm((f: any) => ({ ...f, players_in: Array.from(e.target.selectedOptions).map((o) => o.value) }))}>
                {playersByTeam(form.to_team_id).map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.position || '-'} · #{p.jersey || '-'}</option>)}
              </select>
            </div>
            <div className="form-field col-12">
              <label>Message</label>
              <textarea value={form.message} onChange={(e) => setForm((f: any) => ({ ...f, message: e.target.value }))} rows={3} />
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => doAction('propose', form)}>Submit Proposal</button>
            </div>
          </div>
        </section>
      )}

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Incoming Trade Requests</h2>
        {(payload.tradeBuckets?.incoming ?? []).map((t: Trade) => (
          <TradeCard
            key={t.id}
            trade={t}
            teamsById={teamsById}
            canRespond={['CAPTAIN', 'ADMIN'].includes(payload.actor.role)}
            onAccept={() => doAction('captain_response', { trade_id: t.id, accept: true })}
            onDecline={() => doAction('captain_response', { trade_id: t.id, accept: false })}
          />
        ))}
        {(payload.tradeBuckets?.incoming ?? []).length === 0 && <p className="muted">No incoming proposals.</p>}
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Outgoing Trade Requests</h2>
        {(payload.tradeBuckets?.outgoing ?? []).map((t: Trade) => (
          <TradeCard key={t.id} trade={t} teamsById={teamsById} />
        ))}
        {(payload.tradeBuckets?.outgoing ?? []).length === 0 && <p className="muted">No outgoing proposals.</p>}
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Awaiting League Review</h2>
        {(payload.tradeBuckets?.awaitingLeagueReview ?? []).map((t: Trade) => (
          <TradeCard
            key={t.id}
            trade={t}
            teamsById={teamsById}
            canReview={payload.actor.role === 'ADMIN'}
            onApprove={() => doAction('admin_review', { trade_id: t.id, approve: true })}
            onReject={() => doAction('admin_review', { trade_id: t.id, approve: false })}
          />
        ))}
        {(payload.tradeBuckets?.awaitingLeagueReview ?? []).length === 0 && <p className="muted">No trades awaiting league review.</p>}
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Finalized / Closed Trades</h2>
        {(payload.tradeBuckets?.finalized ?? []).map((t: Trade) => (
          <TradeCard key={t.id} trade={t} teamsById={teamsById} />
        ))}
        {(payload.tradeBuckets?.finalized ?? []).length === 0 && <p className="muted">No finalized trades yet.</p>}
      </section>

      <section className="card">
        <h2 className="section-title">League Player Snapshot</h2>
        <table className="table">
          <thead>
            <tr><th>Player</th><th>Team</th><th>Pos</th><th>Jersey</th><th>GP</th><th>G</th><th>A</th><th>P</th></tr>
          </thead>
          <tbody>
            {payload.players.slice(0, 60).map((p: any) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{teamsById.get(p.team_id) || 'Free Agent'}</td>
                <td>{p.position || '-'}</td>
                <td>{p.jersey || '-'}</td>
                <td>{p.stats?.games_played || 0}</td>
                <td>{p.stats?.goals || 0}</td>
                <td>{p.stats?.assists || 0}</td>
                <td>{p.stats?.points || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
