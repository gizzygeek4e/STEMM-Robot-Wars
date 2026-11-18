import { Trophy } from 'lucide-react';
import { useMemo } from 'react';
import type { Match, Team } from '../types/tournament';
import { formatMatchClock, formatScheduledTime } from '../utils/formatTime';
import { computeStandings } from '../utils/standings';
import { TeamCrest } from './TeamCrest';

interface BracketSectionProps {
  matches: Match[];
  teams: Team[];
  onInspectMatch: (matchId: string) => void;
}

interface BracketNodeProps {
  match?: Match;
  slotLabel?: string;
  teamMap: Map<string, Team>;
  seedByTeamId: Map<string, number>;
  onInspectMatch: (matchId: string) => void;
}

const SLOT_LABELS: Record<string, string> = {
  'po-1': '#8 vs #9',
  'po-2': '#5 vs #12',
  'po-3': '#6 vs #11',
  'po-4': '#7 vs #10',
  'qf-1': '#1 Bye vs W(8/9)',
  'qf-2': '#4 Bye vs W(5/12)',
  'qf-3': '#3 Bye vs W(6/11)',
  'qf-4': '#2 Bye vs W(7/10)',
  'sf-1': 'QF1 vs QF2',
  'sf-2': 'QF3 vs QF4',
  'final-1': 'Championship',
  'tp-1': '3rd Place',
};

function BracketNode({
  match,
  slotLabel,
  teamMap,
  seedByTeamId,
  onInspectMatch,
}: BracketNodeProps) {
  if (!match) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-[#11151C]/50 p-4 text-xs text-slate-500">
        Awaiting Bracket Fixture
      </div>
    );
  }

  const home = match.homeTeamId ? teamMap.get(match.homeTeamId) : undefined;
  const away = match.awayTeamId ? teamMap.get(match.awayTeamId) : undefined;
  const homeSeed = home ? seedByTeamId.get(home.id) : undefined;
  const awaySeed = away ? seedByTeamId.get(away.id) : undefined;
  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';

  const homeWon = isFinished && match.winnerTeamId === match.homeTeamId && Boolean(home);
  const awayWon = isFinished && match.winnerTeamId === match.awayTeamId && Boolean(away);
  const labelPrefix = slotLabel || SLOT_LABELS[match.id];

  return (
    <button
      type="button"
      onClick={() => onInspectMatch(match.id)}
      className={`w-full text-left rounded-xl border transition-colors bg-[#11151C] hover:bg-[#171C26] overflow-hidden cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8F135] ${
        isLive ? 'border-rose-500/50' : 'border-white/10 hover:border-white/25'
      }`}
    >
      {/* Card metadata strip */}
      <div className="px-3.5 py-2 border-b border-white/10 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
        <span className="text-slate-400 truncate">
          {labelPrefix ? `${labelPrefix} · ${match.arenaPitch}` : match.arenaPitch}
        </span>
        <span
          className={`shrink-0 ${
            isLive
              ? 'text-rose-400 font-bold'
              : match.status === 'halftime'
                ? 'text-amber-400 font-semibold'
                : isFinished
                  ? 'text-[#C8F135] font-semibold'
                  : 'text-slate-400'
          }`}
        >
          {isLive
            ? `LIVE ${formatMatchClock(match.clockSeconds)}`
            : match.status === 'halftime'
              ? 'HALFTIME'
              : isFinished
                ? 'FINAL'
                : formatScheduledTime(match.scheduledAt)}
        </span>
      </div>

      {/* Home Team Row */}
      <div
        className={`px-3.5 py-2.5 flex items-center justify-between gap-3 border-b border-white/5 ${
          homeWon ? 'bg-[#C8F135]/[0.07]' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {homeSeed !== undefined && (
            <span className="font-mono text-[11px] font-semibold text-slate-400 w-5 shrink-0">
              #{homeSeed}
            </span>
          )}
          <TeamCrest
            shortCode={home?.shortCode ?? 'TBD'}
            accentColor={home?.accentColor ?? '#475569'}
            size="sm"
          />
          <span
            className={`font-display text-base font-bold truncate ${
              homeWon ? 'text-[#C8F135]' : home ? 'text-white' : 'text-slate-500'
            }`}
          >
            {home ? home.name : 'TBD'}
          </span>
        </div>
        <span
          className={`font-mono tabular-nums text-base font-bold ${
            homeWon ? 'text-[#C8F135]' : 'text-white'
          }`}
        >
          {match.status === 'scheduled' ? '-' : match.homeScore}
        </span>
      </div>

      {/* Away Team Row */}
      <div
        className={`px-3.5 py-2.5 flex items-center justify-between gap-3 ${
          awayWon ? 'bg-[#C8F135]/[0.07]' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {awaySeed !== undefined && (
            <span className="font-mono text-[11px] font-semibold text-slate-400 w-5 shrink-0">
              #{awaySeed}
            </span>
          )}
          <TeamCrest
            shortCode={away?.shortCode ?? 'TBD'}
            accentColor={away?.accentColor ?? '#475569'}
            size="sm"
          />
          <span
            className={`font-display text-base font-bold truncate ${
              awayWon ? 'text-[#C8F135]' : away ? 'text-white' : 'text-slate-500'
            }`}
          >
            {away ? away.name : 'Winner R1'}
          </span>
        </div>
        <span
          className={`font-mono tabular-nums text-base font-bold ${
            awayWon ? 'text-[#C8F135]' : 'text-white'
          }`}
        >
          {match.status === 'scheduled' ? '-' : match.awayScore}
        </span>
      </div>
    </button>
  );
}

export function BracketSection({
  matches,
  teams,
  onInspectMatch,
}: BracketSectionProps) {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const seedByTeamId = useMemo(() => {
    const standings = computeStandings(teams, matches, { groupStageOnly: true });
    const map = new Map<string, number>();
    standings.forEach((entry, idx) => {
      map.set(entry.team.id, idx + 1);
    });
    return map;
  }, [teams, matches]);

  const playInMatches = useMemo(
    () =>
      matches
        .filter((m) => m.round === 'Play-In')
        .sort((a, b) => a.bracketSlot - b.bracketSlot),
    [matches],
  );
  const quarterfinals = useMemo(
    () =>
      matches
        .filter((m) => m.round === 'Quarterfinal')
        .sort((a, b) => a.bracketSlot - b.bracketSlot),
    [matches],
  );
  const semifinals = useMemo(
    () =>
      matches
        .filter((m) => m.round === 'Semifinal')
        .sort((a, b) => a.bracketSlot - b.bracketSlot),
    [matches],
  );
  const finalMatch = useMemo(() => matches.find((m) => m.round === 'Final'), [matches]);
  const thirdPlaceMatch = useMemo(
    () => matches.find((m) => m.round === 'Third Place'),
    [matches],
  );

  const champion =
    finalMatch?.status === 'finished' && finalMatch.winnerTeamId
      ? teamMap.get(finalMatch.winnerTeamId)
      : undefined;

  return (
    <section id="bracket" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Sudden-Death Bracket
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Seeded from group standings: #1–#4 receive Quarterfinal Byes; #5–#12 clash in Round 1 Sudden Death (#5v#12, #6v#11, #7v#10, #8v#9).
          </p>
        </div>

        {champion && (
          <div className="inline-flex items-center gap-2.5 text-sm font-semibold text-[#C8F135]">
            <Trophy className="w-4 h-4" aria-hidden="true" />
            <span>Champion: {champion.name}</span>
          </div>
        )}
      </div>

      <div className="bg-[#0D1016] border border-white/10 rounded-2xl p-5 sm:p-8 overflow-x-auto">
        <div className="min-w-[1120px] grid grid-cols-4 gap-7 items-stretch">
          {/* Column 1: Round 1 Sudden Death (#5 - #12) */}
          <div className="flex flex-col justify-between gap-6">
            <div className="text-xs font-semibold tracking-wide text-slate-400 pb-2 border-b border-white/10">
              Round 1 · Play-In (#5–#12)
            </div>
            <div className="flex flex-col justify-around gap-5 flex-1">
              {playInMatches.length > 0 ? (
                playInMatches.map((match) => (
                  <BracketNode
                    key={match.id}
                    match={match}
                    teamMap={teamMap}
                    seedByTeamId={seedByTeamId}
                    onInspectMatch={onInspectMatch}
                  />
                ))
              ) : (
                <BracketNode
                  teamMap={teamMap}
                  seedByTeamId={seedByTeamId}
                  onInspectMatch={onInspectMatch}
                />
              )}
            </div>
          </div>

          {/* Column 2: Quarterfinals (#1 - #4 Bye) */}
          <div className="flex flex-col justify-between gap-6">
            <div className="text-xs font-semibold tracking-wide text-slate-400 pb-2 border-b border-white/10">
              Quarterfinals (#1–#4 Bye)
            </div>
            <div className="flex flex-col justify-around gap-5 flex-1">
              {quarterfinals.length > 0 ? (
                quarterfinals.map((match) => (
                  <BracketNode
                    key={match.id}
                    match={match}
                    teamMap={teamMap}
                    seedByTeamId={seedByTeamId}
                    onInspectMatch={onInspectMatch}
                  />
                ))
              ) : (
                <BracketNode
                  teamMap={teamMap}
                  seedByTeamId={seedByTeamId}
                  onInspectMatch={onInspectMatch}
                />
              )}
            </div>
          </div>

          {/* Column 3: Semifinals */}
          <div className="flex flex-col justify-between gap-6">
            <div className="text-xs font-semibold tracking-wide text-slate-400 pb-2 border-b border-white/10">
              Semifinals
            </div>
            <div className="flex flex-col justify-around gap-12 flex-1 py-8">
              {semifinals.length > 0 ? (
                semifinals.map((match) => (
                  <BracketNode
                    key={match.id}
                    match={match}
                    teamMap={teamMap}
                    seedByTeamId={seedByTeamId}
                    onInspectMatch={onInspectMatch}
                  />
                ))
              ) : (
                <BracketNode
                  teamMap={teamMap}
                  seedByTeamId={seedByTeamId}
                  onInspectMatch={onInspectMatch}
                />
              )}
            </div>
          </div>

          {/* Column 4: Grand Final & Third Place */}
          <div className="flex flex-col justify-between gap-6">
            <div className="text-xs font-semibold tracking-wide text-slate-400 pb-2 border-b border-white/10">
              Finals
            </div>
            <div className="flex flex-col justify-center gap-10 flex-1">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#C8F135]">
                  <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Grand Final</span>
                </div>
                <BracketNode
                  match={finalMatch}
                  teamMap={teamMap}
                  seedByTeamId={seedByTeamId}
                  onInspectMatch={onInspectMatch}
                />
              </div>

              {thirdPlaceMatch && (
                <div className="space-y-2 pt-4 border-t border-white/10">
                  <div className="text-xs font-semibold text-slate-400">
                    Third Place Playoff
                  </div>
                  <BracketNode
                    match={thirdPlaceMatch}
                    teamMap={teamMap}
                    seedByTeamId={seedByTeamId}
                    onInspectMatch={onInspectMatch}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
