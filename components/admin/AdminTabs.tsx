'use client';
import { Tab } from './types';
const tabs:{key:Tab,label:string}[]=[{key:'dashboard',label:'Dashboard'},{key:'seasons',label:'Seasons'},{key:'teams',label:'Teams'},{key:'players',label:'Players'},{key:'registrations',label:'Registrations'},{key:'games',label:'Games'},{key:'scores',label:'Scores'},{key:'trades',label:'Trades'},{key:'dfs',label:'DFS'}];
export default function AdminTabs({active,onChange}:{active:Tab,onChange:(t:Tab)=>void}){return <div className='tabs'>{tabs.map(t=><button key={t.key} className={`tab-link ${active===t.key?'is-active':''}`} onClick={()=>onChange(t.key)}>{t.label}</button>)}</div>}
