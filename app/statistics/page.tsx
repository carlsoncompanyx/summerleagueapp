import { getLeagueSnapshot } from '../../lib/league-data';
import StatisticsClient from '../../components/StatisticsClient';

export default async function StatisticsPage() {
  const data = await getLeagueSnapshot();
  return <StatisticsClient data={data} />;
}
