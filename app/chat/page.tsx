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
            <h2 className="section-title">Live Chatroom</h2>
            <p className="muted">Realtime chat stream can be mounted here with Supabase Realtime.</p>
            <form>
              <label htmlFor="chat-input">Message</label><br />
              <input id="chat-input" name="chat-input" placeholder="Talk some trash..." style={{ width: '100%', marginTop: 6 }} />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="button">Send</button>
                <button type="button">Attach GIF</button>
              </div>
            </form>
          </section>

          <section className="card">
            <h2 className="section-title">Message Board</h2>
            <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
              <button type="button">New Post</button>
              <button type="button">Refresh</button>
            </div>
            {data.chatMessages.map((m: any) => (
              <p key={m.id}><span className="badge">{m.role}</span> {m.message}</p>
            ))}
            {data.chatMessages.length === 0 && <p className="muted">No posts yet.</p>}
          </section>
        </div>
      )}
    </main>
  );
}
