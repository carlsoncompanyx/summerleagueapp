import StatisticsClient from '../../components/StatisticsClient';
import { getSeasonStats } from '../../lib/stats/getStats';

export default async function StatisticsPage() {
  const data = await getSeasonStats();
  return <StatisticsClient data={data} />;
}
