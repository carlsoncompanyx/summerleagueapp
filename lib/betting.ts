export function computeMoneylineOdds(): { home: number; away: number } {
  return { home: 1.9, away: 1.9 };
}

export function payout(stake: number, odds: number): number {
  return Math.floor(stake * odds);
}
