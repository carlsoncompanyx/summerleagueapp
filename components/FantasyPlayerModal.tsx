'use client';

type Props = {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  details: any;
  salary?: number;
  projection?: number;
  onAddToLineup?: () => void;
};

export default function FantasyPlayerModal({ open, onClose, loading, details, salary, projection, onAddToLineup }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="card modal-card" style={{ maxWidth: 900 }}>
        <h2 className="section-title">Fantasy Player Detail</h2>
        {loading && <p>Loading player research...</p>}
        {!loading && !details && <p className="muted">No player details found.</p>}

        {!loading && details && (
          <>
            <div className="form-grid" style={{ marginTop: 0 }}>
              <div className="form-field col-6"><label>Player</label><div>{details.player?.name}</div></div>
              <div className="form-field col-6"><label>Team / Position</label><div>{details.team?.name ?? 'Free Agent'} · {details.player?.position ?? '-'}</div></div>
              <div className="form-field col-4"><label>Current GP</label><div>{details.current?.games_played ?? 0}</div></div>
              <div className="form-field col-4"><label>Current G / A / P</label><div>{details.current?.goals ?? 0} / {details.current?.assists ?? 0} / {details.current?.points ?? 0}</div></div>
              <div className="form-field col-4"><label>Current Fantasy</label><div>{Number(details.current?.fantasy_points ?? 0).toFixed(1)} ({Number(details.current?.fantasy_points_avg ?? 0).toFixed(2)} FP/GP)</div></div>
              <div className="form-field col-6"><label>Current Projection</label><div>{projection != null ? Number(projection).toFixed(2) : '-'}</div></div>
              <div className="form-field col-6"><label>Current Salary</label><div>{salary != null ? `$${salary}` : '-'}</div></div>
              <div className="form-field col-12"><label>Pricing Context</label><div>{details.pricingContext?.sourceLabel ?? 'Fallback baseline used.'}</div></div>
            </div>

            <h3 style={{ marginTop: 14 }}>Historical Seasons (Fantasy Research Only)</h3>
            <table className="table">
              <thead><tr><th>Season</th><th>Goals</th><th>Assists</th><th>Points</th><th>Source</th></tr></thead>
              <tbody>
                {(details.historical ?? []).map((row: any) => (
                  <tr key={row.id}><td>{row.season_label}</td><td>{row.goals}</td><td>{row.assists}</td><td>{row.points}</td><td>{row.source}</td></tr>
                ))}
              </tbody>
            </table>
            {(!details.historical || details.historical.length === 0) && <p className="muted">No historical season imports available for this player yet.</p>}

            <div className="form-grid">
              <div className="form-field col-4"><label>Historical Goals</label><div>{details.historicalSummary?.goals ?? 0}</div></div>
              <div className="form-field col-4"><label>Historical Assists</label><div>{details.historicalSummary?.assists ?? 0}</div></div>
              <div className="form-field col-4"><label>Avg Points / Season</label><div>{details.historicalSummary?.avgPointsPerSeason ?? 0}</div></div>
            </div>
          </>
        )}

        <div className="form-actions" style={{ marginTop: 12 }}>
          {onAddToLineup && <button onClick={onAddToLineup}>Add to Lineup</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
