'use client';

type PlayerCardProps = {
  name: string;
  teamName?: string | null;
  position?: string | null;
  gp?: number;
  goals?: number;
  assists?: number;
  points?: number;
  wins?: number;
  goalsAgainst?: number;
  recentForm?: string;
  compact?: boolean;
};

export default function PlayerStatCard({
  name,
  teamName,
  position,
  gp = 0,
  goals = 0,
  assists = 0,
  points = goals + assists,
  wins = 0,
  goalsAgainst = 0,
  recentForm,
  compact = false,
}: PlayerCardProps) {
  const isGoalie = (position || '').toLowerCase().includes('goal');
  const gaa = gp > 0 ? (goalsAgainst / gp).toFixed(2) : '0.00';

  return (
    <article className="card" style={{ padding: compact ? 10 : 14 }}>
      <h3 className="card-title" style={{ marginBottom: 6 }}>{name}</h3>
      <p className="muted" style={{ marginTop: 0 }}>{teamName ?? 'Free Agent'} · {position ?? 'N/A'}</p>
      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div><strong>GP</strong><br />{gp}</div>
        <div><strong>G</strong><br />{goals}</div>
        <div><strong>A</strong><br />{assists}</div>
        <div><strong>P</strong><br />{points}</div>
      </div>
      <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
        {isGoalie ? `Wins: ${wins} · GAA: ${gaa}` : `Points: ${points}`}
        {recentForm ? ` · Form: ${recentForm}` : ''}
      </p>
    </article>
  );
}
