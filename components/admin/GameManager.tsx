'use client';

import { useMemo, useState } from 'react';

type GameTab = 'upcoming' | 'completed';

function gameDate(value: unknown) {
  const date = new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(value: unknown) {
  return gameDate(value)?.toLocaleDateString() ?? 'Invalid date';
}

function formatTime(value: unknown) {
  return gameDate(value)?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) ?? '-';
}

function scoreText(game: any) {
  const away = Number(game.away_score ?? 0);
  const home = Number(game.home_score ?? 0);
  if (String(game.status || '').toUpperCase() === 'FINAL' || away || home) return `${away}-${home}`;
  return '-';
}

export default function GameManager({ games = [], teams = [], error, onAdd, onImport, onEdit, onBulk, onEnterScore }: any) {
  const safeGames = Array.isArray(games) ? games : [];
  const safeTeams = Array.isArray(teams) ? teams : [];
  const [tab, setTab] = useState<GameTab>('upcoming');
  const teamName = (id: string) => safeTeams.find((team: any) => team.id === id)?.name || 'Unknown team';
  const errorMessage = typeof error === 'string' ? error : error?.message;
  const errorHint = typeof error === 'object' ? error?.hint : null;

  const upcomingGames = useMemo(() => safeGames
    .filter((game: any) => {
      const status = String(game.status || 'SCHEDULED').toUpperCase();
      return status !== 'FINAL' && status !== 'CANCELED';
    })
    .sort((a: any, b: any) => (gameDate(a.scheduled_at)?.getTime() ?? 0) - (gameDate(b.scheduled_at)?.getTime() ?? 0)), [safeGames]);

  const completedGames = useMemo(() => safeGames
    .filter((game: any) => String(game.status || '').toUpperCase() === 'FINAL')
    .sort((a: any, b: any) => (gameDate(b.scheduled_at)?.getTime() ?? 0) - (gameDate(a.scheduled_at)?.getTime() ?? 0)), [safeGames]);

  const visibleGames = tab === 'upcoming' ? upcomingGames : completedGames;
  const cancelGame = (game: any) => onBulk?.('cancel', [game.id]);
  const deleteGame = (game: any) => onBulk?.('delete', [game.id]);

  return (
    <section className="card">
      <div className="section-header-row">
        <h2>Games</h2>
        <div className="button-row">
          <button type="button" onClick={onAdd}>Add Game</button>
          <button type="button" onClick={onImport}>Import Schedule</button>
        </div>
      </div>

      {errorMessage && <p>{errorMessage}{errorHint ? ` Hint: ${errorHint}` : ''}</p>}

      <div className="admin-subtabs" role="tablist" aria-label="Game status">
        <button type="button" className={tab === 'upcoming' ? 'is-active' : ''} onClick={() => setTab('upcoming')}>
          Upcoming Games
        </button>
        <button type="button" className={tab === 'completed' ? 'is-active' : ''} onClick={() => setTab('completed')}>
          Completed Games
        </button>
      </div>

      <div className="responsive-table">
        <table className="table admin-games-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Away</th>
              <th>Home</th>
              <th>Location</th>
              <th>Status</th>
              <th>Score</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleGames.map((game: any) => {
              const status = String(game.status || 'SCHEDULED').toUpperCase();
              return (
                <tr key={game.id}>
                  <td>{formatDate(game.scheduled_at)}</td>
                  <td>{formatTime(game.scheduled_at)}</td>
                  <td>{teamName(game.away_team)}</td>
                  <td>{teamName(game.home_team)}</td>
                  <td>{game.location || '-'}</td>
                  <td>{status}</td>
                  <td>{scoreText(game)}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" onClick={() => onEnterScore(game)}>{status === 'FINAL' ? 'Edit Score' : 'Enter Score'}</button>
                      <button type="button" onClick={() => onEdit(game)}>Edit Game</button>
                      {status !== 'FINAL' && <button type="button" onClick={() => cancelGame(game)}>Cancel</button>}
                      <button type="button" onClick={() => deleteGame(game)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!visibleGames.length && <p className="muted">{tab === 'upcoming' ? 'No upcoming games.' : 'No completed games yet.'}</p>}
    </section>
  );
}
