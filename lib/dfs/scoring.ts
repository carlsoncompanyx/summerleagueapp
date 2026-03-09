export const DFS_CAPTAIN_MULTIPLIER = 1.5;

export function parseDfsPosition(position: string | null | undefined): 'GOALIE' | 'SKATER' {
  const value = (position ?? '').toLowerCase();
  return value.includes('goal') ? 'GOALIE' : 'SKATER';
}

export function getSkaterWeeklyBonus(realPoints: number) {
  // Weekly aggregate bonus only, not per-game bonus.
  if (realPoints >= 10) return 10;
  if (realPoints >= 5) return 5;
  return 0;
}

export function computeSkaterFantasyPoints(goals: number, assists: number) {
  const realPoints = goals + assists;
  return goals * 3 + assists * 2 + getSkaterWeeklyBonus(realPoints);
}

export function computeGoalieFantasyPoints(wins: number, goalsAgainst: number) {
  return wins * 8 - goalsAgainst;
}

export function computeDfsFantasyPoints(input: {
  position: string | null | undefined;
  goals: number;
  assists: number;
  wins: number;
  goalsAgainst: number;
}) {
  if (parseDfsPosition(input.position) === 'GOALIE') {
    return computeGoalieFantasyPoints(input.wins, input.goalsAgainst);
  }
  return computeSkaterFantasyPoints(input.goals, input.assists);
}
