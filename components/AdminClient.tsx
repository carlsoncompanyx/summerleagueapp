'use client';
import { useEffect, useState } from 'react';
import AdminDashboardShell from './admin/AdminDashboardShell';

export default function AdminClient(){
  const [data,setData]=useState<any>(null); const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);const res=await fetch('/api/admin/dashboard',{cache:'no-store'}); const json=await res.json(); setData(json); setLoading(false)};
  useEffect(()=>{load()},[]);
  const runAction=async(action:string,payload:any)=>{const res=await fetch('/api/admin/dashboard',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,payload})}); return res.ok};
  if(loading||!data) return <main><h1>League Operations Dashboard</h1><p>Loading...</p></main>;
  return <AdminDashboardShell data={data} role={data.role} testMode={data.testMode} runAction={runAction} refresh={load}/>;
}
