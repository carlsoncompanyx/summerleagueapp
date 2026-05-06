import Link from 'next/link';
import { buildGameProjections, filterBettingGames } from '../lib/betting/projections';
import { getLeagueSnapshot } from '../lib/league-data';
import { getSeasonStats } from '../lib/stats/getStats';
import { formatPublicDateTime } from '../lib/formatters';
import { createAdminSupabaseClient } from '../lib/supabase/admin';

function adminClientSafe() {
  if (!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [data, stats] = await Promise.all([getLeagueSnapshot(), getSeasonStats()]);
  if ('unavailable' in data && data.unavailable) return <main><section className="card"><h2>League Data Unavailable</h2><p>{data.reason}</p></section></main>;

  const upcomingGames = data.schedule.filter((game) => new Date(game.scheduled_at).getTime() > Date.now() && !['CANCELED'].includes(String(game.status))).slice(0, 6);
  const recentFinals = data.schedule.filter((game) => game.status === 'FINAL').slice(-5).reverse();
  const topLeaders = (stats.players ?? []).slice(0, 5);
  const seasonGameIds = data.schedule.filter((game) => game.season_id === data.season?.id).map((game) => game.id);
  const admin = adminClientSafe();
  const [gameStatsRes, historicalRes, valuationRes, slatesRes] = admin
    ? await Promise.all([
      seasonGameIds.length ? admin.from('game_stats').select('game_id,player_id,games_played,goals,assists,goals_against').in('game_id', seasonGameIds) : Promise.resolve({ data: [] as any[] }),
      admin.from('player_historical_season_stats').select('player_id,player_name_raw,normalized_player_name,goals,assists,points'),
      data.season?.id ? admin.from('player_valuation_inputs').select('player_id,player_grade').eq('season_id', data.season.id) : Promise.resolve({ data: [] as any[] }),
      data.season?.id ? admin.from('slates').select('id').eq('season_id', data.season.id) : Promise.resolve({ data: [] as any[] }),
    ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }];
  const slateIds = (slatesRes.data ?? []).map((slate: any) => slate.id);
  const { data: slatePlayers } = admin && slateIds.length
    ? await admin.from('slate_players').select('player_id,projection_points,valuation_grade').in('slate_id', slateIds)
    : { data: [] as any[] };
  const bettingGames = filterBettingGames(data.schedule.filter((game) => new Date(game.scheduled_at).getTime() > Date.now() && !['CANCELED'].includes(String(game.status))));
  const pickLines = buildGameProjections({
    games: bettingGames.slice(0, 3),
    players: data.players,
    gameStats: gameStatsRes.data ?? [],
    historicalRows: historicalRes.data ?? [],
    valuationInputs: valuationRes.data ?? [],
    slatePlayers: slatePlayers ?? [],
  });

  return (
    <main>
      <section className="hero home-hero">
        <h2>{data.season?.name ?? 'Emerald Coast Roller League'}</h2>
        <p className="muted">Games, standings, DFS contests, weekly picks, and league updates in one place.</p>
        <div className="form-actions" style={{ marginTop: 8 }}>
          <Link className="header-auth-link" href="/schedule">Games</Link>
          <Link className="header-auth-link" href="/dfs">DFS Contest</Link>
          <Link className="header-auth-link" href="/betting">Weekly Picks</Link>
          <Link className="header-auth-link" href="/chat">Chat</Link>
        </div>
      </section>

      <div className="home-dashboard-grid">
        <section className="card">
          <div className="section-header-row">
            <h3 className="card-title">Upcoming Games</h3>
            <Link href="/schedule">Full schedule</Link>
          </div>
          <table className="table home-compact-table">
            <tbody>
              {upcomingGames.slice(0, 5).map((game) => (
                <tr key={game.id}>
                  <td><strong>{game.away_team_name}</strong> @ <strong>{game.home_team_name}</strong></td>
                  <td>{formatPublicDateTime(game.scheduled_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!upcomingGames.length && <p className="muted">No upcoming games listed.</p>}
        </section>

        <section className="card">
          <div className="section-header-row">
            <h3 className="card-title">Recent Scores</h3>
            <Link href="/schedule">Results</Link>
          </div>
          <table className="table home-compact-table">
            <tbody>
              {recentFinals.map((game) => (
                <tr key={game.id}>
                  <td>{game.away_team_name}</td>
                  <td><strong>{game.away_score}</strong></td>
                  <td>{game.home_team_name}</td>
                  <td><strong>{game.home_score}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recentFinals.length && <p className="muted">Scores will appear after Week 1.</p>}
        </section>

        <section className="card">
          <div className="section-header-row">
            <h3 className="card-title">Stat Leaders</h3>
            <Link href="/statistics">All stats</Link>
          </div>
          <table className="table home-compact-table">
            <thead><tr><th>Player</th><th>G</th><th>A</th><th>P</th></tr></thead>
            <tbody>
              {topLeaders.map((player: any) => (
                <tr key={player.player_id}>
                  <td>{player.name}</td>
                  <td>{player.goals ?? 0}</td>
                  <td>{player.assists ?? 0}</td>
                  <td><strong>{player.points ?? 0}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!topLeaders.length && <p className="muted">Leaderboards will populate once stats are entered.</p>}
        </section>
      </div>

      <div className="home-dashboard-grid secondary">
        <section className="card">
          <h3 className="card-title">Next DFS Slate</h3>
          {data.nextSlate ? (
            <>
              <p><strong>{data.nextSlate.name}</strong></p>
              <p className="muted">Locks {formatPublicDateTime(data.nextSlate.lock_at)} - {data.nextSlate.contest?.name ?? 'Contest pending'}</p>
              <Link className="header-auth-link" href="/dfs">Open DFS</Link>
            </>
          ) : <p className="muted">Next slate will appear when games are published.</p>}
        </section>

        <section className="card">
          <div className="section-header-row">
            <h3 className="card-title">Weekly Picks</h3>
            <Link href="/betting">All picks</Link>
          </div>
          <div className="stack-list">
            {pickLines.map((line) => {
              const game = bettingGames.find((row) => row.id === line.gameId);
              if (!game) return null;
              return (
                <article key={line.gameId} className="list-card compact">
                  <p><strong>{game.away_team_name}</strong> @ <strong>{game.home_team_name}</strong></p>
                  <p className="muted">Projected {line.projectedAwayGoals.toFixed(1)}-{line.projectedHomeGoals.toFixed(1)} - Total {line.total.toFixed(1)}</p>
                </article>
              );
            })}
            {!pickLines.length && <p className="muted">Projected lines appear when upcoming games are scheduled.</p>}
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Recent Chat Activity</h3>
          <p className="muted">{data.chatMessages.length ? `${data.chatMessages.length} recent chat update(s).` : 'No recent chat messages yet.'}</p>
          <Link className="header-auth-link" href="/chat">Open Chat</Link>
        </section>
      </div>
    </main>
  );
}
