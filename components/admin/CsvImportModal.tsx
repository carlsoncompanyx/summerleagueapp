'use client';
import { parseCsv } from '../../lib/csv/parse';
import { useMemo, useState } from 'react';
export default function CsvImportModal({kind,seasons,targetSeason,setTargetSeason,onSubmit,lastResult,pending}:any){
  const [rows,setRows]=useState<any[]>([]); const [headers,setHeaders]=useState<string[]>([]);
  const [mode,setMode]=useState('append');
  const preview=rows.slice(0,10);
  const mappedHeaders = useMemo(()=>headers.map((h)=>h.trim().toLowerCase()),[headers]);
  return <div><label>Target Season</label><select value={targetSeason} onChange={e=>setTargetSeason(e.target.value)}>{seasons.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
  {kind==='games'&&<><label>Existing schedule handling</label><select value={mode} onChange={e=>setMode(e.target.value)}><option value='append'>Append</option><option value='replace_non_final'>Replace non-final</option><option value='cancel_non_final'>Cancel non-final</option></select></>}
  <input type='file' accept='.csv' onChange={async e=>{const file=e.target.files?.[0]; if(!file)return; const out=parseCsv(await file.text()); setHeaders(out.headers); const norm=out.headers.map(h=>h.trim().toLowerCase()); setRows(out.rows.map(r=>Object.fromEntries(r.map((v,i)=>[norm[i],v]))));}}/>
  <p>Detected headers: {headers.join(', ') || 'None'}</p><p>Mapped fields: {mappedHeaders.join(', ') || 'None'}</p>
  <div className='responsive-table'><table className='table'><thead><tr>{headers.map((h)=> <th key={h}>{h}</th>)}</tr></thead><tbody>{preview.map((r:any,i:number)=><tr key={i}>{headers.map((h)=> <td key={h}>{String(r[h.trim().toLowerCase()] ?? '')}</td>)}</tr>)}</tbody></table></div>
  <div className='button-row'><button disabled={pending} onClick={()=>onSubmit(kind,rows,targetSeason,true,mode)}>Dry Run</button><button disabled={pending} onClick={()=>onSubmit(kind,rows,targetSeason,false,mode)}>Import</button></div>
  {lastResult?.error && <p>{lastResult.error}</p>}
  {lastResult?.rowErrors?.length ? <ul>{lastResult.rowErrors.slice(0,20).map((e:string)=><li key={e}>{e}</li>)}</ul>:null}
  {lastResult?.data?.counts && <p>Inserted {lastResult.data.counts.inserted} · Updated {lastResult.data.counts.updated} · Skipped {lastResult.data.counts.skipped} · Errors {lastResult.data.counts.errors}</p>}
  </div>
}
