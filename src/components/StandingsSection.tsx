import { useMemo, useState } from 'react';
import type { Match, Team, TeamStanding } from '../types/tournament';
import { computeStandings } from '../utils/standings';
import { TeamCrest } from './TeamCrest';

interface StandingsSectionProps {
  teams: Team[];
  matches: Match[];
}

type StandingsView = 'groups' | 'overall' | 'Group A' | 'Group B' | 'Group C';

function getSeedPathLabel(rank: number): { label: string; highlight: boolean } {
  if (rank <= 4) {
    return { label: 'QF Bye', highlight: true };
  }
  if (rank <= 12) {
    return { label: 'Round 1 SD', highlight: false };
  }
  return { label: 'Reserve', highlight: false };
}

interface StandingsTableProps {
  rows: TeamStanding[];
  showDivision: boolean;
  showSeedPath: boolean;
  overallRankMap: Map<string, number>;
}

function StandingsTable({
  rows,
  showDivision,
  showSeedPath,
  overallRankMap,
}: StandingsTableProps) {
  return (
    <div className="bg-[#11151C] border border-white/10 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-xs font-medium text-slate-400">
              <th className="py-3.5 pl-5 pr-3 w-12">#</th>
              <th className="py-3.5 px-3">Team</th>
              {showDivision && (
                <th className="py-3.5 px-3 hidden sm:table-cell">Group</th>
              )}
              {showSeedPath && (
                <th className="py-3.5 px-3 hidden md:table-cell">Bracket Path</th>
              )}
              <th className="py-3.5 px-3 text-right font-mono">P</th>
              <th className="py-3.5 px-3 text-right font-mono">W</th>
              <th className="py-3.5 px-3 text-right font-mono">D</th>
              <th className="py-3.5 px-3 text-right font-mono">L</th>
              <th className="py-3.5 px-3 text-right font-mono hidden md:table-cell">GF</th>
              <th className="py-3.5 px-3 text-right font-mono hidden md:table-cell">GA</th>
              <th className="py-3.5 px-3 text-right font-mono">GD</th>
              <th className="py-3.5 px-3 text-right font-mono" title="Flip Over Bonus Points">
                FO
              </th>
              <th className="py-3.5 px-3 text-right font-mono">PTS</th>
              <th className="py-3.5 pl-3 pr-5 text-right hidden lg:table-cell">Form</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-sm">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11 + (showDivision ? 1 : 0) + (showSeedPath ? 1 : 0)}
                  className="py-10 text-center text-slate-400"
                >
                  No teams registered in this group yet.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const overallRank = overallRankMap.get(row.team.id) ?? idx + 1;
                const seedPath = getSeedPathLabel(overallRank);
                const rankDisplay = showSeedPath ? overallRank : idx + 1;

                return (
                  <tr
                    key={row.team.id}
                    className="hover:bg-white/[0.03] transition-colors h-12"
                  >
                    <td
                      className={`py-3 pl-5 pr-3 font-mono tabular-nums font-semibold ${
                        showSeedPath && overallRank <= 4
                          ? 'text-[#C8F135]'
                          : 'text-slate-400'
                      }`}
                    >
                      {String(rankDisplay).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <TeamCrest
                          shortCode={row.team.shortCode}
                          accentColor={row.team.accentColor}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="font-display text-base font-bold text-white truncate">
                            {row.team.name}
                          </div>
                          <div className="text-xs text-slate-400 sm:hidden">
                            {row.team.division} · Seed #{overallRank}
                          </div>
                        </div>
                      </div>
                    </td>
                    {showDivision && (
                      <td className="py-3 px-3 text-xs text-slate-400 hidden sm:table-cell">
                        {row.team.division}
                      </td>
                    )}
                    {showSeedPath && (
                      <td className="py-3 px-3 text-xs font-mono hidden md:table-cell">
                        <span
                          className={
                            seedPath.highlight ? 'text-[#C8F135] font-semibold' : 'text-sky-300'
                          }
                        >
                          {seedPath.label}
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                      {row.played}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                      {row.wins}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-400">
                      {row.draws}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-400">
                      {row.losses}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300 hidden md:table-cell">
                      {row.goalsFor}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-400 hidden md:table-cell">
                      {row.goalsAgainst}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums font-medium ${
                        row.goalDifference > 0
                          ? 'text-emerald-400'
                          : row.goalDifference < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-300">
                      +{row.flipOvers}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-[#C8F135]">
                      {row.points}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right hidden lg:table-cell">
                      <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                        {row.form.length === 0 ? (
                          <span className="text-slate-600">-</span>
                        ) : (
                          row.form.map((f, fIdx) => (
                            <span
                              key={`${row.team.id}-f-${fIdx}`}
                              className={
                                f === 'W'
                                  ? 'text-emerald-400'
                                  : f === 'L'
                                    ? 'text-rose-400'
                                    : 'text-amber-400'
                              }
                            >
                              {f}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StandingsSection({ teams, matches }: StandingsSectionProps) {
  const [view, setView] = useState<StandingsView>('groups');

  const overallStandings = useMemo(
    () => computeStandings(teams, matches, { groupStageOnly: true }),
    [teams, matches],
  );

  const overallRankMap = useMemo(() => {
    const m = new Map<string, number>();
    overallStandings.forEach((row, idx) => {
      m.set(row.team.id, idx + 1);
    });
    return m;
  }, [overallStandings]);

  const groupNames = useMemo(() => {
    const defaults = ['Group A', 'Group B', 'Group C'];
    const extras = Array.from(new Set(teams.map((t) => t.division))).filter(
      (d) => !defaults.includes(d),
    );
    return [...defaults, ...extras];
  }, [teams]);

  const viewTabs: Array<{ id: StandingsView; label: string }> = [
    { id: 'groups', label: 'All 3 Groups' },
    { id: 'overall', label: 'Overall Seeding (#1–#12)' },
    { id: 'Group A', label: 'Group A' },
    { id: 'Group B', label: 'Group B' },
    { id: 'Group C', label: 'Group C' },
  ];

  return (
    <section id="standings" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Group Tables &amp; Bracket Seeding
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            3 pts Win · 1 pt Draw · +1 Bonus pt per Flip Over. Seeds #1–#4 earn Quarterfinal Byes; #5–#12 enter Round 1 Sudden Death.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#11151C] border border-white/10 overflow-x-auto max-w-full">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === tab.id
                  ? 'bg-[#C8F135] text-[#090B0E] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'overall' ? (
        <StandingsTable
          rows={overallStandings}
          showDivision
          showSeedPath
          overallRankMap={overallRankMap}
        />
      ) : view === 'groups' ? (
        <div className="space-y-6">
          {groupNames.map((groupName) => {
            const groupRows = overallStandings.filter((r) => r.team.division === groupName);
            if (groupRows.length === 0 && !['Group A', 'Group B', 'Group C'].includes(groupName)) {
              return null;
            }
            return (
              <div key={groupName} className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-display text-lg font-bold text-white tracking-wide">
                    {groupName}
                  </h3>
                  <span className="font-mono text-xs text-slate-400">
                    {groupRows.length} Teams · Round-Robin
                  </span>
                </div>
                <StandingsTable
                  rows={groupRows}
                  showDivision={false}
                  showSeedPath
                  overallRankMap={overallRankMap}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <StandingsTable
          rows={overallStandings.filter((r) => r.team.division === view)}
          showDivision={false}
          showSeedPath
          overallRankMap={overallRankMap}
        />
      )}
    </section>
  );
}
