'use client';

import { profileDisplayLabel } from '../../lib/profiles/display';

export default function TeamManager({ teams, seasons, profiles, players, onAdd, onEdit, onDelete }: any) {
  const profileById = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));

  return (
    <section className="card">
      <div className="section-header-row">
        <h2>Teams</h2>
        <button type="button" onClick={onAdd}>Add Team</button>
      </div>
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Season</th>
              <th>Captain</th>
              <th>Roster</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team: any) => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td>{seasons.find((season: any) => season.id === team.season_id)?.name || team.season_id}</td>
                <td>{team.captain_user_id ? profileDisplayLabel(profileById.get(team.captain_user_id) as any) : '-'}</td>
                <td>{players.filter((player: any) => player.team_id === team.id).length}</td>
                <td>
                  <div className="button-row">
                    <button type="button" onClick={() => onEdit(team)}>Edit</button>
                    <button type="button" onClick={() => {
                      if (window.confirm(`Delete ${team.name}?`)) onDelete(team);
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
