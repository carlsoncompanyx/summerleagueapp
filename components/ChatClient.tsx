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
    setPayload(await res.json());
  }

  useEffect(() => { load(); }, [seasonId]);

  const activeTopic = useMemo(() => payload.threads.find((t: any) => t.id === activeTopicId), [payload.threads, activeTopicId]);
  const activePosts = useMemo(() => payload.posts.filter((p: any) => p.thread_id === activeTopicId), [payload.posts, activeTopicId]);

  async function post(action: string, body: any) {
    setError('');
    const res = await fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload: body }) });
    const json = await res.json();
    if (!res.ok) return setError(json.error || 'Request failed');
    await load();
  }

  return (
    <main>
      <div className="community-header card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Community</h2>
        <p className="muted">Live chat for quick banter, forums for longer discussion threads.</p>
        <div className="form-actions">
          <button type="button" className={activeTab === 'chat' ? 'is-active' : ''} onClick={() => setActiveTab('chat')}>Chat</button>
          <button type="button" className={activeTab === 'forums' ? 'is-active' : ''} onClick={() => setActiveTab('forums')}>Forums</button>
          <button type="button" onClick={load}>Refresh</button>
        </div>
      </div>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}

      {activeTab === 'chat' && (
        <section className="card">
          <h3 className="card-title">League Chat</h3>
          <div className="chat-stream">
            {payload.chat.map((m: any) => (
              <article key={m.id} className="chat-message">
                <div><strong>{m.author_display || m.role}</strong> <span className="muted">· {new Date(m.created_at).toLocaleString()}</span></div>
                <p>{m.message}</p>
              </article>
            ))}
            {payload.chat.length === 0 && <p className="muted">No messages yet. Break the ice with your first league message.</p>}
          </div>
          <div className="chat-compose">
            <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message the league..." rows={3} />
            <button type="button" onClick={() => post('chat_send', { season_id: seasonId, message: chatInput, role: 'FAN' }).then(() => setChatInput(''))}>Send Message</button>
          </div>
        </section>
      )}

      {activeTab === 'forums' && (
        <section className="card">
          <div className="forum-layout">
            <div>
              <h3 className="card-title">Threads</h3>
              <div className="forum-compose">
                <input value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} placeholder="Thread title" />
                <textarea rows={3} value={topicBody} onChange={(e) => setTopicBody(e.target.value)} placeholder="Start the conversation" />
                <button type="button" onClick={() => post('thread_create', { season_id: seasonId, title: topicTitle, body: topicBody }).then(() => { setTopicTitle(''); setTopicBody(''); })}>Create Thread</button>
              </div>
              <div className="forum-thread-list">
                {payload.threads.map((topic: any) => (
                  <button key={topic.id} type="button" className="forum-thread-card" onClick={() => setActiveTopicId(topic.id)}>
                    <strong>{topic.title}</strong>
                    <p className="muted">{topic.author_display || 'User'} · {new Date(topic.created_at).toLocaleString()}</p>
                    <p className="muted">{payload.posts.filter((p: any) => p.thread_id === topic.id).length} replies</p>
                  </button>
                ))}
                {payload.threads.length === 0 && <p className="muted">No threads yet. Create the first post.</p>}
              </div>
            </div>
            <div>
              <h3 className="card-title">Thread View</h3>
              {!activeTopic && <p className="muted">Select a thread to read and reply.</p>}
              {activeTopic && (
                <article className="forum-active-thread">
                  <h4>{activeTopic.title}</h4>
                  <p className="muted">{activeTopic.author_display || 'User'} · {new Date(activeTopic.created_at).toLocaleString()}</p>
                  <p>{activeTopic.body}</p>
                  {activePosts.map((reply: any) => <p key={reply.id}><strong>{reply.author_display || 'User'}</strong> <span className="muted">· {new Date(reply.created_at).toLocaleString()}</span><br />{reply.body}</p>)}
                  <textarea rows={3} value={replyInput} onChange={(e) => setReplyInput(e.target.value)} placeholder="Write a reply" />
                  <button type="button" onClick={() => post('post_reply', { thread_id: activeTopic.id, body: replyInput }).then(() => setReplyInput(''))}>Reply</button>
                </article>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
