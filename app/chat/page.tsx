import ChatClient from '../../components/ChatClient';
import { getLeagueSnapshot } from '../../lib/league-data';

export default async function ChatPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Shit Talk</h1>
      {'unavailable' in data && data.unavailable ? (
        <p>{data.reason}</p>
      ) : (
        <ChatClient initialMessages={data.chatMessages.map((m: any) => ({ id: m.id, role: m.role, message: m.message }))} />
      )}
    </main>
  );
}
