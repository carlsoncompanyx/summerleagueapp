'use client';
import { useState } from 'react';
import AdminTabs from './AdminTabs';
import AdminModal from './AdminModal';
import AdminDashboardHome from './AdminDashboardHome';
import PlayerManager from './PlayerManager';
import GameManager from './GameManager';
import ScoreEntryModal from './ScoreEntryModal';
import CsvImportModal from './CsvImportModal';
import { Tab } from './types';
import { toLeagueDateTimeInput } from '../../lib/formatters';

export default function AdminDashboardShell({data,role,testMode,runAction,refresh}:any){
const [active,setActive]=useState<Tab>('dashboard');
const [seasonFilter,setSeasonFilter]=useState<string>(data.currentSeasonId||data.seasons?.[0]?.id||'all');
const [modal,setModal]=useState<any>(null); const [targetSeason,setTargetSeason]=useState(seasonFilter==='all'?(data.currentSeasonId||''):seasonFilter);
const seasons=data.seasons||[]; const teams=data.teams||[]; const players=data.players||[]; const games=data.games||[]; const trades=data.trades||[]; const gameStats=data.gameStats||[];
const seasonTeams=seasonFilter==='all'?teams:teams.filter((t:any)=>t.season_id===seasonFilter); const seasonPlayers=seasonFilter==='all'?players:players.filter((p:any)=>p.season_id===seasonFilter); const seasonGames=seasonFilter==='all'?games:games.filter((g:any)=>g.season_id===seasonFilter);
const unassigned=seasonPlayers.filter((p:any)=>!p.team_id).length; const upcoming=seasonGames.filter((g:any)=>new Date(g.scheduled_at).getTime()>Date.now()).length; const pendingTrades=trades.filter((t:any)=>t.status.includes('proposed')||t.status.includes('accepted')).length;
const recentFinal=[...seasonGames].filter((g:any)=>g.status==='FINAL').sort((a:any,b:any)=>+new Date(b.scheduled_at)-+new Date(a.scheduled_at)).slice(0,5);

const submit=async(action:string,payload:any)=>{const ok=await runAction(action,payload); if(ok){await refresh(); setModal(null);} };
const scoreGame=modal?.type==='score'?modal.item:null;
const existing=scoreGame?gameStats.filter((s:any)=>s.game_id===scoreGame.id):[];
const roster=scoreGame?players.filter((p:any)=>p.team_id===scoreGame.home_team||p.team_id===scoreGame.away_team):[];
const scoreRows=modal?.rows||(existing.length?existing:roster.map((p:any)=>({player_id:p.id,team_id:p.team_id,position:p.position,games_played:0,goals:0,assists:0,goals_against:0})));

return <main><h1>League Operations Dashboard</h1><p className='muted'>Role: {role}{testMode?' (test mode active)':''}</p>
<div className='form-field'><label>Working Season</label><select value={seasonFilter} onChange={e=>setSeasonFilter(e.target.value)}><option value='all'>All</option>{seasons.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
<AdminTabs active={active} onChange={setActive}/>
{active==='dashboard'&&<AdminDashboardHome seasonName={(seasons.find((s:any)=>s.id===seasonFilter)||seasons.find((s:any)=>s.id===data.currentSeasonId)||{name:'All'}).name} teams={seasonTeams.length} players={seasonPlayers.length} unassigned={unassigned} upcoming={upcoming} pendingTrades={pendingTrades} recentFinal={recentFinal} onAddPlayer={()=>setModal({type:'player'})} onImportPlayers={()=>setModal({type:'csv',kind:'players'})} onImportGames={()=>setModal({type:'csv',kind:'games'})} onAddGame={()=>setModal({type:'game'})} onEnterScores={()=>setActive('scores')} onDfs={()=>setActive('dfs')} />}
{active==='players'&&<PlayerManager players={seasonPlayers} teams={teams} onAdd={()=>setModal({type:'player'})} onImport={()=>setModal({type:'csv',kind:'players'})} onEdit={(p:any)=>setModal({type:'player',item:p})} />}
{active==='games'&&<GameManager games={seasonGames} teams={teams} onAdd={()=>setModal({type:'game'})} onImport={()=>setModal({type:'csv',kind:'games'})} onEdit={(g:any)=>setModal({type:'game',item:g})} />}
{active==='scores'&&<section className='card'><h2>Scores</h2>{seasonGames.map((g:any)=><div key={g.id} className='list-card compact'><p>{teams.find((t:any)=>t.id===g.home_team)?.name} {g.home_score}-{g.away_score} {teams.find((t:any)=>t.id===g.away_team)?.name}</p><button onClick={()=>setModal({type:'score',item:g})}>{g.status==='FINAL'?'Update Score':'Enter Score'}</button></div>)}</section>}
{active==='registrations'&&<section className='card'><h2>Registrations</h2><p className='muted'>Registrations tab is reachable and active.</p></section>}
{active==='trades'&&<section className='card'><h2>Trade Review</h2><p>Pending {pendingTrades}</p></section>}
{active==='dfs'&&<section className='card'><h2>DFS Admin Panel</h2><button onClick={()=>runAction('dfs_auto_generate_weekly_default',{})}>Generate Default Slate</button></section>}

<AdminModal open={!!modal} onClose={()=>setModal(null)} title={modal?.type==='csv'?'CSV Import':modal?.type==='score'?'Score Entry':'Edit'}>
{modal?.type==='csv'&&<CsvImportModal kind={modal.kind} seasons={seasons} targetSeason={targetSeason} setTargetSeason={setTargetSeason} onSubmit={(kind:any,rows:any,target:any,dry:any)=>submit(kind==='players'?'import_players_csv':'import_games_csv',{rows,target_season_id:target,dry_run:dry})} />}
{modal?.type==='player'&&(()=>{const i=modal.item||{}; const f=modal.form||{id:i.id||'',name:i.name||'',position:i.position||'',team_id:i.team_id||'',season_id:i.season_id||targetSeason}; return <div className='form-grid'><div><label>Name</label><input value={f.name} onChange={e=>setModal((m:any)=>({...m,form:{...f,name:e.target.value}}))}/></div><div><label>Team</label><select value={f.team_id} onChange={e=>setModal((m:any)=>({...m,form:{...f,team_id:e.target.value}}))}><option value=''>Unassigned</option>{seasonTeams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><button onClick={()=>submit(f.id?'player_update':'player_create',f)}>Save</button></div>})()}
{modal?.type==='game'&&(()=>{const i=modal.item||{}; const f=modal.form||{id:i.id||'',season_id:i.season_id||targetSeason,home_team:i.home_team||'',away_team:i.away_team||'',scheduled_at:toLeagueDateTimeInput(i.scheduled_at)||'',status:i.status||'SCHEDULED'}; return <div className='form-grid'><div><label>Home Team</label><select value={f.home_team} onChange={e=>setModal((m:any)=>({...m,form:{...f,home_team:e.target.value}}))}>{seasonTeams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><label>Away Team</label><select value={f.away_team} onChange={e=>setModal((m:any)=>({...m,form:{...f,away_team:e.target.value}}))}>{seasonTeams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><label>Scheduled At</label><input type='datetime-local' value={f.scheduled_at} onChange={e=>setModal((m:any)=>({...m,form:{...f,scheduled_at:e.target.value}}))}/></div><button onClick={()=>submit(f.id?'game_update':'game_create',{...f,scheduled_at:new Date(f.scheduled_at).toISOString()})}>Save</button></div>})()}
{modal?.type==='score'&&<ScoreEntryModal game={scoreGame} players={players} existingStats={existing} homeScore={modal.homeScore??String(scoreGame?.home_score||0)} awayScore={modal.awayScore??String(scoreGame?.away_score||0)} setHomeScore={(v:any)=>setModal((m:any)=>({...m,homeScore:v}))} setAwayScore={(v:any)=>setModal((m:any)=>({...m,awayScore:v}))} rows={scoreRows} setRows={(rows:any)=>setModal((m:any)=>({...m,rows}))} onSave={()=>submit('game_score_submit',{gameId:scoreGame.id,homeScore:Number((modal.homeScore ?? scoreGame.home_score) || 0),awayScore:Number((modal.awayScore ?? scoreGame.away_score) || 0),stats:scoreRows})} />}
</AdminModal>
</main>
}
