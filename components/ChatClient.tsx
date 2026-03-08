'use client';

import { useEffect, useMemo, useState } from 'react';

export default function ChatClient({ seasonId }: { seasonId?: string }) {
  const [chatInput, setChatInput] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [topicBody, setTopicBody] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>({ chat: [], threads: [], posts: [] });
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch(`/api/community${seasonId ? `?season_id=${seasonId}` : ''}`);
    const json = await res.json();
    setPayload(json);
  }

  useEffect(() => { load(); }, [seasonId]);

  const activeTopic = useMemo(() => payload.threads.find((t: any) => t.id === activeTopicId), [payload.threads, activeTopicId]);
  const activePosts = useMemo(() => payload.posts.filter((p: any) => p.thread_id === activeTopicId), [payload.posts, activeTopicId]);

  async function post(action: string, body: any) {
    setError('');
    const res = await fetch('/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload: body }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error || 'Request failed');
    await load();
  }

  return (
    <div className="grid">
      <section className="card">
        <h2 className="section-title">Live Chatroom</h2>
        <p className="muted">Always-on live chat stream. This is separate from forum topics below.</p>
        {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
        <div className="form-grid">
          <div className="form-field col-12">
            <label htmlFor="chat-input">Message</label>
            <input id="chat-input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Talk some trash..." />
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => post('chat_send', { season_id: seasonId, message: chatInput, role: 'FAN' }).then(() => setChatInput(''))}>Send</button>
          <button type="button" onClick={() => setChatInput((v) => `${v} 🔥`)}>Attach GIF</button>
        </div>
        <div style={{ marginTop: 10 }}>
          {payload.chat.map((m: any) => <p key={m.id}><span className="badge">{m.role}</span> {m.message}</p>)}
          {payload.chat.length === 0 && <p className="muted">No live chat messages yet.</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Message Board</h2>
        <p className="muted">Forum topics and threaded replies (not linked to live chat).</p>

        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div className="form-field col-12">
            <label htmlFor="topic-title">Topic Title</label>
            <input id="topic-title" value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} placeholder="Ex: Week 3 predictions" />
          </div>
          <div className="form-field col-12">
            <label htmlFor="topic-body">Topic Body</label>
            <textarea id="topic-body" rows={3} value={topicBody} onChange={(e) => setTopicBody(e.target.value)} placeholder="Start a discussion..." />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => post('thread_create', { season_id: seasonId, title: topicTitle, body: topicBody }).then(() => { setTopicTitle(''); setTopicBody(''); })}>New Post</button>
            <button type="button" onClick={load}>Refresh</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {payload.threads.map((topic: any) => (
            <button key={topic.id} type="button" onClick={() => setActiveTopicId(topic.id)} style={{ textAlign: 'left' }}>
              <strong>{topic.title}</strong> <span className="muted">({payload.posts.filter((p: any) => p.thread_id === topic.id).length} replies)</span>
            </button>
          ))}
          {payload.threads.length === 0 && <p className="muted">No topics yet. Post the first thread.</p>}
        </div>

        {activeTopic && (
          <div style={{ marginTop: 12 }}>
            <h3>{activeTopic.title}</h3>
            <p>{activeTopic.body}</p>
            {activePosts.map((reply: any) => <p key={reply.id}>{reply.body}</p>)}
            <div className="form-field col-12">
              <label htmlFor="reply-input">Reply</label>
              <textarea id="reply-input" rows={2} value={replyInput} onChange={(e) => setReplyInput(e.target.value)} />
            </div>
            <div style={{ marginTop: 8 }} className="form-actions">
              <button type="button" onClick={() => post('post_reply', { thread_id: activeTopic.id, body: replyInput }).then(() => setReplyInput(''))}>Post Reply</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
