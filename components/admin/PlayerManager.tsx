'use client';

import { profileDisplayLabel } from '../../lib/profiles/display';

export default function PlayerManager({ players, teams, profiles, onAdd, onImport, onEdit }: any) {
  const profileById = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));

  return (
    <section className="card">
      <div className="section-header-row">
        <h2>Players</h2>
        <div className="button-row">
          <button type="button" onClick={onAdd}>Add Player</button>
          <button type="button" onClick={onImport}>Import Players</button>
        </div>
      </div>
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Team</th>
              <th>Position</th>
              <th>Linked User</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player: any) => {
              const profile = player.user_id ? profileById.get(player.user_id) : null;
              return (
                <tr key={player.id}>
                  <td>{player.jersey ?? '-'}</td>
                  <td>{player.name}</td>
                  <td>{teams.find((team: any) => team.id === player.team_id)?.name || 'Unassigned'}</td>
                  <td>{player.position || '-'}</td>
                  <td>{profile ? profileDisplayLabel(profile as any) : 'Unlinked'}</td>
                  <td>{profile ? (profile as any).role || 'PLAYER' : 'Unlinked'}</td>
                  <td><button type="button" onClick={() => onEdit(player)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
