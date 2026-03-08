'use client';

import { useEffect, useMemo, useState } from 'react';
import PlayerStatCard from './PlayerStatCard';

const SLOT_CONFIG = ['G', 'F1', 'F2', 'D1', 'D2', 'FLEX', 'UTIL'];

export default function DfsClient() {
  const [data, setData] = useState<any>({ slates: [], contests: [], slatePlayers: [] });
  const [selectedSlate, setSelectedSlate] = useState('');
  const [selectedContest, setSelectedContest] = useState('');
  const [lineupName, setLineupName] = useState('My Entry');
  const [slots, setSlots] = useState<any[]>(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
  const [msg, setMsg] = useState('');

  async function load(slateId?: string) {
    const res = await fetch(`/api/dfs${slateId ? `?slate_id=${slateId}` : ''}`);
    const json = await res.json();
    setData(json);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedSlate) load(selectedSlate); }, [selectedSlate]);

  const currentContest = data.contests.find((c: any) => c.id === selectedContest);
  const salaryUsed = useMemo(() => slots.reduce((sum, s) => {
    const sp = data.slatePlayers.find((p: any) => p.player_id === s.player_id);
    return sum + (sp?.salary || 0);
  }, 0), [slots, data.slatePlayers]);

  async function submit() {
    setMsg('');
    const res = await fetch('/api/dfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit_entry', payload: { contest_id: selectedContest, lineup_name: lineupName, slots: slots.filter((s) => s.player_id) } }),
    });
    const json = await res.json();
    setMsg(res.ok ? `Entry submitted: ${json.entryId}` : `Error: ${json.error}`);
    if (res.ok) setSlots(SLOT_CONFIG.map((slot) => ({ slot, player_id: '' })));
  }

  return (
    <main>
      <h1>DFS</h1>
      <p className="muted">Weekly slate + contest lineup builder scaffold with salary/projection snapshots.</p>
      {msg && <p>{msg}</p>}
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Active Slates</h2>
        <select value={selectedSlate} onChange={(e) => setSelectedSlate(e.target.value)}>
          <option value="">Select slate...</option>
          {data.slates.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Contests</h2>
        <select value={selectedContest} onChange={(e) => setSelectedContest(e.target.value)}>
          <option value="">Select contest...</option>
          {data.contests.filter((c: any) => !selectedSlate || c.slate_id === selectedSlate).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name} · Cap {c.salary_cap}</option>
          ))}
        </select>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Lineup Builder</h2>
        <label>Lineup Name</label>
        <input value={lineupName} onChange={(e) => setLineupName(e.target.value)} />
        {slots.map((s, idx) => (
          <div key={s.slot} style={{ marginTop: 8 }}>
            <label>{s.slot}</label>
            <select value={s.player_id} onChange={(e) => setSlots((prev) => prev.map((row, i) => i === idx ? { ...row, player_id: e.target.value } : row))}>
              <option value="">Select player...</option>
              {data.slatePlayers.map((p: any) => <option key={`${s.slot}-${p.player_id}`} value={p.player_id}>{p.player?.name || p.player_id.slice(0, 8)} · {p.player?.position || p.position} · ${p.salary}</option>)}
            </select>
          </div>
        ))}
        <p className="muted">Salary used: {salaryUsed} / {currentContest?.salary_cap ?? '—'}</p>
        <button type="button" onClick={submit} disabled={!selectedContest}>Submit Entry</button>
      </section>

      <section className="card">
        <h2 className="section-title">Player Pool</h2>
        <div className="grid">
          {data.slatePlayers.slice(0, 20).map((p: any) => (
            <PlayerStatCard key={p.id} name={p.player?.name || p.player_id.slice(0, 8)} teamName={p.player?.team_id} position={p.player?.position || p.position} fantasyPoints={p.projection_points || 0} fantasyAvg={p.baseline_points || 0} compact />
          ))}
        </div>
      </section>
    </main>
  );
}
