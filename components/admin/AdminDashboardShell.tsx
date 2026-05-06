'use client';

import { useEffect, useState } from 'react';
import AdminDashboardHome from './AdminDashboardHome';
import AdminModal from './AdminModal';
import AdminTabs from './AdminTabs';
import CsvImportModal from './CsvImportModal';
import DfsAdminPanel from './DfsAdminPanel';
import GameManager from './GameManager';
import PlayerManager from './PlayerManager';
import ScoreEntryModal from './ScoreEntryModal';
import SeasonManager from './SeasonManager';
import TeamManager from './TeamManager';
import { Tab } from './types';
import { toLeagueDateTimeInput } from '../../lib/formatters';
import { profileDisplayLabel } from '../../lib/profiles/display';

const GAME_STATUSES = ['SCHEDULED', 'LIVE', 'FINAL', 'CANCELED'];

export default function AdminDashboardShell({ data, role, testMode, runAction, refresh }: any) {
  const [active, setActive] = useState<Tab>('dashboard');
  const [seasonFilter, setSeasonFilter] = useState<string>(data.currentSeasonId || data.seasons?.[0]?.id || 'all');
  const [targetSeason, setTargetSeason] = useState(seasonFilter === 'all' ? (data.currentSeasonId || data.seasons?.[0]?.id || '') : seasonFilter);
  const [modal, setModal] = useState<any>(null);
  const [msg, setMsg] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date().toLocaleTimeString());

  const seasons = Array.isArray(data.seasons) ? data.seasons : [];
  const teams = Array.isArray(data.teams) ? data.teams : [];
  const players = Array.isArray(data.players) ? data.players : [];
  const games = Array.isArray(data.games) ? data.games : [];
  const trades = Array.isArray(data.trades) ? data.trades : [];
  const gameStats = Array.isArray(data.gameStats) ? data.gameStats : [];
  const profiles = Array.isArray(data.profiles) ? data.profiles : [];
  const datasetErrors = Array.isArray(data.datasetErrors) ? data.datasetErrors : [];
  const gamesError = datasetErrors.find((error: any) => error.dataset === 'games');
  const selectedSeasonId = seasonFilter === 'all' ? (data.currentSeasonId || seasons[0]?.id || '') : seasonFilter;

  useEffect(() => {
    setTargetSeason(selectedSeasonId);
  }, [selectedSeasonId]);

  const seasonTeams = seasonFilter === 'all' ? teams : teams.filter((team: any) => team.season_id === seasonFilter);
  const seasonPlayers = seasonFilter === 'all' ? players : players.filter((player: any) => player.season_id === seasonFilter);
  const seasonGames = seasonFilter === 'all' ? games : games.filter((game: any) => game.season_id === seasonFilter);
  const unassigned = seasonPlayers.filter((player: any) => !player.team_id).length;
  const upcoming = seasonGames.filter((game: any) => {
    const timestamp = new Date(game.scheduled_at).getTime();
    return Number.isFinite(timestamp) && timestamp > Date.now();
  }).length;
  const pendingTrades = trades.filter((trade: any) => String(trade.status).includes('proposed') || String(trade.status).includes('accepted')).length;
  const recentFinal = [...seasonGames]
    .filter((game: any) => game.status === 'FINAL')
    .sort((a: any, b: any) => {
      const bTime = new Date(b.scheduled_at).getTime();
      const aTime = new Date(a.scheduled_at).getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    })
    .slice(0, 5);

  const profileById = new Map(profiles.map((profile: any) => [profile.user_id, profile]));

  async function submit(action: string, payload: any, options: { closeOnSuccess?: boolean } = {}) {
    const { closeOnSuccess = true } = options;
    setPending(true);
    const result = await runAction(action, payload);
    setPending(false);
    setMsg(result);
    if (result.ok) {
      await refresh();
      setLastRefreshed(new Date().toLocaleTimeString());
      if (closeOnSuccess) setModal(null);
    }
    return result;
  }

  const scoreGame = modal?.type === 'score' ? modal.item : null;
  const existingStats = scoreGame ? gameStats.filter((stat: any) => stat.game_id === scoreGame.id) : [];
  const scoreRoster = scoreGame ? players.filter((player: any) => player.team_id === scoreGame.home_team || player.team_id === scoreGame.away_team) : [];
  const scoreRows = modal?.rows || (existingStats.length
    ? existingStats.map((stat: any) => ({
      ...stat,
      position: players.find((player: any) => player.id === stat.player_id)?.position,
    }))
    : scoreRoster.map((player: any) => ({
      player_id: player.id,
      position: player.position,
      games_played: 0,
      goals: 0,
      assists: 0,
      goals_against: 0,
    })));

  function editableProfileRole(userId: string | null | undefined) {
    if (!userId) return '';
    const profile = profileById.get(userId) as any;
    if (profile?.role === 'ADMIN') return 'ADMIN';
    if (profile?.role === 'CAPTAIN') return 'CAPTAIN';
    return 'PLAYER';
  }

  function teamsForSeason(seasonId: string | null | undefined) {
    return teams.filter((team: any) => team.season_id === seasonId);
  }

  return (
    <main>
      <h1>League Operations Dashboard</h1>
      <p className="muted">Role: {role}{testMode ? ' (test mode active)' : ''} - Last refreshed {lastRefreshed}</p>
      {msg?.error && <p>{msg.error}</p>}
      {msg?.ok && <p>Saved.</p>}
      {msg?.data?.counts && <p>Inserted {msg.data.counts.inserted} - Updated {msg.data.counts.updated} - Skipped {msg.data.counts.skipped} - Errors {msg.data.counts.errors}</p>}

      <div className="form-field">
        <label>Working Season</label>
        <select value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}>
          <option value="all">All</option>
          {seasons.map((season: any) => <option key={season.id} value={season.id}>{season.name}</option>)}
        </select>
      </div>

      {data.diagnostics && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Admin Diagnostics</h2>
          <p className="muted">
            Local env source: {data.diagnostics.env?.localEnvFile} - Supabase host: {data.diagnostics.env?.adminUrlHost ?? 'missing'} - Role: {data.diagnostics.currentRole}
          </p>
          <p className="muted">
            Env present: public URL {String(data.diagnostics.env?.nextPublicSupabaseUrl)}, anon key {String(data.diagnostics.env?.nextPublicAnonKey)}, server URL {String(data.diagnostics.env?.supabaseUrl)}, service role {String(data.diagnostics.env?.serviceRoleKey)}.
          </p>
          <p className="muted">Resolved current season: {data.diagnostics.currentSeasonName ?? 'none'} ({data.diagnostics.currentSeasonId ?? 'none'})</p>
          {datasetErrors.length > 0 && (
            <ul>
              {datasetErrors.map((error: any) => (
                <li key={error.dataset}>{error.dataset}: {error.message}{error.hint ? ` Hint: ${error.hint}` : ''}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <AdminTabs active={active} onChange={setActive} />

      {active === 'dashboard' && (
        <AdminDashboardHome
          seasonName={(seasons.find((season: any) => season.id === selectedSeasonId) || { name: 'All' }).name}
          teams={seasonTeams.length}
          players={seasonPlayers.length}
          unassigned={unassigned}
          upcoming={upcoming}
          pendingTrades={pendingTrades}
          recentFinal={recentFinal}
          onAddPlayer={() => setModal({ type: 'player' })}
          onImportPlayers={() => setModal({ type: 'csv', kind: 'players' })}
          onImportGames={() => setModal({ type: 'csv', kind: 'games' })}
          onAddGame={() => setModal({ type: 'game' })}
          onEnterScores={() => setActive('scores')}
          onDfs={() => setActive('dfs')}
        />
      )}

      {active === 'players' && <PlayerManager players={seasonPlayers} teams={teams} profiles={profiles} onAdd={() => setModal({ type: 'player' })} onImport={() => setModal({ type: 'csv', kind: 'players' })} onEdit={(player: any) => setModal({ type: 'player', item: player })} />}
      {active === 'teams' && <TeamManager teams={seasonTeams} seasons={seasons} profiles={profiles} players={players} onAdd={() => setModal({ type: 'team' })} onEdit={(team: any) => setModal({ type: 'team', item: team })} onDelete={(team: any) => submit('team_delete', { id: team.id })} />}
      {active === 'seasons' && <SeasonManager seasons={seasons} currentSeasonId={data.currentSeasonId} onAdd={() => setModal({ type: 'season' })} onEdit={(season: any) => setModal({ type: 'season', item: season })} onDelete={(season: any) => submit('season_delete', { id: season.id })} />}
      {active === 'games' && <GameManager games={seasonGames} teams={teams} error={gamesError} onAdd={() => setModal({ type: 'game' })} onImport={() => setModal({ type: 'csv', kind: 'games' })} onEdit={(game: any) => setModal({ type: 'game', item: game })} onBulk={(mode: string, ids: string[]) => submit('games_bulk_update', { mode, ids })} onEnterScore={(game: any) => setModal({ type: 'score', item: game })} />}
      {active === 'scores' && (
        <section className="card">
          <h2>Scores</h2>
          {seasonGames.map((game: any) => (
            <div key={game.id} className="list-card compact">
              <p>{teams.find((team: any) => team.id === game.home_team)?.name} {game.home_score}-{game.away_score} {teams.find((team: any) => team.id === game.away_team)?.name}</p>
              <button type="button" onClick={() => setModal({ type: 'score', item: game })}>{game.status === 'FINAL' ? 'Update Score' : 'Enter Score'}</button>
            </div>
          ))}
        </section>
      )}
      {active === 'trades' && <section className="card"><h2>Trade Review</h2><p>Pending {pendingTrades}</p></section>}
      {active === 'dfs' && <DfsAdminPanel seasonId={selectedSeasonId || null} />}

      <AdminModal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.type === 'csv' ? 'CSV Import' : modal?.type === 'score' ? 'Score Entry' : 'Edit'}>
        {modal?.type === 'csv' && (
          <CsvImportModal
            kind={modal.kind}
            seasons={seasons}
            teams={teams}
            targetSeason={targetSeason}
            setTargetSeason={setTargetSeason}
            pending={pending}
            lastResult={msg}
            onSubmit={(kind: any, rows: any, target: any, dryRun: any, importMode: any, context: any) => submit(
              kind === 'players' ? 'import_players_csv' : 'import_games_csv',
              {
                rows,
                target_season_id: target,
                dry_run: dryRun,
                import_mode: kind === 'players' ? importMode : undefined,
                existing_schedule_mode: kind === 'games' ? importMode : undefined,
                mapped_fields: context?.mappedFields,
                mapped_field_list: context?.mappedFieldList,
              },
              { closeOnSuccess: false },
            )}
          />
        )}

        {modal?.type === 'player' && (() => {
          const item = modal.item || {};
          const form = modal.form || {
            id: item.id || '',
            name: item.name || '',
            jersey: item.jersey ?? '',
            position: item.position || '',
            team_id: item.team_id || '',
            season_id: item.season_id || targetSeason,
            user_id: item.user_id || '',
            profile_role: editableProfileRole(item.user_id),
          };
          const linkedProfile = form.user_id ? profileById.get(form.user_id) as any : null;
          const roleLocked = linkedProfile?.role === 'ADMIN';
          return (
            <div className="form-grid">
              <div className="form-field"><label>Name</label><input value={form.name} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, name: event.target.value } }))} /></div>
              <div className="form-field"><label>Jersey</label><input value={form.jersey} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, jersey: event.target.value } }))} /></div>
              <div className="form-field"><label>Position</label><input value={form.position} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, position: event.target.value } }))} /></div>
              <div className="form-field">
                <label>Season</label>
                <select value={form.season_id} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, season_id: event.target.value, team_id: '' } }))}>
                  <option value="">Select season</option>
                  {seasons.map((season: any) => <option key={season.id} value={season.id}>{season.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Team</label>
                <select value={form.team_id} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, team_id: event.target.value } }))}>
                  <option value="">Unassigned</option>
                  {teamsForSeason(form.season_id).map((team: any) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Linked User/Profile</label>
                <select value={form.user_id} onChange={(event) => {
                  const userId = event.target.value;
                  setModal((current: any) => ({ ...current, form: { ...form, user_id: userId, profile_role: editableProfileRole(userId) } }));
                }}>
                  <option value="">Unlinked</option>
                  {profiles.map((profile: any) => <option key={profile.user_id} value={profile.user_id}>{profileDisplayLabel(profile)}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Profile Role</label>
                <select value={roleLocked ? 'ADMIN' : form.profile_role} disabled={!form.user_id || roleLocked} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, profile_role: event.target.value } }))}>
                  {!form.user_id && <option value="">Unlinked</option>}
                  {roleLocked && <option value="ADMIN">ADMIN (not editable)</option>}
                  <option value="PLAYER">PLAYER</option>
                  <option value="CAPTAIN">CAPTAIN</option>
                </select>
              </div>
              <div className="form-actions"><button type="button" disabled={pending} onClick={() => submit(form.id ? 'player_update' : 'player_create', form)}>{pending ? 'Saving...' : 'Save Player'}</button></div>
            </div>
          );
        })()}

        {modal?.type === 'team' && (() => {
          const item = modal.item || {};
          const form = modal.form || { id: item.id || '', name: item.name || '', season_id: item.season_id || targetSeason, captain_user_id: item.captain_user_id || '', logo_url: item.logo_url || '' };
          return (
            <div className="form-grid">
              <div className="form-field"><label>Team Name</label><input value={form.name} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, name: event.target.value } }))} /></div>
              <div className="form-field">
                <label>Season</label>
                <select value={form.season_id} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, season_id: event.target.value } }))}>
                  <option value="">Select season</option>
                  {seasons.map((season: any) => <option key={season.id} value={season.id}>{season.name}</option>)}
                </select>
              </div>
              <div className="form-field"><label>Logo URL</label><input value={form.logo_url} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, logo_url: event.target.value } }))} /></div>
              <div className="form-field">
                <label>Captain</label>
                <select value={form.captain_user_id} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, captain_user_id: event.target.value } }))}>
                  <option value="">No captain</option>
                  {profiles.map((profile: any) => <option key={profile.user_id} value={profile.user_id}>{profileDisplayLabel(profile)}</option>)}
                </select>
              </div>
              <div className="form-actions"><button type="button" disabled={pending} onClick={() => submit(form.id ? 'team_update' : 'team_create', form)}>{pending ? 'Saving...' : 'Save Team'}</button></div>
            </div>
          );
        })()}

        {modal?.type === 'season' && (() => {
          const item = modal.item || {};
          const form = modal.form || {
            id: item.id || '',
            name: item.name || '',
            start_date: item.start_date || '',
            end_date: item.end_date || '',
            registration_open_at: toLeagueDateTimeInput(item.registration_open_at) || '',
            registration_close_at: toLeagueDateTimeInput(item.registration_close_at) || '',
          };
          return (
            <div className="form-grid">
              <div className="form-field"><label>Season Name</label><input value={form.name} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, name: event.target.value } }))} /></div>
              <div className="form-field"><label>Start Date</label><input type="date" value={form.start_date?.slice(0, 10) || ''} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, start_date: event.target.value } }))} /></div>
              <div className="form-field"><label>End Date</label><input type="date" value={form.end_date?.slice(0, 10) || ''} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, end_date: event.target.value } }))} /></div>
              <div className="form-field"><label>Registration Opens</label><input type="datetime-local" value={form.registration_open_at} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, registration_open_at: event.target.value } }))} /></div>
              <div className="form-field"><label>Registration Closes</label><input type="datetime-local" value={form.registration_close_at} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, registration_close_at: event.target.value } }))} /></div>
              <div className="form-actions"><button type="button" disabled={pending} onClick={() => submit(form.id ? 'season_update' : 'season_create', form)}>{pending ? 'Saving...' : 'Save Season'}</button></div>
            </div>
          );
        })()}

        {modal?.type === 'game' && (() => {
          const item = modal.item || {};
          const form = modal.form || {
            id: item.id || '',
            season_id: item.season_id || targetSeason,
            home_team: item.home_team || '',
            away_team: item.away_team || '',
            scheduled_at: toLeagueDateTimeInput(item.scheduled_at) || '',
            location: item.location || '',
            status: item.status || 'SCHEDULED',
          };
          return (
            <div className="form-grid">
              <div className="form-field">
                <label>Season</label>
                <select value={form.season_id} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, season_id: event.target.value, home_team: '', away_team: '' } }))}>
                  <option value="">Select season</option>
                  {seasons.map((season: any) => <option key={season.id} value={season.id}>{season.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Home Team</label>
                <select value={form.home_team} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, home_team: event.target.value } }))}>
                  <option value="">Select home team</option>
                  {teamsForSeason(form.season_id).map((team: any) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Away Team</label>
                <select value={form.away_team} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, away_team: event.target.value } }))}>
                  <option value="">Select away team</option>
                  {teamsForSeason(form.season_id).map((team: any) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              <div className="form-field"><label>Scheduled At</label><input type="datetime-local" value={form.scheduled_at} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, scheduled_at: event.target.value } }))} /></div>
              <div className="form-field"><label>Location</label><input value={form.location} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, location: event.target.value } }))} /></div>
              <div className="form-field">
                <label>Status</label>
                <select value={form.status} onChange={(event) => setModal((current: any) => ({ ...current, form: { ...form, status: event.target.value } }))}>
                  {GAME_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div className="form-actions"><button type="button" disabled={pending} onClick={() => submit(form.id ? 'game_update' : 'game_create', { ...form, scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : '' })}>{pending ? 'Saving...' : 'Save Game'}</button></div>
            </div>
          );
        })()}

        {modal?.type === 'score' && (
          <ScoreEntryModal
            game={scoreGame}
            teams={teams}
            players={players}
            homeScore={modal.homeScore ?? String(scoreGame?.home_score || 0)}
            awayScore={modal.awayScore ?? String(scoreGame?.away_score || 0)}
            setHomeScore={(value: any) => setModal((current: any) => ({ ...current, homeScore: value }))}
            setAwayScore={(value: any) => setModal((current: any) => ({ ...current, awayScore: value }))}
            rows={scoreRows}
            setRows={(rows: any) => setModal((current: any) => ({ ...current, rows }))}
            onSave={() => submit('game_score_submit', {
              gameId: scoreGame.id,
              homeScore: Number((modal.homeScore ?? scoreGame.home_score) || 0),
              awayScore: Number((modal.awayScore ?? scoreGame.away_score) || 0),
              stats: scoreRows,
            })}
          />
        )}
      </AdminModal>
    </main>
  );
}
