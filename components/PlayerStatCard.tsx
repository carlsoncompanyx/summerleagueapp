'use client';

type PlayerCardProps = {
  name: string;
  teamName?: string | null;
  position?: string | null;
  gp?: number;
  goals?: number;
  assists?: number;
  fantasyPoints?: number;
  fantasyAvg?: number;
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
  fantasyPoints = 0,
  fantasyAvg = 0,
  recentForm,
  compact = false,
}: PlayerCardProps) {
  return (
    <article className="card" style={{ padding: compact ? 10 : 14 }}>
      <h3 className="card-title" style={{ marginBottom: 6 }}>{name}</h3>
      <p className="muted" style={{ marginTop: 0 }}>{teamName ?? 'Free Agent'} · {position ?? 'N/A'}</p>
      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div><strong>GP</strong><br />{gp}</div>
        <div><strong>G</strong><br />{goals}</div>
        <div><strong>A</strong><br />{assists}</div>
        <div><strong>FP</strong><br />{fantasyPoints.toFixed(1)}</div>
      </div>
      <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
        Avg: {fantasyAvg.toFixed(2)} FP/GP{recentForm ? ` · Form: ${recentForm}` : ''}
      </p>
    </article>
  );
}
