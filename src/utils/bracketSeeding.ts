import type { Match, Team } from '../types/tournament.ts';
import { computeStandings } from './standings.ts';

/**
 * Seeds a 12-team Sudden-Death Bracket from Group Stage standings favouring top teams:
 * - Top 4 overall seeds (#1 - #4) receive a Round 1 Bye directly into the Quarterfinals.
 * - Seeds #5 - #12 play Round 1 Sudden-Death Play-In matchups:
 *   - po-1: #8 vs #9  -> Winner faces #1 in qf-1
 *   - po-2: #5 vs #12 -> Winner faces #4 in qf-2
 *   - po-3: #6 vs #11 -> Winner faces #3 in qf-3
 *   - po-4: #7 vs #10 -> Winner faces #2 in qf-4
 */
export function applySeededSuddenDeathBracket(teams: Team[], matches: Match[]): Match[] {
  const standings = computeStandings(teams, matches, { groupStageOnly: true });
  const rankedIds = standings.map((s) => s.team.id);

  const seedAt = (rank1Based: number): string | null => rankedIds[rank1Based - 1] ?? null;

  return matches.map((m) => {
    if (m.id === 'po-1') {
      return { ...m, homeTeamId: seedAt(8), awayTeamId: seedAt(9) };
    }
    if (m.id === 'po-2') {
      return { ...m, homeTeamId: seedAt(5), awayTeamId: seedAt(12) };
    }
    if (m.id === 'po-3') {
      return { ...m, homeTeamId: seedAt(6), awayTeamId: seedAt(11) };
    }
    if (m.id === 'po-4') {
      return { ...m, homeTeamId: seedAt(7), awayTeamId: seedAt(10) };
    }
    if (m.id === 'qf-1') {
      return { ...m, homeTeamId: seedAt(1) };
    }
    if (m.id === 'qf-2') {
      return { ...m, homeTeamId: seedAt(4) };
    }
    if (m.id === 'qf-3') {
      return { ...m, homeTeamId: seedAt(3) };
    }
    if (m.id === 'qf-4') {
      return { ...m, homeTeamId: seedAt(2) };
    }
    return m;
  });
}
