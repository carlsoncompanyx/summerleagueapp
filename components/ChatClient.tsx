'use client';

import { useState } from 'react';

type ChatMessage = { id: string; role: string; message: string };

export default function ChatClient({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const [chatInput, setChatInput] = useState('');
  const [boardInput, setBoardInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    setMessages([{ id: String(Date.now()), role: 'PLAYER', message: chatInput }, ...messages]);
    setChatInput('');
  };

  const postBoard = () => {
    if (!boardInput.trim()) return;
    setMessages([{ id: String(Date.now()), role: 'FAN', message: boardInput }, ...messages]);
    setBoardInput('');
  };

  return (
    <div className="grid">
      <section className="card">
        <h2 className="section-title">Live Chatroom</h2>
        <p className="muted">
          This demo lets you post locally. For persistent realtime chat, enable Supabase Realtime on
          <code> chat_messages </code> and ensure authenticated users can insert rows.
        </p>
        <label htmlFor="chat-input">Message</label><br />
        <input id="chat-input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Talk some trash..." style={{ width: '100%', marginTop: 6 }} />
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" onClick={sendChat}>Send</button>
          <button type="button" onClick={() => setChatInput((v) => `${v} 🔥`)}>Attach GIF</button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Message Board</h2>
        <label htmlFor="board-input">New Post</label><br />
        <textarea id="board-input" value={boardInput} onChange={(e) => setBoardInput(e.target.value)} rows={3} placeholder="Post to the board..." style={{ width: '100%', marginTop: 6 }} />
        <div style={{ marginBottom: 10, marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" onClick={postBoard}>New Post</button>
          <button type="button" onClick={() => setMessages([...messages])}>Refresh</button>
        </div>
        {messages.map((m) => (
          <p key={m.id}><span className="badge">{m.role}</span> {m.message}</p>
        ))}
        {messages.length === 0 && <p className="muted">No posts yet.</p>}
      </section>
    </div>
  );
}
