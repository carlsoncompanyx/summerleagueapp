'use client';

import { useMemo, useState } from 'react';

type PlayerStat = {
  player_id: string;
  name: string;
  team_name?: string;
  position?: string | null;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
  wins?: number;
  goals_against?: number;
  fantasy_points?: number;
  fantasy_points_avg?: number;
};

type SkaterSortKey = 'name' | 'team' | 'gp' | 'goals' | 'assists' | 'points' | 'ppg' | 'fantasy';
type GoalieSortKey = 'name' | 'team' | 'gp' | 'ga' | 'gaa' | 'fantasy';
type SortDir = 'asc' | 'desc';

function isGoalie(row: PlayerStat) {
  return String(row.position ?? '').toLowerCase().includes('goal');
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ppg(row: PlayerStat) {
  return num(row.games_played) > 0 ? num(row.points) / num(row.games_played) : 0;
}

function gaa(row: PlayerStat) {
  return num(row.games_played) > 0 ? num(row.goals_against) / num(row.games_played) : 0;
}

function fantasyPpg(row: PlayerStat) {
  return num(row.games_played) > 0 ? num(row.fantasy_points) / num(row.games_played) : 0;
}

function formatDecimal(value: number) {
  return value.toFixed(2);
}

function LeaderCard({
  title,
  rows,
  value,
}: {
  title: string;
  rows: PlayerStat[];
  value: (row: PlayerStat) => string;
}) {
  return (
    <article className="leader-card">
      <h3 className="card-title">{title}</h3>
      {rows.length ? (
        <ol className="leader-list">
          {rows.map((row, index) => (
            <li key={`${title}-${row.player_id}`} className="leader-row">
              <span className="leader-rank">{index + 1}</span>
              <span className="leader-player">
                <strong>{row.name}</strong>
                <span className="muted">{row.team_name || 'Unassigned'}</span>
              </span>
              <span className="leader-value">{value(row)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No data yet.</p>
      )}
    </article>
  );
}

export default function StatisticsClient({ data }: { data: any }) {
  const rows = (data?.players ?? []) as PlayerStat[];
  const teamOptions = useMemo(() => ['All Teams', ...Array.from(new Set(rows.map((r) => r.team_name || 'Unassigned'))).sort()], [rows]);
  const [teamFilter, setTeamFilter] = useState('All Teams');
  const [skaterSort, setSkaterSort] = useState<{ key: SkaterSortKey; dir: SortDir }>({ key: 'points', dir: 'desc' });
  const [goalieSort, setGoalieSort] = useState<{ key: GoalieSortKey; dir: SortDir }>({ key: 'gaa', dir: 'asc' });

  const filtered = teamFilter === 'All Teams' ? rows : rows.filter((r) => (r.team_name || 'Unassigned') === teamFilter);
  const skaters = filtered.filter((r) => !isGoalie(r));
  const goalies = filtered.filter(isGoalie);

  const leaders = useMemo(() => {
    const skaterPool = rows.filter((row) => !isGoalie(row));
    const goaliePool = rows.filter((row) => isGoalie(row));
    return {
      goals: [...skaterPool].filter((row) => num(row.goals) > 0).sort((a, b) => num(b.goals) - num(a.goals) || num(b.points) - num(a.points)).slice(0, 5),
      assists: [...skaterPool].filter((row) => num(row.assists) > 0).sort((a, b) => num(b.assists) - num(a.assists) || num(b.points) - num(a.points)).slice(0, 5),
      points: [...skaterPool].filter((row) => num(row.points) > 0).sort((a, b) => num(b.points) - num(a.points) || num(b.goals) - num(a.goals)).slice(0, 5),
      ppg: [...skaterPool].filter((row) => num(row.games_played) > 0).sort((a, b) => ppg(b) - ppg(a) || num(b.points) - num(a.points)).slice(0, 5),
      gaa: [...goaliePool].filter((row) => num(row.games_played) > 0).sort((a, b) => gaa(a) - gaa(b) || num(b.games_played) - num(a.games_played)).slice(0, 5),
    };
  }, [rows]);

  function sortSkaters(key: SkaterSortKey) {
    setSkaterSort((current) => ({
      key,
      dir: current.key === key ? (current.dir === 'asc' ? 'desc' : 'asc') : 'desc',
    }));
  }

  function sortGoalies(key: GoalieSortKey) {
    setGoalieSort((current) => ({
      key,
      dir: current.key === key ? (current.dir === 'asc' ? 'desc' : 'asc') : key === 'gaa' ? 'asc' : 'desc',
    }));
  }

  const sortedSkaters = useMemo(() => {
    const value = (row: PlayerStat) => {
      if (skaterSort.key === 'name') return row.name;
      if (skaterSort.key === 'team') return row.team_name || 'Unassigned';
      if (skaterSort.key === 'gp') return num(row.games_played);
      if (skaterSort.key === 'goals') return num(row.goals);
      if (skaterSort.key === 'assists') return num(row.assists);
      if (skaterSort.key === 'ppg') return ppg(row);
      if (skaterSort.key === 'fantasy') return fantasyPpg(row);
      return num(row.points);
    };
    return [...skaters].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const result = typeof av === 'string' || typeof bv === 'string'
        ? String(av).localeCompare(String(bv))
        : Number(av) - Number(bv);
      const sorted = skaterSort.dir === 'asc' ? result : -result;
      return sorted || num(b.points) - num(a.points) || num(b.goals) - num(a.goals) || a.name.localeCompare(b.name);
    });
  }, [skaters, skaterSort]);

  const sortedGoalies = useMemo(() => {
    const value = (row: PlayerStat) => {
      if (goalieSort.key === 'name') return row.name;
      if (goalieSort.key === 'team') return row.team_name || 'Unassigned';
      if (goalieSort.key === 'gp') return num(row.games_played);
      if (goalieSort.key === 'ga') return num(row.goals_against);
      if (goalieSort.key === 'fantasy') return fantasyPpg(row);
      return gaa(row);
    };
    return [...goalies].sort((a, b) => {
      const aHasGp = num(a.games_played) > 0 ? 0 : 1;
      const bHasGp = num(b.games_played) > 0 ? 0 : 1;
      if (goalieSort.key === 'gaa' && aHasGp !== bHasGp) return aHasGp - bHasGp;
      const av = value(a);
      const bv = value(b);
      const result = typeof av === 'string' || typeof bv === 'string'
        ? String(av).localeCompare(String(bv))
        : Number(av) - Number(bv);
      return (goalieSort.dir === 'asc' ? result : -result) || num(b.games_played) - num(a.games_played) || a.name.localeCompare(b.name);
    });
  }, [goalies, goalieSort]);

  const sortLabel = (key: string, active: string, dir: SortDir) => active === key ? (dir === 'asc' ? ' up' : ' down') : '';

  return (
    <main>
      <h1>Statistics</h1>
      <p className="muted">Definitions: GP=Games Played, G=Goals, A=Assists, PTS=Points, GAA=Goals Against Average.</p>
      {!rows.length && <section className="card"><p className="muted">No statistics available yet. Stats publish after official game sheets are entered.</p></section>}

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">League Leaders</h2>
        <div className="leader-grid">
          <LeaderCard title="Goals" rows={leaders.goals} value={(row) => String(num(row.goals))} />
          <LeaderCard title="Assists" rows={leaders.assists} value={(row) => String(num(row.assists))} />
          <LeaderCard title="Points" rows={leaders.points} value={(row) => String(num(row.points))} />
          <LeaderCard title="Points Per Game" rows={leaders.ppg} value={(row) => formatDecimal(ppg(row))} />
          <LeaderCard title="Goalie GAA" rows={leaders.gaa} value={(row) => formatDecimal(gaa(row))} />
        </div>
      </section>

      <section className="card">
        <div className="section-header-row">
          <h2 className="section-title">All Stats</h2>
          <div className="stats-filter">
            <label htmlFor="team-filter">Team</label>
            <select id="team-filter" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
          </div>
        </div>

        <h3 className="card-title">Skater Stats</h3>
        <div className="responsive-table stats-table-wrap">
          <table className="table stats-table">
            <thead>
              <tr>
                <th><button type="button" className="table-sort" onClick={() => sortSkaters('name')}>Player{sortLabel('name', skaterSort.key, skaterSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortSkaters('team')}>Team{sortLabel('team', skaterSort.key, skaterSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortSkaters('gp')}>GP{sortLabel('gp', skaterSort.key, skaterSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortSkaters('goals')}>G{sortLabel('goals', skaterSort.key, skaterSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortSkaters('assists')}>A{sortLabel('assists', skaterSort.key, skaterSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortSkaters('points')}>PTS{sortLabel('points', skaterSort.key, skaterSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortSkaters('ppg')}>PPG{sortLabel('ppg', skaterSort.key, skaterSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortSkaters('fantasy')}>Fantasy PPG{sortLabel('fantasy', skaterSort.key, skaterSort.dir)}</button></th>
              </tr>
            </thead>
            <tbody>
              {sortedSkaters.map((row) => (
                <tr key={row.player_id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.team_name || 'Unassigned'}</td>
                  <td>{num(row.games_played)}</td>
                  <td>{num(row.goals)}</td>
                  <td>{num(row.assists)}</td>
                  <td><strong>{num(row.points)}</strong></td>
                  <td>{formatDecimal(ppg(row))}</td>
                  <td>{formatDecimal(fantasyPpg(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sortedSkaters.length && <p className="muted">No skater statistics match this filter yet.</p>}
        </div>

        <h3 className="card-title stats-subtitle">Goalie Stats</h3>
        <div className="responsive-table stats-table-wrap">
          <table className="table stats-table">
            <thead>
              <tr>
                <th><button type="button" className="table-sort" onClick={() => sortGoalies('name')}>Goalie{sortLabel('name', goalieSort.key, goalieSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortGoalies('team')}>Team{sortLabel('team', goalieSort.key, goalieSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortGoalies('gp')}>GP{sortLabel('gp', goalieSort.key, goalieSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortGoalies('ga')}>GA{sortLabel('ga', goalieSort.key, goalieSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortGoalies('gaa')}>GAA{sortLabel('gaa', goalieSort.key, goalieSort.dir)}</button></th>
                <th><button type="button" className="table-sort" onClick={() => sortGoalies('fantasy')}>Fantasy PPG{sortLabel('fantasy', goalieSort.key, goalieSort.dir)}</button></th>
              </tr>
            </thead>
            <tbody>
              {sortedGoalies.map((row) => (
                <tr key={row.player_id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.team_name || 'Unassigned'}</td>
                  <td>{num(row.games_played)}</td>
                  <td>{num(row.goals_against)}</td>
                  <td><strong>{num(row.games_played) > 0 ? formatDecimal(gaa(row)) : '-'}</strong></td>
                  <td>{formatDecimal(fantasyPpg(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sortedGoalies.length && <p className="muted">No goalie statistics match this filter yet.</p>}
        </div>
      </section>
    </main>
  );
}
