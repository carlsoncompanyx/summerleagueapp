'use client';
import { useEffect, useState } from 'react';
import AdminDashboardShell from './admin/AdminDashboardShell';

type ActionResult = { ok: true; data: any } | { ok: false; error: string; rowErrors?: any[]; importDiagnostics?: any; counts?: any; mappedRows?: any[]; warnings?: string[]; details?: any; data?: any };

export default function AdminClient(){
  const [data,setData]=useState<any>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const load=async()=>{setLoading(true);setError(null);try{const res=await fetch('/api/admin/dashboard',{cache:'no-store'}); const json=await res.json(); if(!res.ok) throw new Error(json?.error||'Load failed'); setData(json);}catch(e:any){setError(e?.message||'Load failed');}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const runAction=async(action:string,payload:any):Promise<ActionResult>=>{
    try {
      const res=await fetch('/api/admin/dashboard',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,payload})});
      let body:any={}; try{body=await res.json();}catch{}
      if(!res.ok) return {
        ok:false,
        error:body?.error||body?.details?.message||`Request failed (${res.status})`,
        rowErrors:body?.rowErrors,
        importDiagnostics:body?.importDiagnostics,
        counts:body?.counts,
        mappedRows:body?.mappedRows,
        warnings:body?.warnings,
        details:body?.details,
        data:body,
      };
      return { ok:true,data:body };
    } catch (e:any) {
      return { ok:false,error:e?.message||'Network error' };
    }
  };
  if(loading) return <main><h1>League Operations Dashboard</h1><section className='card'><p className='muted'>Loading dashboard…</p></section></main>;
  if(error) return <main><h1>League Operations Dashboard</h1><section className='card'><p>{error}</p><button onClick={load}>Retry</button></section></main>;
  if(!data) return <main><h1>League Operations Dashboard</h1><section className='card'><p>No data.</p><button onClick={load}>Retry</button></section></main>;
  return <AdminDashboardShell data={data} role={data.role} testMode={data.testMode} runAction={runAction} refresh={load}/>;
}
