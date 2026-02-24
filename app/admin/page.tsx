export default function AdminPage() {
  return (
    <main>
      <h1>Admin</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Player Information & Registration</h2>
        <p className="muted">Update player records, approve season registrations, and resolve duplicate profile issues.</p>
        <button type="button">Manage Players & Registrations</button>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Schedule Management</h2>
        <p className="muted">Edit game dates manually or import games via CSV upload.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button">Update Schedule</button>
          <button type="button">Import CSV</button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Game Scores</h2>
        <p className="muted">Input game results and finalize scores for standings/statistics updates.</p>
        <button type="button">Enter Game Scores</button>
      </section>
    </main>
  );
}
