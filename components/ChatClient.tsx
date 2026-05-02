'use client';

import { useEffect, useRef, useState } from 'react';

export default function ChatClient({ seasonId }: { seasonId?: string }) {
  const [chat, setChat] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    const res = await fetch(`/api/community${seasonId ? `?season_id=${seasonId}` : ''}`, { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    setChat(json.chat ?? []);
  }

  useEffect(() => { load(); const id=setInterval(load, 8000); return ()=>clearInterval(id); }, [seasonId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length]);

  async function send() {
    if (!chatInput.trim()) return;
    setPending(true); setError('');
    const res = await fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'chat_send', payload: { season_id: seasonId, message: chatInput } }) });
    const json = await res.json();
    setPending(false);
    if (!res.ok) { setError(res.status===401?'Login required to send messages.':(json.error||'Request failed')); return; }
    setChatInput('');
    await load();
  }

  return <section className='card'>
    <div className='section-header-row'><h2 className='section-title'>League Chat</h2><button onClick={load}>Refresh</button></div>
    {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
    <div className='chat-stream'>
      {[...chat].reverse().map((m: any) => <article key={m.id} className='chat-message'><div><strong>{m.author_display || 'Member'}</strong> <span className='badge'>{m.role}</span> <span className='muted'>· {new Date(m.created_at).toLocaleString()}</span></div><p>{m.message}</p></article>)}
      {!chat.length && <p className='muted'>No messages yet. Start the chat.</p>}
      <div ref={bottomRef} />
    </div>
    <div className='chat-compose'>
      <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder='Message the league...' rows={3} onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} />
      <button type='button' disabled={pending} onClick={send}>{pending?'Sending...':'Send Message'}</button>
    </div>
  </section>;
}
