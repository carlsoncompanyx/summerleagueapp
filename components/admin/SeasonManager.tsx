'use client';
export default function SeasonManager({seasons,currentSeasonId,onAdd,onEdit,onDelete}:any){
return <section className='card'><div className='section-header-row'><h2>Seasons</h2><button onClick={onAdd}>Add Season</button></div><div className='responsive-table'><table className='table'><thead><tr><th>Name</th><th>Dates</th><th>Current</th><th>Actions</th></tr></thead><tbody>{seasons.map((s:any)=><tr key={s.id}><td>{s.name}</td><td>{s.start_date} → {s.end_date}</td><td>{s.id===currentSeasonId?'Yes':'—'}</td><td><button onClick={()=>onEdit(s)}>Edit</button><button onClick={()=>onDelete(s)}>Delete</button></td></tr>)}</tbody></table></div></section>
}
