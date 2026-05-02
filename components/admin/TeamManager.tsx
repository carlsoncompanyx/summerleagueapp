'use client';
export default function TeamManager({teams,seasons,profiles,players,onAdd,onEdit,onDelete}:any){
const pname=(id:string)=>{const p=(profiles||[]).find((x:any)=>x.user_id===id); return p?.display_name||p?.first_name||'—'};
return <section className='card'><div className='section-header-row'><h2>Teams</h2><button onClick={onAdd}>Add Team</button></div><div className='responsive-table'><table className='table'><thead><tr><th>Name</th><th>Season</th><th>Captain</th><th>Roster</th><th>Actions</th></tr></thead><tbody>{teams.map((t:any)=><tr key={t.id}><td>{t.name}</td><td>{seasons.find((s:any)=>s.id===t.season_id)?.name||t.season_id}</td><td>{t.captain_user_id?pname(t.captain_user_id):'—'}</td><td>{players.filter((p:any)=>p.team_id===t.id).length}</td><td><button onClick={()=>onEdit(t)}>Edit</button><button onClick={()=>onDelete(t)}>Delete</button></td></tr>)}</tbody></table></div></section>
}
