'use client';

import { useEffect, useMemo, useState } from 'react';

type CommunityTab = 'chat' | 'forums';

export default function ChatClient({ seasonId }: { seasonId?: string }) {
  const [activeTab, setActiveTab] = useState<CommunityTab>('chat');
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
    <main>
      <p className="muted">Live banter in Chat Room, longer discussion in Forums.</p>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}

      <div className="form-actions" style={{ marginBottom: 12 }}>
        <button type="button" className={activeTab === 'chat' ? 'is-active' : ''} onClick={() => setActiveTab('chat')}>Chat Room</button>
        <button type="button" className={activeTab === 'forums' ? 'is-active' : ''} onClick={() => setActiveTab('forums')}>Forums</button>
      </div>

      {activeTab === 'chat' && (
        <section className="card">
          <h2 className="section-title">Live Chatroom</h2>
          <p className="muted">Fast stream for game-night reactions and league talk.</p>
          <div className="form-grid">
            <div className="form-field col-12">
              <label htmlFor="chat-input">Message</label>
              <input id="chat-input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Talk some trash..." />
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => post('chat_send', { season_id: seasonId, message: chatInput, role: 'FAN' }).then(() => setChatInput(''))}>Send</button>
              <button type="button" onClick={load}>Refresh</button>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {payload.chat.map((m: any) => <p key={m.id}><span className="badge">{m.author_display || m.role}</span> {m.message}</p>)}
            {payload.chat.length === 0 && <p className="muted">No live chat messages yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'forums' && (
        <section className="card">
          <h2 className="section-title">Forums</h2>

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

          <div className="grid" style={{ gridTemplateColumns: 'minmax(240px,0.9fr) minmax(320px,1.1fr)' }}>
            <div>
              <h3 className="card-title">Threads</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {payload.threads.map((topic: any) => (
                  <button key={topic.id} type="button" onClick={() => setActiveTopicId(topic.id)} style={{ textAlign: 'left' }}>
                    <strong>{topic.title}</strong> <span className="muted">({payload.posts.filter((p: any) => p.thread_id === topic.id).length} replies)</span>
                  </button>
                ))}
                {payload.threads.length === 0 && <p className="muted">No topics yet. Post the first thread.</p>}
              </div>
            </div>

            <div>
              <h3 className="card-title">Thread Detail</h3>
              {!activeTopic && <p className="muted">Select a thread to read and reply.</p>}
              {activeTopic && (
                <div>
                  <h4>{activeTopic.title}</h4>
                  <p><span className="badge">{activeTopic.author_display || 'User'}</span> {activeTopic.body}</p>
                  {activePosts.map((reply: any) => <p key={reply.id}><span className="badge">{reply.author_display || 'User'}</span> {reply.body}</p>)}
                  <div className="form-field col-12">
                    <label htmlFor="reply-input">Reply</label>
                    <textarea id="reply-input" rows={2} value={replyInput} onChange={(e) => setReplyInput(e.target.value)} />
                  </div>
                  <div style={{ marginTop: 8 }} className="form-actions">
                    <button type="button" onClick={() => post('post_reply', { thread_id: activeTopic.id, body: replyInput }).then(() => setReplyInput(''))}>Post Reply</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
