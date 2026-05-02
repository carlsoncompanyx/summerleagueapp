'use client';
import { useState } from 'react';
export default function GameManager({games,teams,onAdd,onImport,onEdit,onBulk,onEnterScore}:any){
 const [selected,setSelected]=useState<string[]>([]);
 const all = selected.length===games.length && games.length>0;
 const toggle=(id:string)=>setSelected((s)=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 return <section className='card'><div className='section-header-row'><h2>Games</h2><div><button onClick={onAdd}>Add Game</button><button onClick={onImport}>Import Schedule</button></div></div>
 <div className='button-row'><button onClick={()=>setSelected(all?[]:games.map((g:any)=>g.id))}>{all?'Clear Selection':'Select All Visible'}</button><button disabled={!selected.length} onClick={()=>onBulk('delete',selected)}>Bulk Delete</button><button disabled={!selected.length} onClick={()=>onBulk('cancel',selected)}>Bulk Cancel</button><button disabled={!selected.length} onClick={()=>onBulk('postpone',selected)}>Bulk Postpone</button></div>
 <div className='responsive-table'><table className='table'><thead><tr><th></th><th>Date</th><th>Matchup</th><th>Status</th><th>Actions</th></tr></thead><tbody>{games.map((g:any)=><tr key={g.id}><td><input type='checkbox' checked={selected.includes(g.id)} onChange={()=>toggle(g.id)} /></td><td>{new Date(g.scheduled_at).toLocaleString()}</td><td>{teams.find((t:any)=>t.id===g.home_team)?.name} vs {teams.find((t:any)=>t.id===g.away_team)?.name}</td><td>{g.status}</td><td><button onClick={()=>onEdit(g)}>Edit</button><button onClick={()=>onEnterScore(g)}>Enter Score</button></td></tr>)}</tbody></table></div></section>
}
