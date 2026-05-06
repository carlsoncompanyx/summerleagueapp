import { getLeagueSnapshot } from '../../lib/league-data';
import ScheduleClient from './ScheduleClient';

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const data = await getLeagueSnapshot();
  if ('unavailable' in data && data.unavailable) {
    return <main><h1>Games</h1><p>{data.reason}</p></main>;
  }

  return (
    <main>
      <h1>Games</h1>
      <ScheduleClient
        schedule={data.schedule}
        teams={data.teams}
        initialDate={params.date || ''}
        initialStatus={params.status || 'all'}
        initialTeam={params.team || 'all'}
      />
    </main>
  );
}
