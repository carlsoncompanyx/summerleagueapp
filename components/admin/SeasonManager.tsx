'use client';

export default function SeasonManager({ seasons, currentSeasonId, onAdd, onEdit, onDelete }: any) {
  return (
    <section className="card">
      <div className="section-header-row">
        <h2>Seasons</h2>
        <button type="button" onClick={onAdd}>Add Season</button>
      </div>
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Dates</th>
              <th>Current</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((season: any) => (
              <tr key={season.id}>
                <td>{season.name}</td>
                <td>{season.start_date} - {season.end_date}</td>
                <td>{season.id === currentSeasonId ? 'Yes' : '-'}</td>
                <td>
                  <div className="button-row">
                    <button type="button" onClick={() => onEdit(season)}>Edit</button>
                    <button type="button" onClick={() => {
                      if (window.confirm(`Delete ${season.name}?`)) onDelete(season);
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
