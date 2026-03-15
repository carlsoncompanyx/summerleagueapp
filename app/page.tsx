import Link from 'next/link';
import { getLeagueSnapshot } from '../lib/league-data';
import { getSeasonStats } from '../lib/stats/getStats';

export default async function HomePage() {
  const [data, stats] = await Promise.all([getLeagueSnapshot(), getSeasonStats()]);

  if ('unavailable' in data && data.unavailable) {
    return (
      <main>
        <section className="card" style={{ marginTop: 14 }}>
          <h2>League Data Unavailable</h2>
          <p>{data.reason}</p>
          <p className="muted">Set Supabase env vars and ensure RLS/data access is configured.</p>
        </section>
      </main>
    );
  }

  const upcomingGames = data.schedule.filter((g) => new Date(g.scheduled_at).getTime() > Date.now()).slice(0, 5);
  const recentFinals = data.schedule.filter((g) => g.status === 'FINAL').slice(-5).reverse();
  const topLeaders = (stats.players ?? []).slice(0, 5);

  return (
    <main>
      <section className="hero" style={{ marginBottom: 12 }}>
        <h2>{data.season?.name ?? 'Emerald Coast Roller League'}</h2>
        <p className="muted">A mobile-first league home for games, standings, DFS contests, community, and weekly betting lines.</p>
        <div className="form-actions" style={{ marginTop: 8 }}>
          <Link className="header-auth-link" href="/schedule">Today&apos;s Games</Link>
          <Link className="header-auth-link" href="/dfs">Enter DFS Contest</Link>
          <Link className="header-auth-link" href="/betting">View Weekly Lines</Link>
          <Link className="header-auth-link" href="/chat">Community</Link>
        </div>
      </section>

      <div className="grid">
        <section className="card">
          <h3 className="card-title">Next DFS Slate</h3>
          {data.nextSlate ? (
            <div className="stack-list">
              <p><strong>{data.nextSlate.name}</strong></p>
              <p className="muted">Locks: {new Date(data.nextSlate.lock_at).toLocaleString()}</p>
              <p className="muted">Games: {data.nextSlate.games.length}</p>
              <p className="muted">Contest: {data.nextSlate.contest?.name ?? 'Contest not posted yet'}</p>
            </div>
          ) : (
            <p className="muted">No upcoming DFS slate yet.</p>
          )}
        </section>

        <section className="card">
          <h3 className="card-title">Upcoming Games</h3>
          <div className="stack-list">
            {upcomingGames.map((g) => (
              <article className="list-card" key={g.id}>
                <p><strong>{g.away_team_name}</strong> @ <strong>{g.home_team_name}</strong></p>
                <p className="muted">{new Date(g.scheduled_at).toLocaleString()} · {g.location ?? 'TBD'}</p>
              </article>
            ))}
            {!upcomingGames.length && <p className="muted">No upcoming games listed.</p>}
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Recent Results</h3>
          <div className="stack-list">
            {recentFinals.map((g) => (
              <article className="list-card" key={g.id}>
                <p><strong>{g.away_team_name} {g.away_score}</strong> · <strong>{g.home_team_name} {g.home_score}</strong></p>
                <p className="muted">Final</p>
              </article>
            ))}
            {!recentFinals.length && <p className="muted">No final scores yet.</p>}
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Standings Snapshot</h3>
          <div className="stack-list">
            {data.standings.slice(0, 6).map((s) => (
              <article key={s.team} className="list-card compact">
                <div><strong>{s.team}</strong></div>
                <div className="muted">{s.w}-{s.l}-{s.t} · GP {s.gp} · PTS {s.pts}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">League Leaders</h3>
          <div className="stack-list">
            {topLeaders.map((p: any) => (
              <article key={p.player_id} className="list-card compact">
                <div><strong>{p.name}</strong> <span className="muted">({p.team_name})</span></div>
                <div className="muted">Points: {p.points}</div>
              </article>
            ))}
            {!topLeaders.length && <p className="muted">Stats will appear once games are recorded.</p>}
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Community Activity</h3>
          <div className="stack-list">
            {(data.chatMessages ?? []).slice(0, 4).map((m: any) => (
              <article key={m.id} className="list-card compact">
                <span className="badge">{m.role}</span>
                <p style={{ margin: '6px 0 0' }}>{m.message}</p>
              </article>
            ))}
            {(!data.chatMessages || data.chatMessages.length === 0) && <p className="muted">No messages yet. Kick off conversation in Community.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
