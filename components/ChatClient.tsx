'use client';

import { useState } from 'react';

type ChatMessage = { id: string; role: string; message: string };
type BoardTopic = {
  id: string;
  title: string;
  author: string;
  body: string;
  replies: { id: string; author: string; message: string }[];
};

export default function ChatClient({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const [chatInput, setChatInput] = useState('');
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>(initialMessages);

  const [topicTitle, setTopicTitle] = useState('');
  const [topicBody, setTopicBody] = useState('');
  const [topics, setTopics] = useState<BoardTopic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');

  const activeTopic = topics.find((t) => t.id === activeTopicId) ?? null;

  const sendChat = () => {
    if (!chatInput.trim()) return;
    setLiveMessages((prev) => [{ id: String(Date.now()), role: 'PLAYER', message: chatInput }, ...prev]);
    setChatInput('');
  };

  const createTopic = () => {
    if (!topicTitle.trim() || !topicBody.trim()) return;
    const id = `topic-${Date.now()}`;
    const topic: BoardTopic = {
      id,
      title: topicTitle,
      author: 'FAN',
      body: topicBody,
      replies: [],
    };
    setTopics((prev) => [topic, ...prev]);
    setTopicTitle('');
    setTopicBody('');
    setActiveTopicId(id);
  };

  const postReply = () => {
    if (!activeTopic || !replyInput.trim()) return;
    setTopics((prev) =>
      prev.map((topic) =>
        topic.id === activeTopic.id
          ? {
              ...topic,
              replies: [...topic.replies, { id: `reply-${Date.now()}`, author: 'PLAYER', message: replyInput }],
            }
          : topic,
      ),
    );
    setReplyInput('');
  };

  return (
    <div className="grid">
      <section className="card">
        <h2 className="section-title">Live Chatroom</h2>
        <p className="muted">Always-on live chat stream. This is separate from forum topics below.</p>
        <label htmlFor="chat-input">Message</label>
        <input
          id="chat-input"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Talk some trash..."
          style={{ width: '100%', marginTop: 6 }}
        />
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" onClick={sendChat}>Send</button>
          <button type="button" onClick={() => setChatInput((v) => `${v} 🔥`)}>Attach GIF</button>
        </div>
        <div style={{ marginTop: 10 }}>
          {liveMessages.map((m) => (
            <p key={m.id}><span className="badge">{m.role}</span> {m.message}</p>
          ))}
          {liveMessages.length === 0 && <p className="muted">No live chat messages yet.</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Message Board</h2>
        <p className="muted">Forum topics and threaded replies (not linked to live chat).</p>

        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <label htmlFor="topic-title">Topic Title</label>
          <input id="topic-title" value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} placeholder="Ex: Week 3 predictions" />
          <label htmlFor="topic-body">Topic Body</label>
          <textarea id="topic-body" rows={3} value={topicBody} onChange={(e) => setTopicBody(e.target.value)} placeholder="Start a discussion..." />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={createTopic}>New Post</button>
            <button type="button" onClick={() => setTopics((prev) => [...prev])}>Refresh</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {topics.map((topic) => (
            <button key={topic.id} type="button" onClick={() => setActiveTopicId(topic.id)} style={{ textAlign: 'left' }}>
              <strong>{topic.title}</strong> <span className="muted">({topic.replies.length} replies)</span>
            </button>
          ))}
          {topics.length === 0 && <p className="muted">No topics yet. Post the first thread.</p>}
        </div>

        {activeTopic && (
          <div style={{ marginTop: 12 }}>
            <h3>{activeTopic.title}</h3>
            <p><span className="badge">{activeTopic.author}</span> {activeTopic.body}</p>
            {activeTopic.replies.map((reply) => (
              <p key={reply.id}><span className="badge">{reply.author}</span> {reply.message}</p>
            ))}
            <label htmlFor="reply-input">Reply</label>
            <textarea id="reply-input" rows={2} value={replyInput} onChange={(e) => setReplyInput(e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={postReply}>Post Reply</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
