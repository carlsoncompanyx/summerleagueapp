import { getLeagueSnapshot } from '../../lib/league-data';
import { formatPublicDateTime } from '../../lib/formatters';

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  const params = await searchParams;
  const data = await getLeagueSnapshot();
  if ('unavailable' in data && data.unavailable) return <main><h1>Games</h1><p>{data.reason}</p></main>;

  const team = params.team || 'all';
  const status = params.status || 'all';
  const date = params.date || '';
  const activeGames = data.schedule.filter((g:any)=>!['CANCELED'].includes(String(g.status)));
  const defaultDate = activeGames.find((g:any)=>new Date(g.scheduled_at).getTime()>=Date.now())?.scheduled_at?.slice(0,10) || activeGames[0]?.scheduled_at?.slice(0,10) || '';
  const selectedDate = date || defaultDate;
  const filtered = activeGames.filter((g:any)=>(team==='all'||g.home_team===team||g.away_team===team) && (status==='all'||g.status===status) && (!selectedDate || g.scheduled_at.slice(0,10)===selectedDate));
  const grouped = filtered.reduce((acc:any,g:any)=>{const k=g.scheduled_at.slice(0,10); (acc[k]=acc[k]||[]).push(g); return acc;},{});
  const dates = Array.from(new Set(activeGames.map((g:any)=>g.scheduled_at.slice(0,10))));

  return <main><h1>Games</h1><section className='card' style={{marginBottom:12}}><div className='button-row'><select value={selectedDate} onChange={()=>{}}>{dates.map((d)=> <option key={d} value={d}>{d}</option>)}</select><select value={status} onChange={()=>{}}><option value='all'>All Statuses</option><option value='SCHEDULED'>Scheduled</option><option value='LIVE'>Live</option><option value='FINAL'>Final</option><option value='POSTPONED'>Postponed</option></select><select value={team} onChange={()=>{}}><option value='all'>All Teams</option>{data.teams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div></section>
  {Object.keys(grouped).length===0 ? <section className='card'><p className='muted'>No games match these filters.</p></section> : Object.entries(grouped).map(([day,games]:any)=><section key={day} className='card' style={{marginBottom:12}}><h2>{day}</h2><div className='stack-list'>{games.map((g:any)=><article key={g.id} className='list-card'><p><strong>{g.away_team_name}</strong> @ <strong>{g.home_team_name}</strong></p><p className='muted'>{formatPublicDateTime(g.scheduled_at)} · {g.status}</p>{['FINAL','LIVE'].includes(String(g.status))?<p className='muted'>Score: {g.away_score}-{g.home_score}</p>:null}</article>)}</div></section>)}
  </main>
}
