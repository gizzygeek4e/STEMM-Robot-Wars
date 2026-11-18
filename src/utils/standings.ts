import type { Match, Team, TeamStanding } from '../types/tournament.ts';

export function computeStandings(
  teams: Team[],
  matches: Match[],
  options?: { groupStageOnly?: boolean },
): TeamStanding[] {
  const groupStageOnly = options?.groupStageOnly ?? true;
  const map = new Map<string, TeamStanding>();

  for (const team of teams) {
    map.set(team.id, {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      flipOvers: 0,
      points: 0,
      form: [],
    });
  }

  const orderedMatches = [...matches].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  for (const match of orderedMatches) {
    if (match.status !== 'finished') continue;
    if (groupStageOnly && match.round !== 'Group') continue;
    if (!match.homeTeamId || !match.awayTeamId) continue;

    const home = map.get(match.homeTeamId);
    const away = map.get(match.awayTeamId);
    if (!home || !away) continue;

    const homeFO = Math.max(0, match.homeFlipOvers ?? 0);
    const awayFO = Math.max(0, match.awayFlipOvers ?? 0);

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    home.flipOvers += homeFO;
    away.flipOvers += awayFO;
    home.points += homeFO;
    away.points += awayFO;

    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      home.points += 3;
      home.form.push('W');
      away.losses += 1;
      away.form.push('L');
    } else if (match.awayScore > match.homeScore) {
      away.wins += 1;
      away.points += 3;
      away.form.push('W');
      home.losses += 1;
      home.form.push('L');
    } else {
      home.draws += 1;
      home.points += 1;
      home.form.push('D');
      away.draws += 1;
      away.points += 1;
      away.form.push('D');
    }
  }

  const standings = Array.from(map.values()).map((entry) => ({
    ...entry,
    goalDifference: entry.goalsFor - entry.goalsAgainst,
    form: entry.form.slice(-5),
  }));

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (b.flipOvers !== a.flipOvers) return b.flipOvers - a.flipOvers;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.team.seed - b.team.seed;
  });

  return standings;
}
