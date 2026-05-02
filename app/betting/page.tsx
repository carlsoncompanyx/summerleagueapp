import Link from 'next/link';
import { buildDefaultGameLines } from '../../lib/betting';
import { getLeagueSnapshot } from '../../lib/league-data';
import { formatPublicDateTime } from '../../lib/formatters';
import { createAdminSupabaseClient } from '../../lib/supabase/admin';

function adminClientSafe() { if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null; try { return createAdminSupabaseClient(); } catch { return null; } }

export default async function BettingPage({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  const params = await searchParams; const market = params.market || 'all';
  const data = await getLeagueSnapshot();
  if ('unavailable' in data && data.unavailable) return <main><h1>Weekly Lines & Picks</h1><p>{data.reason}</p></main>;
  const now = Date.now();
  const upcoming = data.schedule.filter((g) => new Date(g.scheduled_at).getTime() > now && !['CANCELED'].includes(String(g.status))).slice(0, 12);
  const gameIds = upcoming.map((g) => g.id);
  const teamStats = new Map<string, { gp: number; gf: number; ga: number; pts: number }>();
  for (const s of data.standings) { const team = data.teams.find((t) => t.name === s.team); if (!team) continue; teamStats.set(team.id, { gp: Number(s.gp || 0), gf: Number(s.gf || 0), ga: Number(s.ga || 0), pts: Number(s.pts || 0) }); }
  const admin = adminClientSafe();
  const { data: lineRows } = admin && gameIds.length ? await admin.from('game_betting_lines').select('*').in('game_id', gameIds) : { data: [] as any[] };
  const lineByGame = new Map((lineRows ?? []).map((r: any) => [r.game_id, r]));

  return <main><h1>Weekly Lines & Picks</h1><section className='card' style={{ marginBottom: 12 }}><h2 className='section-title'>Weekly Game Markets (Picks Only)</h2><p className='muted'>Admin lines override model defaults when published.</p><p className='badge'>Bet slip coming soon — picks view only.</p><div className='button-row'><Link href='/betting?market=all'>All</Link><Link href='/betting?market=moneyline'>Moneyline</Link><Link href='/betting?market=spread'>Spread</Link><Link href='/betting?market=total'>Total</Link></div></section>
  <section className='card'><div className='betting-grid'>{upcoming.map((g)=>{ const home=teamStats.get(g.home_team) ?? {gp:0,gf:0,ga:0,pts:0}; const away=teamStats.get(g.away_team) ?? {gp:0,gf:0,ga:0,pts:0}; const generated=buildDefaultGameLines({homePower:0,awayPower:0,homeAvgFor:4.1,awayAvgFor:4.1,homeAvgAgainst:4.1,awayAvgAgainst:4.1}); const adminLine=lineByGame.get(g.id); const line=adminLine||generated; return <article key={g.id} className='betting-card'><h3>{g.away_team_name} @ {g.home_team_name}</h3><p className='muted'>Puck drop: {formatPublicDateTime(g.scheduled_at)} · {g.status}</p>{['FINAL','LIVE'].includes(String(g.status)) ? <p className='muted'>Score: {g.away_score}-{g.home_score}</p> : null}{(market==='all'||market==='moneyline')&&<div className='bet-line-row'><span>Moneyline</span><strong>{line.away_moneyline}/{line.home_moneyline}</strong></div>}{(market==='all'||market==='spread')&&<div className='bet-line-row'><span>Spread</span><strong>{line.away_spread}/{line.home_spread}</strong></div>}{(market==='all'||market==='total')&&<div className='bet-line-row'><span>Total</span><strong>O/U {line.total}</strong></div>}</article>})}{!upcoming.length&&<p className='muted'>No upcoming games available for weekly markets.</p>}</div></section></main>;
}
