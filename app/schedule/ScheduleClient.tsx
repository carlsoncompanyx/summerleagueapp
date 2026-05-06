'use client';

import { useMemo, useState } from 'react';
import { formatPublicDateTime } from '../../lib/formatters';

const GAME_FILTER_STATUSES = ['SCHEDULED', 'LIVE', 'FINAL'];

type ScheduleClientProps = {
  schedule: any[];
  teams: any[];
  initialDate?: string;
  initialStatus?: string;
  initialTeam?: string;
};

export default function ScheduleClient({
  schedule,
  teams,
  initialDate = '',
  initialStatus = 'all',
  initialTeam = 'all',
}: ScheduleClientProps) {
  const activeGames = useMemo(
    () => schedule.filter((game: any) => !['CANCELED'].includes(String(game.status))),
    [schedule],
  );
  const dates = useMemo(
    () => Array.from(new Set(activeGames.map((game: any) => String(game.scheduled_at).slice(0, 10)))),
    [activeGames],
  );
  const defaultDate = useMemo(
    () => activeGames.find((game: any) => new Date(game.scheduled_at).getTime() >= Date.now())?.scheduled_at?.slice(0, 10)
      || activeGames[0]?.scheduled_at?.slice(0, 10)
      || '',
    [activeGames],
  );

  const [selectedDate, setSelectedDate] = useState(initialDate || defaultDate);
  const [status, setStatus] = useState(initialStatus);
  const [team, setTeam] = useState(initialTeam);

  const grouped = useMemo(() => {
    const filtered = activeGames.filter((game: any) =>
      (team === 'all' || game.home_team === team || game.away_team === team)
      && (status === 'all' || game.status === status)
      && (!selectedDate || String(game.scheduled_at).slice(0, 10) === selectedDate),
    );
    return filtered.reduce((acc: Record<string, any[]>, game: any) => {
      const key = String(game.scheduled_at).slice(0, 10);
      acc[key] = acc[key] || [];
      acc[key].push(game);
      return acc;
    }, {});
  }, [activeGames, selectedDate, status, team]);

  return (
    <>
      <section className="card" style={{ marginBottom: 12 }}>
        <div className="button-row">
          <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
            {dates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All Statuses</option>
            {GAME_FILTER_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={team} onChange={(event) => setTeam(event.target.value)}>
            <option value="all">All Teams</option>
            {teams.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>
      </section>

      {Object.keys(grouped).length === 0
        ? <section className="card"><p className="muted">No games match these filters.</p></section>
        : Object.entries(grouped).map(([day, games]: any) => (
          <section key={day} className="card" style={{ marginBottom: 12 }}>
            <h2>{day}</h2>
            <div className="stack-list">
              {games.map((game: any) => (
                <article key={game.id} className="list-card">
                  <p><strong>{game.away_team_name}</strong> @ <strong>{game.home_team_name}</strong></p>
                  <p className="muted">{formatPublicDateTime(game.scheduled_at)} - {game.status}</p>
                  {['FINAL', 'LIVE'].includes(String(game.status))
                    ? <p className="muted">Score: {game.away_score}-{game.home_score}</p>
                    : null}
                </article>
              ))}
            </div>
          </section>
        ))}
    </>
  );
}
