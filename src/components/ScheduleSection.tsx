import { useMemo, useState } from 'react';
import type { Match, Team } from '../types/tournament';
import { formatMatchClock, formatScheduledDateTime } from '../utils/formatTime';
import { TeamCrest } from './TeamCrest';

interface ScheduleSectionProps {
  matches: Match[];
  teams: Team[];
  onInspectMatch: (matchId: string) => void;
}

type ScheduleFilter = 'all' | 'live' | 'group' | 'knockout' | 'scheduled' | 'finished';

export function ScheduleSection({
  matches,
  teams,
  onInspectMatch,
}: ScheduleSectionProps) {
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const filteredMatches = useMemo(() => {
    const sorted = [...matches].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
    if (filter === 'all') return sorted;
    if (filter === 'live') {
      return sorted.filter((m) => m.status === 'live' || m.status === 'halftime');
    }
    if (filter === 'group') {
      return sorted.filter((m) => m.round === 'Group');
    }
    if (filter === 'knockout') {
      return sorted.filter((m) => m.round !== 'Group');
    }
    return sorted.filter((m) => m.status === filter);
  }, [matches, filter]);

  const filterTabs: Array<{ id: ScheduleFilter; label: string }> = [
    { id: 'all', label: 'All Fixtures' },
    { id: 'live', label: 'Live Now' },
    { id: 'group', label: 'Group Stage' },
    { id: 'knockout', label: 'Sudden Death' },
    { id: 'scheduled', label: 'Upcoming' },
    { id: 'finished', label: 'Completed' },
  ];

  return (
    <section id="schedule" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Match Schedule
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Group A, B &amp; C round-robin fixtures and Sudden-Death knockout matchups (4:00 per match).
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#11151C] border border-white/10 overflow-x-auto max-w-full">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#C8F135] text-[#090B0E] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredMatches.length === 0 ? (
        <div className="bg-[#11151C] border border-white/10 rounded-xl p-10 text-center text-sm text-slate-400">
          {matches.length === 0
            ? 'No fixtures scheduled yet.'
            : 'No matches match the selected status filter.'}
        </div>
      ) : (
        <div className="bg-[#11151C] border border-white/10 rounded-xl overflow-hidden divide-y divide-white/10">
          {filteredMatches.map((match) => {
            const home = match.homeTeamId ? teamMap.get(match.homeTeamId) : undefined;
            const away = match.awayTeamId ? teamMap.get(match.awayTeamId) : undefined;

            const statusColor =
              match.status === 'live'
                ? 'text-rose-400'
                : match.status === 'halftime'
                  ? 'text-amber-400'
                  : match.status === 'finished'
                    ? 'text-[#C8F135]'
                    : 'text-slate-400';

            const statusText =
              match.status === 'live'
                ? `LIVE · ${formatMatchClock(match.clockSeconds)}`
                : match.status === 'halftime'
                  ? 'HALFTIME'
                  : match.status === 'finished'
                    ? 'FINAL'
                    : 'SCHEDULED';

            const roundLabel =
              match.round === 'Group' && home?.division
                ? home.division
                : match.round === 'Play-In'
                  ? 'Sudden Death R1'
                  : match.round;

            return (
              <div
                key={match.id}
                onClick={() => onInspectMatch(match.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspectMatch(match.id);
                  }
                }}
                className="px-4 sm:px-6 py-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center hover:bg-white/[0.03] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#C8F135]"
              >
                {/* Time, Round, Pitch */}
                <div className="md:col-span-3 flex flex-col gap-0.5">
                  <span className={`font-mono tabular-nums text-xs font-semibold ${statusColor}`}>
                    {statusText}
                  </span>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    {formatScheduledDateTime(match.scheduledAt)} · {roundLabel} · {match.arenaPitch}
                  </span>
                </div>

                {/* Matchup */}
                <div className="md:col-span-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <div className="flex items-center justify-end gap-3 min-w-0">
                    <span className="font-display text-lg font-bold text-white truncate text-right">
                      {home ? home.name : 'TBD'}
                    </span>
                    <TeamCrest
                      shortCode={home?.shortCode ?? 'TBD'}
                      accentColor={home?.accentColor ?? '#64748B'}
                      size="sm"
                    />
                  </div>

                  <div className="px-3 py-1 rounded-md bg-[#090B0E] border border-white/10 font-mono tabular-nums text-sm font-bold text-white min-w-[74px] text-center">
                    {match.status === 'scheduled'
                      ? 'VS'
                      : `${match.homeScore} - ${match.awayScore}`}
                  </div>

                  <div className="flex items-center gap-3 min-w-0">
                    <TeamCrest
                      shortCode={away?.shortCode ?? 'TBD'}
                      accentColor={away?.accentColor ?? '#64748B'}
                      size="sm"
                    />
                    <span className="font-display text-lg font-bold text-white truncate">
                      {away ? away.name : 'TBD'}
                    </span>
                  </div>
                </div>

                {/* Flip Overs & Action */}
                <div className="md:col-span-2 flex flex-col items-end gap-0.5">
                  <span className="font-mono tabular-nums text-xs text-slate-400">
                    {match.status === 'scheduled'
                      ? '4:00 Match'
                      : `Flip Overs ${match.homeFlipOvers ?? 0}-${match.awayFlipOvers ?? 0}`}
                  </span>
                  <span className="text-xs font-medium text-slate-400 hover:text-white">
                    View Scoreboard
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
