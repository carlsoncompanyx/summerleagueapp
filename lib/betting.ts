export function computeMoneylineOdds(spread: number): { home: number; away: number } {
  const base = 1.9;
  const shift = Math.min(0.25, Math.abs(spread) * 0.03);
  if (spread < 0) return { home: Number((base - shift).toFixed(2)), away: Number((base + shift).toFixed(2)) };
  if (spread > 0) return { home: Number((base + shift).toFixed(2)), away: Number((base - shift).toFixed(2)) };
  return { home: base, away: base };
}

export function buildDefaultGameLines(game: { home_score?: number; away_score?: number; status?: string }) {
  const marginHint = game.status === 'FINAL' ? Number(game.home_score || 0) - Number(game.away_score || 0) : 0;
  const spread = Number((marginHint * 0.5).toFixed(1));
  const total = Number((8.5 + Math.abs(marginHint) * 0.2).toFixed(1));
  const moneyline = computeMoneylineOdds(spread);
  return {
    home_moneyline: moneyline.home,
    away_moneyline: moneyline.away,
    home_spread: Number((-spread).toFixed(1)),
    away_spread: Number(spread.toFixed(1)),
    total,
  };
}

export function payout(stake: number, odds: number): number {
  return Math.floor(stake * odds);
}
