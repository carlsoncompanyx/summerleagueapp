'use client';

import { useEffect, useRef, useState } from 'react';

export default function ChatClient({ seasonId }: { seasonId?: string }) {
  const [chat, setChat] = useState<any[]>([]);
  const [actor, setActor] = useState<any>(null);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/community${seasonId ? `?season_id=${seasonId}` : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not load chat. Retry.');
      setChat(json.chat ?? []);
      setActor(json.actor ?? null);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not load chat. Retry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [seasonId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length]);

  async function post(action: string, payload: any) {
    const res = await fetch('/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(res.status === 401 ? 'Login required to send messages.' : (json.error || 'Request failed'));
    return json;
  }

  async function send() {
    if (!chatInput.trim()) return;
    setPending(true);
    setError('');
    try {
      await post('chat_send', { season_id: seasonId, message: chatInput });
      setChatInput('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function deleteMessage(id: string) {
    setPending(true);
    setError('');
    try {
      await post('admin_delete_chat', { id });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card">
      <div className="section-header-row">
        <h2 className="section-title">League Chat</h2>
        <button type="button" onClick={load}>Refresh</button>
      </div>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      <div className="chat-stream">
        {loading && !chat.length && <p className="muted">Loading chat...</p>}
        {[...chat].reverse().map((message: any) => (
          <article key={message.id} className="chat-message">
            <div className="chat-message-meta">
              <strong>{message.author_display || 'Member'}</strong>
              {message.role && <span className="badge">{String(message.role).toUpperCase()}</span>}
              <span className="muted">{new Date(message.created_at).toLocaleString()}</span>
              {actor?.admin && <button type="button" className="link-button" disabled={pending} onClick={() => deleteMessage(message.id)}>Delete</button>}
            </div>
            <p>{message.message}</p>
          </article>
        ))}
        {!loading && !chat.length && <p className="muted">No chat messages yet.</p>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-compose">
        <textarea
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          placeholder="Message the league..."
          rows={3}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" disabled={pending || !chatInput.trim()} onClick={send}>{pending ? 'Sending...' : 'Send'}</button>
      </div>
    </section>
  );
}
