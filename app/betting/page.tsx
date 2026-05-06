import { buildGameProjections, filterBettingGames } from '../../lib/betting/projections';
import { getLeagueSnapshot } from '../../lib/league-data';
import { formatPublicDateTime } from '../../lib/formatters';
import { createAdminSupabaseClient } from '../../lib/supabase/admin';

function adminClientSafe() {
  if (!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

function formatLineNumber(value: unknown, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n > 0 ? `+${n.toFixed(digits)}` : n.toFixed(digits);
}

function pickLabel(teamName: string, isFavorite: boolean) {
  return `${teamName} ${isFavorite ? 'Favorite' : 'Underdog'}`;
}

function formatScore(game: any) {
  if (String(game.status).toUpperCase() !== 'FINAL') return null;
  if (game.away_score == null || game.home_score == null) return 'Final';
  return `Final ${game.away_score}-${game.home_score}`;
}

export default async function BettingPage() {
  const data = await getLeagueSnapshot();
  if ('unavailable' in data && data.unavailable) return <main><h1>Weekly Lines & Picks</h1><p>{data.reason}</p></main>;

  const now = Date.now();
  const upcoming = filterBettingGames(data.schedule
    .filter((game) => new Date(game.scheduled_at).getTime() > now && !['CANCELED'].includes(String(game.status).toUpperCase())))
    .slice(0, 12);
  const seasonGameIds = data.schedule.filter((game) => game.season_id === data.season?.id).map((game) => game.id);
  const admin = adminClientSafe();

  const [lineRowsRes, gameStatsRes, historicalRes, valuationRes, slatesRes] = admin
    ? await Promise.all([
      upcoming.length ? admin.from('game_betting_lines').select('*').in('game_id', upcoming.map((game) => game.id)) : Promise.resolve({ data: [] as any[] }),
      seasonGameIds.length ? admin.from('game_stats').select('game_id,player_id,games_played,goals,assists,goals_against').in('game_id', seasonGameIds) : Promise.resolve({ data: [] as any[] }),
      admin.from('player_historical_season_stats').select('player_id,player_name_raw,normalized_player_name,goals,assists,points'),
      data.season?.id ? admin.from('player_valuation_inputs').select('player_id,player_grade').eq('season_id', data.season.id) : Promise.resolve({ data: [] as any[] }),
      data.season?.id ? admin.from('slates').select('id').eq('season_id', data.season.id) : Promise.resolve({ data: [] as any[] }),
    ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }];

  const slateIds = (slatesRes.data ?? []).map((slate: any) => slate.id);
  const { data: slatePlayers } = admin && slateIds.length
    ? await admin.from('slate_players').select('player_id,projection_points,valuation_grade').in('slate_id', slateIds)
    : { data: [] as any[] };

  const projections = buildGameProjections({
    games: upcoming,
    players: data.players,
    gameStats: gameStatsRes.data ?? [],
    historicalRows: historicalRes.data ?? [],
    valuationInputs: valuationRes.data ?? [],
    slatePlayers: slatePlayers ?? [],
  });
  const projectionByGame = new Map(projections.map((projection) => [projection.gameId, projection]));
  const lineByGame = new Map((lineRowsRes.data ?? []).map((row: any) => [row.game_id, row]));
  const nextGame = upcoming[0] ?? null;

  return (
    <main>
      <h1>Weekly Lines & Picks</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="section-header-row">
          <div>
            <h2 className="section-title">Weekly Lines & Picks</h2>
            <p className="muted">Picks only — no real-money betting. Next game: {nextGame ? formatPublicDateTime(nextGame.scheduled_at) : 'TBD'}.</p>
          </div>
          <p className="badge">{upcoming.length} {upcoming.length === 1 ? 'game' : 'games'}</p>
        </div>
      </section>

      <section className="card">
        <div className="responsive-table">
          <table className="table betting-lines-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Moneyline</th>
                <th>Spread</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((game) => {
                const model = projectionByGame.get(game.id)!;
                const adminLine = lineByGame.get(game.id) as any;
                const line = adminLine ? {
                  away_moneyline: adminLine.away_moneyline,
                  home_moneyline: adminLine.home_moneyline,
                  away_spread: adminLine.away_spread,
                  home_spread: adminLine.home_spread,
                  total: adminLine.total,
                } : {
                  away_moneyline: model.awayMoneyline,
                  home_moneyline: model.homeMoneyline,
                  away_spread: model.awaySpread,
                  home_spread: model.homeSpread,
                  total: model.total,
                };
                const homeFavored = Number(line.home_spread) < Number(line.away_spread);
                const awayFavored = !homeFavored;
                const favorite = homeFavored ? game.home_team_name : game.away_team_name;
                const underdog = homeFavored ? game.away_team_name : game.home_team_name;
                const finalScore = formatScore(game);

                return (
                  <tr key={game.id}>
                    <td>
                      <div><strong>{game.away_team_name} @ {game.home_team_name}</strong></div>
                      <div className="muted">{formatPublicDateTime(game.scheduled_at)}{finalScore ? ` · ${finalScore}` : ''}</div>
                      <span className="badge">{adminLine ? 'Admin' : 'Model'}</span>
                    </td>
                    <td>
                      <div className="bet-market-pills">
                        <span className="bet-pill">{adminLine ? `${game.away_team_name} ML ${formatLineNumber(line.away_moneyline, 0)}` : pickLabel(game.away_team_name, awayFavored)}</span>
                        <span className="bet-pill">{adminLine ? `${game.home_team_name} ML ${formatLineNumber(line.home_moneyline, 0)}` : pickLabel(game.home_team_name, homeFavored)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="bet-market-pills">
                        <span className="bet-pill">{favorite} -1.5</span>
                        <span className="bet-pill">{underdog} +1.5</span>
                      </div>
                    </td>
                    <td>
                      <div className="bet-market-pills">
                        <span className="bet-pill">O {Number(line.total || 10.5).toFixed(1)}</span>
                        <span className="bet-pill">U {Number(line.total || 10.5).toFixed(1)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!upcoming.length && <p className="muted">No upcoming games available for weekly lines.</p>}
      </section>
    </main>
  );
}
