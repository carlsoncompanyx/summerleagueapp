import Link from 'next/link';
import { getLeagueSnapshot } from '../lib/league-data';
import { getSeasonStats } from '../lib/stats/getStats';
import { formatPublicDateTime } from '../lib/formatters';

export default async function HomePage() {
  const [data, stats] = await Promise.all([getLeagueSnapshot(), getSeasonStats()]);
  if ('unavailable' in data && data.unavailable) return <main><section className='card'><h2>League Data Unavailable</h2><p>{data.reason}</p></section></main>;

  const upcomingGames = data.schedule.filter((g) => new Date(g.scheduled_at).getTime() > Date.now() && !['CANCELED'].includes(String(g.status))).slice(0, 5);
  const recentFinals = data.schedule.filter((g) => g.status === 'FINAL').slice(-5).reverse();
  const topLeaders = (stats.players ?? []).slice(0, 5);

  return <main><section className='hero' style={{ marginBottom: 12 }}><h2>{data.season?.name ?? 'Emerald Coast Roller League'}</h2><p className='muted'>A mobile-first league home for games, standings, DFS contests, chat, and weekly lines.</p><div className='form-actions' style={{ marginTop: 8 }}><Link className='header-auth-link' href='/schedule'>Today's Games</Link><Link className='header-auth-link' href='/dfs'>Enter DFS Contest</Link><Link className='header-auth-link' href='/betting'>View Weekly Lines</Link><Link className='header-auth-link' href='/chat'>Chat</Link></div></section>
  <div className='grid'>
  <section className='card'><h3 className='card-title'>Upcoming Games</h3><div className='stack-list'>{upcomingGames.map((g)=> <article className='list-card' key={g.id}><p><strong>{g.away_team_name}</strong> @ <strong>{g.home_team_name}</strong></p><p className='muted'>{formatPublicDateTime(g.scheduled_at)} · {g.location ?? 'TBD'}</p></article>)}{!upcomingGames.length&&<p className='muted'>No upcoming games listed.</p>}</div></section>
  <section className='card'><h3 className='card-title'>Recent Results</h3><div className='stack-list'>{recentFinals.map((g)=><article className='list-card' key={g.id}><p><strong>{g.away_team_name} {g.away_score}</strong> · <strong>{g.home_team_name} {g.home_score}</strong></p></article>)}{!recentFinals.length&&<p className='muted'>No final scores yet.</p>}</div></section>
  <section className='card'><h3 className='card-title'>League Leaders</h3><div className='stack-list'>{topLeaders.map((p:any)=><article key={p.player_id} className='list-card compact'><div><strong>{p.name}</strong> <span className='muted'>({p.team_name})</span></div><div className='muted'>Points: {p.points}</div></article>)}</div></section>
  <section className='card'><h3 className='card-title'>Chat Activity</h3><p className='muted'>Join league conversation, lineup chatter, and game-day updates.</p><Link className='header-auth-link' href='/chat'>Open Chat</Link></section>
  </div></main>;
}
