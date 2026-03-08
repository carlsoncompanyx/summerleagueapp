import AdminClient from '../../components/AdminClient';
import { getLeagueSnapshot } from '../../lib/league-data';

export default async function AdminPage() {
  const data = await getLeagueSnapshot();

  if ('unavailable' in data && data.unavailable) {
    return <main><h1>Admin</h1><p>{data.reason}</p></main>;
  }

  return <AdminClient schedule={data.schedule} players={data.players} />;
}
