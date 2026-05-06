'use client';

import { useMemo, useState } from 'react';
import { formatPublicDateTime } from '../../lib/formatters';

type ScheduleClientProps = {
  schedule: any[];
};

type GamesTab = 'upcoming' | 'completed';

function datePart(scheduledAt: string) {
  return formatPublicDateTime(scheduledAt).split(' at ')[0] ?? String(scheduledAt).slice(0, 10);
}

function timePart(scheduledAt: string) {
  return formatPublicDateTime(scheduledAt).split(' at ')[1] ?? '';
}

function gameScore(game: any) {
  if (String(game.status) !== 'FINAL') return '—';
  const away = game.away_score ?? '-';
  const home = game.home_score ?? '-';
  return `${away} - ${home}`;
}

export default function ScheduleClient({ schedule }: ScheduleClientProps) {
  const [activeTab, setActiveTab] = useState<GamesTab>('upcoming');

  const upcomingGames = useMemo(() => schedule
    .filter((game: any) => !['FINAL', 'CANCELED'].includes(String(game.status).toUpperCase()))
    .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()), [schedule]);

  const completedGames = useMemo(() => schedule
    .filter((game: any) => String(game.status).toUpperCase() === 'FINAL')
    .sort((a: any, b: any) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()), [schedule]);

  const games = activeTab === 'upcoming' ? upcomingGames : completedGames;

  return (
    <section className="card">
      <div className="tabs" role="tablist" aria-label="Games view">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'upcoming'}
          className={activeTab === 'upcoming' ? 'active' : ''}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming Games
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'completed'}
          className={activeTab === 'completed' ? 'active' : ''}
          onClick={() => setActiveTab('completed')}
        >
          Completed Games
        </button>
      </div>

      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Away</th>
              <th>Home</th>
              <th>Location</th>
              <th>Status</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game: any) => (
              <tr key={game.id}>
                <td>{datePart(game.scheduled_at)}</td>
                <td>{timePart(game.scheduled_at)}</td>
                <td>{game.away_team_name}</td>
                <td>{game.home_team_name}</td>
                <td>{game.location || '—'}</td>
                <td>{game.status}</td>
                <td><strong>{gameScore(game)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!games.length && <p className="muted">No {activeTab === 'upcoming' ? 'upcoming' : 'completed'} games found.</p>}
    </section>
  );
}
