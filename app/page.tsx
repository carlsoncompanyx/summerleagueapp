import InstallPrompt from '../components/InstallPrompt';
import NavTabs from '../components/NavTabs';
import { getLeagueSnapshot } from '../lib/league-data';
import { Role } from '../lib/types';

const role: Role = 'ADMIN';

export default async function HomePage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <section className="hero">
        <h1>Emerald Coast Roller League (ECRL)</h1>
        <p className="muted">Live league hub · America/Chicago</p>
        <InstallPrompt />
      </section>

      <div style={{ marginTop: 12 }}>
        <NavTabs role={role} />
      </div>

      {'unavailable' in data && data.unavailable ? (
        <section className="card" style={{ marginTop: 14 }}>
          <h2>League Data Unavailable</h2>
          <p>{data.reason}</p>
          <p className="muted">Set Supabase env vars and ensure RLS/data access is configured.</p>
        </section>
      ) : (
        <div className="grid">
          <section className="card">
            <h2>Season</h2>
            <p><strong>{data.season?.name ?? 'No season configured'}</strong></p>
            {data.season && <p className="muted">{data.season.start_date} → {data.season.end_date}</p>}
            <p><span className="badge">{data.teams.length} teams</span></p>
          </section>

          <section className="card">
            <h2>Next Games</h2>
            {data.schedule.slice(0, 5).map((g) => (
              <p key={g.id}>
                <strong>{g.home_team_name}</strong> vs <strong>{g.away_team_name}</strong><br />
                <span className="muted">{new Date(g.scheduled_at).toLocaleString()} · {g.location ?? 'TBD'} · {g.status}</span>
              </p>
            ))}
            {data.schedule.length === 0 && <p className="muted">No games scheduled yet.</p>}
          </section>

          <section className="card">
            <h2>Standings Snapshot</h2>
            <table className="table">
              <thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>T</th><th>PTS</th></tr></thead>
              <tbody>
                {data.standings.slice(0, 6).map((s) => (
                  <tr key={s.team}><td>{s.team}</td><td>{s.gp}</td><td>{s.w}</td><td>{s.l}</td><td>{s.t}</td><td>{s.pts}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Shit Talk Preview</h2>
            {data.chatMessages.slice(0, 4).map((m: any) => (
              <p key={m.id}><span className="badge">{m.role}</span> {m.message}</p>
            ))}
            {data.chatMessages.length === 0 && <p className="muted">No messages yet.</p>}
          </section>
        </div>
      )}
    </main>
  );
}
