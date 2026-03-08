export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <div className="admin-shell-header">
        <h1 style={{ margin: 0 }}>League Operations</h1>
        <p className="muted" style={{ marginTop: 6 }}>Seasonal roller hockey administration dashboard</p>
      </div>
      {children}
    </div>
  );
}
