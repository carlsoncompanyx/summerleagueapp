import { headers } from 'next/headers';
import DfsClient from '../../components/DfsClient';

async function loadInitialDfsData() {
  try {
    const h = await headers();
    const host = h.get('host');
    if (!host) return null;
    const proto = h.get('x-forwarded-proto') || (process.env.NODE_ENV === 'development' ? 'http' : 'https');
    const res = await fetch(`${proto}://${host}/api/dfs`, {
      cache: 'no-store',
      headers: { cookie: h.get('cookie') || '' },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DfsPage() {
  const initialData = await loadInitialDfsData();

  return (
    <main>
      <h1>DFS Contest Lobby</h1>
      {!initialData && (
        <section className="card" style={{ marginBottom: 12 }}>
          <p className="muted">Contest data is loading live from the server. If loading fails, use the in-page refresh and try again.</p>
        </section>
      )}
      <DfsClient initialData={initialData} />
    </main>
  );
}
