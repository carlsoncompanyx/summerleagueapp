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
        <div className="card">
          {data.chatMessages.map((m: any) => (
            <p key={m.id}><span className="badge">{m.role}</span> {m.message}</p>
          ))}
          {data.chatMessages.length === 0 && <p className="muted">No messages yet.</p>}
        </div>
      )}
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
