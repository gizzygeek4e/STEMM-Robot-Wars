import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Team } from '../types/tournament';
import { TeamCrest } from './TeamCrest';

interface TeamsSectionProps {
  teams: Team[];
}

export function TeamsSection({ teams }: TeamsSectionProps) {
  const [query, setQuery] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? '');

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...teams].sort((a, b) => a.seed - b.seed);
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.shortCode.toLowerCase().includes(q) ||
        t.division.toLowerCase().includes(q) ||
        t.robots.some(
          (r) =>
            r.designation.toLowerCase().includes(q) ||
            r.operator.toLowerCase().includes(q),
        ),
    );
  }, [teams, query]);

  const activeTeam =
    filteredTeams.find((t) => t.id === selectedTeamId) ?? filteredTeams[0];

  return (
    <section id="teams" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Team Rosters
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Registered autonomous soccer squads, hardware platforms, and unit operators.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter teams, robots, or pilots..."
            aria-label="Filter teams and robots"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[#11151C] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#C8F135]"
          />
        </div>
      </div>

      {filteredTeams.length === 0 ? (
        <div className="bg-[#11151C] border border-white/10 rounded-xl p-10 text-center text-sm text-slate-400">
          {teams.length === 0
            ? 'No teams registered yet. Open the Director Panel to add teams and rosters.'
            : 'No teams matched your search query.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Team Selector List */}
          <div className="lg:col-span-4 bg-[#11151C] border border-white/10 rounded-xl overflow-hidden divide-y divide-white/10">
            {filteredTeams.map((team) => {
              const isSelected = activeTeam?.id === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setSelectedTeamId(team.id)}
                  className={`w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#171C26]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <TeamCrest
                      shortCode={team.shortCode}
                      accentColor={team.accentColor}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div
                        className={`font-display text-lg font-bold truncate ${
                          isSelected ? 'text-[#C8F135]' : 'text-white'
                        }`}
                      >
                        {team.name}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {team.division} · {team.robots.length} robot{team.robots.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-xs text-slate-400 shrink-0">
                    #{team.seed}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Team Roster Detail */}
          {activeTeam && (
            <div className="lg:col-span-8 bg-[#11151C] border border-white/10 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <TeamCrest
                    shortCode={activeTeam.shortCode}
                    accentColor={activeTeam.accentColor}
                    size="lg"
                  />
                  <div>
                    <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
                      {activeTeam.name}
                    </h3>
                    <p className="text-sm text-slate-400 mt-0.5">
                      Seed #{activeTeam.seed} · {activeTeam.division}
                    </p>
                  </div>
                </div>
                <div className="font-mono tabular-nums text-xs text-slate-400">
                  {activeTeam.robots.length} Active Units
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-xs font-medium text-slate-400">
                      <th className="py-3 pl-6 pr-3 w-20">Unit</th>
                      <th className="py-3 px-3">Robot Designation</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3 hidden sm:table-cell">Actuation</th>
                      <th className="py-3 pl-3 pr-6 text-right">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {activeTeam.robots.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No robot units registered on this roster yet.
                        </td>
                      </tr>
                    ) : (
                      activeTeam.robots.map((robot) => (
                        <tr key={robot.id} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 pl-6 pr-3 font-mono tabular-nums font-bold text-[#C8F135]">
                            #{robot.unitNumber}
                          </td>
                          <td className="py-3.5 px-3 font-semibold text-white">
                            {robot.designation}
                          </td>
                          <td className="py-3.5 px-3 text-slate-300">{robot.role}</td>
                          <td className="py-3.5 px-3 text-slate-400 hidden sm:table-cell">
                            {robot.actuation}
                          </td>
                          <td className="py-3.5 pl-3 pr-6 text-right text-slate-300">
                            {robot.operator}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
