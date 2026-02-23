import Link from 'next/link';

import { getLeagueSnapshot } from '../../lib/league-data';

export default async function ChatPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Shit Talk</h1>
      {'unavailable' in data && data.unavailable ? (
        <p>{data.reason}</p>
      ) : (
        <div className="grid">
          <section className="card">
            <h2 className="section-title">Message Board</h2>
            {data.chatMessages.map((m: any) => (
              <p key={m.id}><span className="badge">{m.role}</span> {m.message}</p>
            ))}
            {data.chatMessages.length === 0 && <p className="muted">No posts yet.</p>}
          </section>

          <section className="card">
            <h2 className="section-title">Live Chatroom</h2>
            <p className="muted">Realtime chat stream (Supabase Realtime) can be mounted here.</p>
            <form>
              <label htmlFor="chat-input">Message</label><br />
              <input id="chat-input" name="chat-input" placeholder="Type your chirp..." style={{ width: '100%', padding: 8, marginTop: 6 }} />
              <button type="button" style={{ marginTop: 8 }}>Send</button>
            </form>
          </section>
        </div>
      )}
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
