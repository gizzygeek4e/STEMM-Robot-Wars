import { Radio } from 'lucide-react';
import { useState } from 'react';
import type { SocketStatus } from '../hooks/useTournamentSocket';
import type { Match, Team, TournamentMeta } from '../types/tournament';
import { formatMatchClock, formatScheduledTime } from '../utils/formatTime';
import { TeamCrest } from './TeamCrest';

interface LiveArenaSectionProps {
  meta: TournamentMeta;
  matches: Match[];
  teams: Team[];
  socketStatus: SocketStatus;
  connectedClients: number;
  selectedMatchId: string | null;
  onSelectMatch: (matchId: string) => void;
}

const ARENA_HERO_IMAGE = '/src/assets/images/arena_hero_pitch_1794965804151.jpg';

export function LiveArenaSection({
  meta,
  matches,
  teams,
  socketStatus,
  connectedClients,
  selectedMatchId,
  onSelectMatch,
}: LiveArenaSectionProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const featuredMatches = matches.filter(
    (m) => m.status === 'live' || m.status === 'halftime' || m.id === meta.activeMatchId,
  );
  const switcherMatches =
    featuredMatches.length > 0
      ? featuredMatches
      : matches.slice(0, 3);

  const activeMatch =
    matches.find((m) => m.id === selectedMatchId) ??
    matches.find((m) => m.id === meta.activeMatchId) ??
    matches.find((m) => m.status === 'live') ??
    matches[0];

  const homeTeam = activeMatch?.homeTeamId ? teamMap.get(activeMatch.homeTeamId) : undefined;
  const awayTeam = activeMatch?.awayTeamId ? teamMap.get(activeMatch.awayTeamId) : undefined;

  const statusLabel =
    activeMatch?.status === 'live'
      ? 'LIVE'
      : activeMatch?.status === 'halftime'
        ? 'HALFTIME'
        : activeMatch?.status === 'finished'
          ? 'FINAL'
          : 'UPCOMING';

  return (
    <section id="live" className="space-y-6">
      {/* Main Broadcast Hero Frame */}
      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#11151C]">
        {/* Background Stadium Photography with CSS Fallback */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#141A23] via-[#0D1117] to-[#090B0E]">
          {!imgFailed && (
            <img
              src={ARENA_HERO_IMAGE}
              alt="Indoor robot soccer championship pitch under stadium floodlights"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover opacity-35"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#090B0E] via-[#090B0E]/82 to-[#090B0E]/50" />
        </div>

        <div className="relative z-10 p-6 sm:p-10 space-y-8">
          {/* Top Broadcast Metadata Strip (Zero-pill clean text with separators) */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-400">
                {meta.season}
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white [text-wrap:balance]">
                {meta.name}
              </h1>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  socketStatus === 'connected' ? 'text-[#C8F135]' : 'text-amber-400'
                }`}
              >
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {socketStatus === 'connected'
                    ? 'WebSocket Sync Active'
                    : socketStatus === 'reconnecting'
                      ? 'Reconnecting'
                      : 'Connecting'}
                </span>
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-slate-300">{connectedClients} Connected</span>
            </div>
          </div>

          {/* Active Match Broadcast Scoreboard */}
          {activeMatch ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs font-medium text-slate-300">
                  <span
                    className={`font-mono font-bold tracking-wider ${
                      activeMatch.status === 'live'
                        ? 'text-rose-400'
                        : activeMatch.status === 'halftime'
                          ? 'text-amber-400'
                          : activeMatch.status === 'finished'
                            ? 'text-[#C8F135]'
                            : 'text-slate-400'
                    }`}
                  >
                    {statusLabel}
                  </span>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span>{activeMatch.round}</span>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span>{activeMatch.arenaPitch}</span>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span>{activeMatch.period}</span>
                </div>

                {switcherMatches.length > 1 && (
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090B0E]/80 border border-white/10">
                    {switcherMatches.map((m) => {
                      const h = m.homeTeamId ? teamMap.get(m.homeTeamId)?.shortCode : 'TBD';
                      const a = m.awayTeamId ? teamMap.get(m.awayTeamId)?.shortCode : 'TBD';
                      const active = m.id === activeMatch.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onSelectMatch(m.id)}
                          className={`px-3 py-1 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'bg-[#C8F135] text-[#090B0E]'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {h} vs {a}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3-Column Scoreboard Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center py-4">
                {/* Home Team */}
                <div className="lg:col-span-4 flex items-center gap-4 lg:justify-end">
                  <div className="lg:text-right order-2 lg:order-1 min-w-0">
                    <div className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white truncate">
                      {homeTeam ? homeTeam.name : 'To Be Determined'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                      {homeTeam
                        ? `${homeTeam.division} · ${activeMatch.homeFlipOvers ?? 0} Flip Over${(activeMatch.homeFlipOvers ?? 0) === 1 ? '' : 's'} (+${activeMatch.homeFlipOvers ?? 0} pt)`
                        : 'Awaiting Qualifier'}
                    </div>
                  </div>
                  <div className="order-1 lg:order-2">
                    <TeamCrest
                      shortCode={homeTeam?.shortCode ?? 'TBD'}
                      accentColor={homeTeam?.accentColor ?? '#64748B'}
                      size="lg"
                    />
                  </div>
                </div>

                {/* Center Score & Match Clock */}
                <div className="lg:col-span-4 flex flex-col items-center justify-center text-center py-4 px-6 rounded-xl bg-[#090B0E]/85 border border-white/10">
                  <div className="flex items-center gap-5 font-mono tabular-nums">
                    <span className="text-5xl sm:text-6xl font-bold text-white">
                      {String(activeMatch.homeScore).padStart(2, '0')}
                    </span>
                    <span className="text-2xl font-bold text-slate-600">:</span>
                    <span className="text-5xl sm:text-6xl font-bold text-white">
                      {String(activeMatch.awayScore).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2.5 font-mono tabular-nums text-sm">
                    <span
                      className={
                        activeMatch.clockRunning
                          ? 'text-[#C8F135] font-semibold'
                          : 'text-slate-300 font-semibold'
                      }
                    >
                      {activeMatch.status === 'scheduled'
                        ? `Kickoff ${formatScheduledTime(activeMatch.scheduledAt)}`
                        : `${formatMatchClock(activeMatch.clockSeconds)} / ${formatMatchClock(activeMatch.durationSeconds ?? 240)}`}
                    </span>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-400 text-xs">{activeMatch.period}</span>
                  </div>
                </div>

                {/* Away Team */}
                <div className="lg:col-span-4 flex items-center gap-4">
                  <TeamCrest
                    shortCode={awayTeam?.shortCode ?? 'TBD'}
                    accentColor={awayTeam?.accentColor ?? '#64748B'}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <div className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white truncate">
                      {awayTeam ? awayTeam.name : 'To Be Determined'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                      {awayTeam
                        ? `${awayTeam.division} · ${activeMatch.awayFlipOvers ?? 0} Flip Over${(activeMatch.awayFlipOvers ?? 0) === 1 ? '' : 's'} (+${activeMatch.awayFlipOvers ?? 0} pt)`
                        : 'Awaiting Qualifier'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Match Event Feed */}
              <div className="border-t border-white/10 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold tracking-wide text-slate-400">
                    Live Match Timeline
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {activeMatch.events.length} Events Recorded
                  </span>
                </div>

                {activeMatch.events.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No goals or disciplinary events logged yet for this fixture.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[...activeMatch.events]
                      .reverse()
                      .slice(0, 6)
                      .map((ev) => {
                        const evTeam = teamMap.get(ev.teamId);
                        return (
                          <div
                            key={ev.id}
                            className="flex items-start gap-3 p-3 rounded-lg bg-[#090B0E]/75 border border-white/10"
                          >
                            <span className="font-mono tabular-nums text-xs font-bold text-[#C8F135] shrink-0 pt-0.5">
                              {String(ev.minute).padStart(2, '0')}&apos;
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white truncate">
                                {evTeam?.shortCode ?? 'TEAM'} · Unit #{ev.robotNumber} ·{' '}
                                <span className="text-slate-300 capitalize">
                                  {ev.type.replace('_', ' ')}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                                {ev.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">
              No tournament matches scheduled yet. Open the Admin Console to add fixtures.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
