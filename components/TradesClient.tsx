'use client';

import { useEffect, useMemo, useState } from 'react';
import PlayerStatCard from './PlayerStatCard';

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
  accepted_by_other: 'Accepted by other captain',
  declined: 'Declined',
  admin_approved: 'Admin approved',
  admin_declined: 'Admin rejected',
  executed: 'Executed',
};

export default function TradesClient() {
  const [payload, setPayload] = useState<any>({ trades: [], teams: [], players: [], actor: { role: 'FAN' } });
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

  const incoming = payload.trades.filter((t: Trade) => t.status === 'proposed');

  return (
    <main>
      <h1>Trades</h1>
      <p className="muted">Fantasy-style trade flow: captain proposal → other captain response → admin review → execution.</p>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
      {success && <p style={{ color: '#76e8a1' }}>{success}</p>}

      {['CAPTAIN', 'ADMIN'].includes(payload.actor.role) && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Propose Trade</h2>
          <div className="grid">
            <label>From Team</label>
            <select value={form.from_team_id} onChange={(e) => setForm((f: any) => ({ ...f, from_team_id: e.target.value }))}>
              <option value="">Select...</option>
              {payload.teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label>To Team</label>
            <select value={form.to_team_id} onChange={(e) => setForm((f: any) => ({ ...f, to_team_id: e.target.value }))}>
              <option value="">Select...</option>
              {payload.teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label>Players Out (Team A)</label>
            <select multiple value={form.players_out} onChange={(e) => setForm((f: any) => ({ ...f, players_out: Array.from(e.target.selectedOptions).map((o) => o.value) }))}>
              {playersByTeam(form.from_team_id).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label>Players In (Team B)</label>
            <select multiple value={form.players_in} onChange={(e) => setForm((f: any) => ({ ...f, players_in: Array.from(e.target.selectedOptions).map((o) => o.value) }))}>
              {playersByTeam(form.to_team_id).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label>Message</label>
            <textarea value={form.message} onChange={(e) => setForm((f: any) => ({ ...f, message: e.target.value }))} rows={3} />
            <button type="button" onClick={() => doAction('propose', form)}>Submit Proposal</button>
          </div>
        </section>
      )}

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Pending Captain Responses</h2>
        {incoming.map((t: Trade) => (
          <div key={t.id} style={{ marginBottom: 10, borderBottom: '1px solid #333', paddingBottom: 10 }}>
            <p><strong>{teamsById.get(t.from_team_id)}</strong> ↔ <strong>{teamsById.get(t.to_team_id)}</strong> · {STATUS_LABEL[t.status] || t.status}</p>
            <p className="muted">{t.message || 'No note'}</p>
            {payload.actor.role !== 'FAN' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => doAction('captain_response', { trade_id: t.id, accept: true })}>Accept</button>
                <button type="button" onClick={() => doAction('captain_response', { trade_id: t.id, accept: false })}>Decline</button>
              </div>
            )}
          </div>
        ))}
        {incoming.length === 0 && <p className="muted">No pending proposals.</p>}
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Trade Queue</h2>
        {payload.trades.map((t: Trade) => (
          <div key={t.id} style={{ marginBottom: 10, borderBottom: '1px solid #333', paddingBottom: 10 }}>
            <p><strong>{teamsById.get(t.from_team_id)}</strong> ↔ <strong>{teamsById.get(t.to_team_id)}</strong> · {STATUS_LABEL[t.status] || t.status}</p>
            <p className="muted">Out: {t.players_out.length} · In: {t.players_in.length}</p>
            {payload.actor.role === 'ADMIN' && t.status === 'accepted_by_other' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => doAction('admin_review', { trade_id: t.id, approve: true })}>Approve + Execute</button>
                <button type="button" onClick={() => doAction('admin_review', { trade_id: t.id, approve: false })}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="section-title">Player Cards</h2>
        <div className="grid">
          {payload.players.slice(0, 20).map((p: any) => (
            <PlayerStatCard
              key={p.id}
              name={p.name}
              teamName={teamsById.get(p.team_id) || 'Free Agent'}
              position={p.position}
              gp={p.stats?.games_played || 0}
              goals={p.stats?.goals || 0}
              assists={p.stats?.assists || 0}
              fantasyPoints={p.stats?.fantasy_points || 0}
              fantasyAvg={p.stats?.fantasy_points_avg || 0}
              compact
            />
          ))}
        </div>
      </section>
    </main>
  );
}
