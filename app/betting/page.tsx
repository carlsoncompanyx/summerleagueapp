import Link from 'next/link';
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

function probability(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${Math.round(n * 100)}%`;
}

function leanText(game: any, model: any) {
  return model.homeWinProbability >= model.awayWinProbability
    ? `${game.home_team_name} ${probability(model.homeWinProbability)}`
    : `${game.away_team_name} ${probability(model.awayWinProbability)}`;
}

export default async function BettingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const market = params.market || 'all';
  const data = await getLeagueSnapshot();
  if ('unavailable' in data && data.unavailable) return <main><h1>Weekly Lines & Picks</h1><p>{data.reason}</p></main>;

  const now = Date.now();
  const upcoming = filterBettingGames(data.schedule
    .filter((game) => new Date(game.scheduled_at).getTime() > now && !['CANCELED'].includes(String(game.status))))
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
            <p className="muted">Picks only. No real-money betting is active. Next game: {nextGame ? formatPublicDateTime(nextGame.scheduled_at) : 'TBD'}.</p>
          </div>
          <p className="badge">{upcoming.length} game{upcoming.length === 1 ? '' : 's'}</p>
        </div>
        <div className="button-row">
          <Link className="header-auth-link" href="/betting?market=all">All</Link>
          <Link className="header-auth-link" href="/betting?market=moneyline">Moneyline</Link>
          <Link className="header-auth-link" href="/betting?market=spread">Spread</Link>
          <Link className="header-auth-link" href="/betting?market=total">Total</Link>
        </div>
      </section>

      <section className="betting-grid">
          {upcoming.map((game) => {
            const model = projectionByGame.get(game.id)!;
            const adminLine = lineByGame.get(game.id) as any;
            const source = adminLine ? 'Admin Line' : 'Model Line';
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

            return (
              <article key={game.id} className="betting-card">
                <div className="section-header-row">
                  <div>
                    <h3>{game.away_team_name} @ {game.home_team_name}</h3>
                    <p className="muted">Puck drop: {formatPublicDateTime(game.scheduled_at)} - {game.status}</p>
                  </div>
                  <span className="badge">{source}</span>
                </div>
                {game.status === 'FINAL'
                  ? <p className="muted">Final: {game.away_score}-{game.home_score}</p>
                  : <p><strong>Projected score:</strong> {game.away_team_name} {model.projectedAwayGoals.toFixed(1)} - {game.home_team_name} {model.projectedHomeGoals.toFixed(1)}</p>}
                {(market === 'all' || market === 'moneyline') && <div className="bet-line-row"><span>Lean</span><strong>{leanText(game, model)}</strong></div>}
                {(market === 'all' || market === 'spread') && <div className="bet-line-row"><span>Spread</span><strong>{game.away_team_name} {formatLineNumber(line.away_spread)} / {game.home_team_name} {formatLineNumber(line.home_spread)}</strong></div>}
                {(market === 'all' || market === 'total') && <div className="bet-line-row"><span>Total</span><strong>O/U {Number(line.total).toFixed(1)}</strong></div>}
              </article>
            );
          })}
          {!upcoming.length && <p className="muted">No upcoming games available for weekly markets.</p>}
      </section>
    </main>
  );
}
