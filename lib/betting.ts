export function computeMoneylineOdds(spread: number): { home: number; away: number } {
  const base = 1.9;
  const shift = Math.min(0.45, Math.abs(spread) * 0.06);
  if (spread < 0) return { home: Number((base - shift).toFixed(2)), away: Number((base + shift).toFixed(2)) };
  if (spread > 0) return { home: Number((base + shift).toFixed(2)), away: Number((base - shift).toFixed(2)) };
  return { home: base, away: base };
}

export function buildDefaultGameLines(input: {
  homePower: number;
  awayPower: number;
  homeAvgFor: number;
  awayAvgFor: number;
  homeAvgAgainst: number;
  awayAvgAgainst: number;
}) {
  const homeEdge = input.homePower - input.awayPower + 0.85; // home rink edge
  const spread = Number((homeEdge * -0.55).toFixed(1));

  const expectedTotal = ((input.homeAvgFor + input.awayAvgFor) + (input.homeAvgAgainst + input.awayAvgAgainst)) / 2;
  const total = Number(Math.max(5.5, Math.min(14.5, expectedTotal)).toFixed(1));

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
