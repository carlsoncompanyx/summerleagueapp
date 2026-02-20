import InstallPrompt from '../components/InstallPrompt';
import NavTabs from '../components/NavTabs';
import { Role } from '../lib/types';

const role: Role = 'ADMIN';

export default function HomePage() {
  return (
    <main>
      <h1>Emerald Coast Roller League (ECRL)</h1>
      <p>Timezone: America/Chicago</p>
      <InstallPrompt />
      <NavTabs role={role} />

      <section className="section"><h2>Home</h2><p>Next games, standings snapshot, wallet summary.</p></section>
      <section className="section"><h2>Schedule</h2><p>Season games with location and status.</p></section>
      <section className="section"><h2>Standings</h2><p>W-L-OTL and points.</p></section>
      <section className="section"><h2>Leaders</h2><p>Goals, assists, points, PIM + goalie stats.</p></section>
      <section className="section"><h2>Betting</h2><p>Moneyline + player O/U 0.5 goals/points.</p></section>
      <section className="section"><h2>Wallet</h2><p>Beer Bucks balance and transactions.</p></section>
      <section className="section"><h2>Trades</h2><p>Captain proposals + admin approval flow.</p></section>
      <section className="section"><h2>Shit Talk</h2><p>Realtime league chat with moderation/reporting.</p></section>
      <section className="section"><h2>Admin</h2><p>Create season/team/game, finalize scores/stats, approve trades, manage packages.</p></section>
    </main>
  );
}
