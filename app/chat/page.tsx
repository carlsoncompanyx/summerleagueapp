import ChatClient from '../../components/ChatClient';
import { getLeagueSnapshot } from '../../lib/league-data';

export default async function ChatPage() {
  const data = await getLeagueSnapshot();
  return (
    <main>
      <h1>Community</h1>
      {'unavailable' in data && data.unavailable ? <p>{data.reason}</p> : <ChatClient seasonId={data.season?.id} />}
    </main>
  );
}
