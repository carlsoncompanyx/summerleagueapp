import { getLeagueSnapshot } from '../../lib/league-data';
import ScheduleClient from './ScheduleClient';

export default async function SchedulePage() {
  const data = await getLeagueSnapshot();
  if ('unavailable' in data && data.unavailable) {
    return <main><h1>Games</h1><p>{data.reason}</p></main>;
  }

  return (
    <main>
      <h1>Games</h1>
      <ScheduleClient schedule={data.schedule} />
    </main>
  );
}
