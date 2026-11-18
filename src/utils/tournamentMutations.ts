import type { BulkTeamDraft } from '../components/BulkTeamImporter';
import { createEmptyTournament, createSeedTournament } from '../data/seedTournament';
import type {
  Match,
  MatchEvent,
  MatchEventType,
  MatchRound,
  MatchStatus,
  RobotRole,
  RobotUnit,
  Team,
  TournamentState,
} from '../types/tournament';
import { applySeededSuddenDeathBracket } from './bracketSeeding';

const BULK_ACCENT_PALETTE = [
  '#C8F135',
  '#38BDF8',
  '#F59E0B',
  '#EF4444',
  '#10B981',
  '#A78BFA',
  '#FB7185',
  '#22D3EE',
  '#34D399',
  '#FBBF24',
  '#60A5FA',
  '#F472B6',
];

function deriveShortCode(name: string): string {
  const words = name
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean);
  let code = '';
  if (words.length >= 2) {
    code = words
      .map((w) => w[0])
      .join('')
      .slice(0, 4);
    if (code.length < 2 && words[0]) {
      code = words[0].slice(0, 3);
    }
  } else if (words.length === 1) {
    code = words[0].slice(0, 3);
  }
  if (code.length < 2) {
    code = `${code}TM`.slice(0, 3);
  }
  return code.slice(0, 6);
}

function propagateBracketAdvancement(
  matches: Match[],
  finishedMatchId: string,
): { matches: Match[]; extraChangedIds: string[] } {
  const nextMatches = matches.map((m) => ({ ...m }));
  const extraChangedIds: string[] = [];

  const match = nextMatches.find((m) => m.id === finishedMatchId);
  if (!match || match.status !== 'finished') {
    return { matches: nextMatches, extraChangedIds };
  }

  let winnerId = match.winnerTeamId;
  let loserId: string | null = null;

  if (match.homeScore > match.awayScore && match.homeTeamId) {
    winnerId = match.homeTeamId;
    loserId = match.awayTeamId;
  } else if (match.awayScore > match.homeScore && match.awayTeamId) {
    winnerId = match.awayTeamId;
    loserId = match.homeTeamId;
  } else if (winnerId) {
    loserId = winnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  }

  match.winnerTeamId = winnerId ?? null;

  if (match.nextMatchId && match.nextMatchSide && winnerId) {
    const nextMatch = nextMatches.find((m) => m.id === match.nextMatchId);
    if (nextMatch) {
      if (match.nextMatchSide === 'home') {
        nextMatch.homeTeamId = winnerId;
      } else {
        nextMatch.awayTeamId = winnerId;
      }
      extraChangedIds.push(nextMatch.id);
    }
  }

  if (match.round === 'Semifinal' && loserId) {
    const tpMatch = nextMatches.find((m) => m.round === 'Third Place');
    if (tpMatch) {
      if (match.bracketSlot === 1) {
        tpMatch.homeTeamId = loserId;
        extraChangedIds.push(tpMatch.id);
      } else if (match.bracketSlot === 2) {
        tpMatch.awayTeamId = loserId;
        extraChangedIds.push(tpMatch.id);
      }
    }
  }

  return { matches: nextMatches, extraChangedIds };
}

export function mutateTournamentMeta(
  state: TournamentState,
  patch: { name?: string; season?: string; activeMatchId?: string | null },
): TournamentState {
  const nextMeta = { ...state.meta, updatedAt: Date.now() };
  if (typeof patch.name === 'string' && patch.name.trim().length >= 2) {
    nextMeta.name = patch.name.trim().slice(0, 120);
  }
  if (typeof patch.season === 'string' && patch.season.trim().length >= 2) {
    nextMeta.season = patch.season.trim().slice(0, 120);
  }
  if (patch.activeMatchId !== undefined) {
    nextMeta.activeMatchId = patch.activeMatchId;
  }
  return { ...state, meta: nextMeta };
}

export function mutateMatchScore(
  state: TournamentState,
  matchId: string,
  payload: {
    side: 'home' | 'away';
    delta: number;
    robotNumber?: string;
    eventType?: MatchEventType;
    description?: string;
  },
): { state: TournamentState; match: Match; extraChangedMatches: Match[] } {
  const target = state.matches.find((m) => m.id === matchId);
  if (!target) throw new Error('Match not found');

  const step = Number.isFinite(payload.delta) ? Math.trunc(payload.delta) : 1;
  const updated: Match = {
    ...target,
    homeScore:
      payload.side === 'home'
        ? Math.max(0, Math.min(999, target.homeScore + step))
        : target.homeScore,
    awayScore:
      payload.side === 'away'
        ? Math.max(0, Math.min(999, target.awayScore + step))
        : target.awayScore,
  };

  const teamId = payload.side === 'home' ? updated.homeTeamId : updated.awayTeamId;
  if (step > 0 && teamId) {
    const minute = Math.max(1, Math.ceil(updated.clockSeconds / 60));
    const unit = (payload.robotNumber || '07').trim().slice(0, 8);
    const ev: MatchEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      minute,
      teamId,
      robotNumber: unit,
      type: payload.eventType || 'goal',
      description:
        (payload.description && payload.description.trim()) ||
        `Goal scored by Unit #${unit}`,
      timestamp: Date.now(),
    };
    updated.events = [...updated.events, ev].slice(-50);
  }

  let nextMatches = state.matches.map((m) => (m.id === matchId ? updated : m));
  let extraChangedMatches: Match[] = [];

  if (updated.status === 'finished') {
    const prop = propagateBracketAdvancement(nextMatches, updated.id);
    nextMatches = prop.matches;
    extraChangedMatches = nextMatches.filter((m) => prop.extraChangedIds.includes(m.id));
  }

  const finalMatch = nextMatches.find((m) => m.id === matchId) ?? updated;
  return {
    state: { ...state, meta: { ...state.meta, updatedAt: Date.now() }, matches: nextMatches },
    match: finalMatch,
    extraChangedMatches,
  };
}

export function mutateMatchFlipOver(
  state: TournamentState,
  matchId: string,
  payload: { side: 'home' | 'away'; delta: number; robotNumber?: string },
): { state: TournamentState; match: Match } {
  const target = state.matches.find((m) => m.id === matchId);
  if (!target) throw new Error('Match not found');

  const step = Number.isFinite(payload.delta) ? Math.trunc(payload.delta) : 1;
  const updated: Match = {
    ...target,
    homeFlipOvers:
      payload.side === 'home'
        ? Math.max(0, Math.min(999, (target.homeFlipOvers ?? 0) + step))
        : target.homeFlipOvers,
    awayFlipOvers:
      payload.side === 'away'
        ? Math.max(0, Math.min(999, (target.awayFlipOvers ?? 0) + step))
        : target.awayFlipOvers,
  };

  const teamId = payload.side === 'home' ? updated.homeTeamId : updated.awayTeamId;
  if (step > 0 && teamId) {
    const minute = Math.max(1, Math.ceil(updated.clockSeconds / 60));
    const unit = (payload.robotNumber || '07').trim().slice(0, 8);
    const ev: MatchEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      minute,
      teamId,
      robotNumber: unit,
      type: 'flip_over',
      description: `Flip Over bonus (+1 pt) by Unit #${unit}`,
      timestamp: Date.now(),
    };
    updated.events = [...updated.events, ev].slice(-50);
  }

  const nextMatches = state.matches.map((m) => (m.id === matchId ? updated : m));
  return {
    state: { ...state, meta: { ...state.meta, updatedAt: Date.now() }, matches: nextMatches },
    match: updated,
  };
}

export function mutateAddMatchEvent(
  state: TournamentState,
  matchId: string,
  payload: {
    teamId: string;
    robotNumber: string;
    type: MatchEventType;
    description: string;
  },
): { state: TournamentState; match: Match } {
  const target = state.matches.find((m) => m.id === matchId);
  if (!target) throw new Error('Match not found');
  if (!payload.teamId || !payload.description?.trim()) {
    throw new Error('teamId and description are required');
  }

  const ev: MatchEvent = {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    minute: Math.max(1, Math.ceil(target.clockSeconds / 60)),
    teamId: payload.teamId,
    robotNumber: (payload.robotNumber || '00').trim().slice(0, 8),
    type: payload.type || 'goal',
    description: payload.description.trim().slice(0, 140),
    timestamp: Date.now(),
  };

  const updated: Match = {
    ...target,
    events: [...target.events, ev].slice(-50),
  };

  return {
    state: {
      ...state,
      meta: { ...state.meta, updatedAt: Date.now() },
      matches: state.matches.map((m) => (m.id === matchId ? updated : m)),
    },
    match: updated,
  };
}

export function mutateDeleteMatchEvent(
  state: TournamentState,
  matchId: string,
  eventId: string,
): { state: TournamentState; match: Match } {
  const target = state.matches.find((m) => m.id === matchId);
  if (!target) throw new Error('Match not found');

  const updated: Match = {
    ...target,
    events: target.events.filter((e) => e.id !== eventId),
  };

  return {
    state: {
      ...state,
      meta: { ...state.meta, updatedAt: Date.now() },
      matches: state.matches.map((m) => (m.id === matchId ? updated : m)),
    },
    match: updated,
  };
}

export function mutatePatchMatch(
  state: TournamentState,
  matchId: string,
  body: Partial<{
    status: MatchStatus;
    period: string;
    clockSeconds: number;
    clockRunning: boolean;
    homeTeamId: string | null;
    awayTeamId: string | null;
    homeScore: number;
    awayScore: number;
    homeFlipOvers: number;
    awayFlipOvers: number;
    durationSeconds: number;
    arenaPitch: string;
    scheduledAt: string;
    round: MatchRound;
    winnerTeamId: string | null;
  }>,
): { state: TournamentState; match: Match; extraChangedMatches: Match[]; metaChanged: boolean } {
  const target = state.matches.find((m) => m.id === matchId);
  if (!target) throw new Error('Match not found');

  const updated: Match = { ...target };
  const nextMeta = { ...state.meta, updatedAt: Date.now() };
  let metaChanged = false;

  if (body.status && ['scheduled', 'live', 'halftime', 'finished'].includes(body.status)) {
    updated.status = body.status;
    if (body.status === 'live') {
      if (nextMeta.activeMatchId !== updated.id) {
        nextMeta.activeMatchId = updated.id;
        metaChanged = true;
      }
      if (updated.period === 'Pre-Match') {
        updated.period = '1st Half';
      }
    } else if (body.status === 'halftime') {
      updated.clockRunning = false;
      updated.period = 'Halftime';
    } else if (body.status === 'finished') {
      updated.clockRunning = false;
      updated.period = 'Full Time';
    } else if (body.status === 'scheduled') {
      updated.clockRunning = false;
      updated.period = 'Pre-Match';
    }
  }

  if (typeof body.period === 'string' && body.period.trim()) {
    updated.period = body.period.trim().slice(0, 40);
  }
  if (typeof body.clockSeconds === 'number' && Number.isFinite(body.clockSeconds)) {
    updated.clockSeconds = Math.max(0, Math.min(7200, Math.trunc(body.clockSeconds)));
    updated.clockUpdatedAt = Date.now();
  }
  if (typeof body.clockRunning === 'boolean') {
    updated.clockRunning = body.clockRunning;
    updated.clockUpdatedAt = Date.now();
  }
  if (body.homeTeamId !== undefined) updated.homeTeamId = body.homeTeamId || null;
  if (body.awayTeamId !== undefined) updated.awayTeamId = body.awayTeamId || null;
  if (typeof body.homeScore === 'number' && Number.isFinite(body.homeScore)) {
    updated.homeScore = Math.max(0, Math.min(999, Math.trunc(body.homeScore)));
  }
  if (typeof body.awayScore === 'number' && Number.isFinite(body.awayScore)) {
    updated.awayScore = Math.max(0, Math.min(999, Math.trunc(body.awayScore)));
  }
  if (typeof body.homeFlipOvers === 'number' && Number.isFinite(body.homeFlipOvers)) {
    updated.homeFlipOvers = Math.max(0, Math.min(999, Math.trunc(body.homeFlipOvers)));
  }
  if (typeof body.awayFlipOvers === 'number' && Number.isFinite(body.awayFlipOvers)) {
    updated.awayFlipOvers = Math.max(0, Math.min(999, Math.trunc(body.awayFlipOvers)));
  }
  if (typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds)) {
    updated.durationSeconds = Math.max(60, Math.min(7200, Math.trunc(body.durationSeconds)));
  }
  if (typeof body.arenaPitch === 'string' && body.arenaPitch.trim()) {
    updated.arenaPitch = body.arenaPitch.trim().slice(0, 60);
  }
  if (typeof body.scheduledAt === 'string' && body.scheduledAt.trim()) {
    updated.scheduledAt = body.scheduledAt.trim().slice(0, 64);
  }
  if (
    body.round &&
    ['Group', 'Play-In', 'Quarterfinal', 'Semifinal', 'Third Place', 'Final'].includes(body.round)
  ) {
    updated.round = body.round;
  }
  if (body.winnerTeamId !== undefined) {
    updated.winnerTeamId = body.winnerTeamId;
  }

  let nextMatches = state.matches.map((m) => (m.id === matchId ? updated : m));
  let extraChangedMatches: Match[] = [];

  if (updated.status === 'finished') {
    const prop = propagateBracketAdvancement(nextMatches, updated.id);
    nextMatches = prop.matches;
    extraChangedMatches = nextMatches.filter((m) => prop.extraChangedIds.includes(m.id));
  }

  const finalMatch = nextMatches.find((m) => m.id === matchId) ?? updated;
  return {
    state: { ...state, meta: nextMeta, matches: nextMatches },
    match: finalMatch,
    extraChangedMatches,
    metaChanged,
  };
}

export function mutateCreateMatch(
  state: TournamentState,
  payload: {
    round?: MatchRound;
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    arenaPitch?: string;
    scheduledAt?: string;
  },
): { state: TournamentState; match: Match } {
  const newMatch: Match = {
    id: `match-${Date.now().toString(36)}`,
    round: payload.round || 'Group',
    bracketSlot: state.matches.length + 1,
    nextMatchId: null,
    nextMatchSide: null,
    homeTeamId: payload.homeTeamId || null,
    awayTeamId: payload.awayTeamId || null,
    homeScore: 0,
    awayScore: 0,
    homeFlipOvers: 0,
    awayFlipOvers: 0,
    durationSeconds: 240,
    status: 'scheduled',
    period: 'Pre-Match',
    clockSeconds: 0,
    clockRunning: false,
    clockUpdatedAt: Date.now(),
    arenaPitch: (payload.arenaPitch || 'Pitch Alpha').trim().slice(0, 60),
    scheduledAt: (payload.scheduledAt || new Date().toISOString()).slice(0, 64),
    winnerTeamId: null,
    events: [],
  };

  return {
    state: {
      ...state,
      meta: { ...state.meta, updatedAt: Date.now() },
      matches: [...state.matches, newMatch],
    },
    match: newMatch,
  };
}

export function mutateDeleteMatch(
  state: TournamentState,
  matchId: string,
): { state: TournamentState; metaChanged: boolean } {
  const nextMatches = state.matches.filter((m) => m.id !== matchId);
  let activeMatchId = state.meta.activeMatchId;
  let metaChanged = false;
  if (activeMatchId === matchId) {
    const live = nextMatches.find((m) => m.status === 'live');
    activeMatchId = live?.id ?? nextMatches[0]?.id ?? null;
    metaChanged = true;
  }
  return {
    state: {
      ...state,
      meta: { ...state.meta, activeMatchId, updatedAt: Date.now() },
      matches: nextMatches,
    },
    metaChanged,
  };
}

export function mutateCreateTeam(
  state: TournamentState,
  payload: {
    name: string;
    shortCode: string;
    division?: string;
    accentColor?: string;
    seed?: number;
    robots?: RobotUnit[];
  },
): { state: TournamentState; team: Team } {
  if (!payload.name?.trim() || !payload.shortCode?.trim()) {
    throw new Error('Team name and shortCode are required');
  }
  const cleanName = payload.name.trim().slice(0, 80);
  const rawCode = payload.shortCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  const shortCode = rawCode.length >= 2 ? rawCode : deriveShortCode(cleanName);
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const id = `team-${slug || Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

  const team: Team = {
    id,
    name: cleanName.length >= 2 ? cleanName : `${cleanName} FC`,
    shortCode,
    division: (payload.division || 'Group A').trim().slice(0, 60),
    region: 'School Class',
    accentColor: /^#[0-9a-fA-F]{6}$/.test(payload.accentColor || '')
      ? (payload.accentColor as string)
      : '#C8F135',
    seed: Number.isFinite(payload.seed)
      ? Math.max(1, Math.min(64, Math.trunc(payload.seed as number)))
      : Math.max(1, Math.min(64, state.teams.length + 1)),
    robots: Array.isArray(payload.robots) ? payload.robots.slice(0, 10) : [],
  };

  return {
    state: {
      ...state,
      meta: { ...state.meta, updatedAt: Date.now() },
      teams: [...state.teams, team],
    },
    team,
  };
}

export function mutateBulkCreateTeams(
  state: TournamentState,
  drafts: BulkTeamDraft[],
): { state: TournamentState; createdCount: number; teams: Team[] } {
  const validRoles: RobotRole[] = ['Striker', 'Midfielder', 'Defender', 'Keeper'];
  const createdTeams: Team[] = [];
  const baseStamp = Date.now().toString(36);

  for (let idx = 0; idx < Math.min(64, drafts.length); idx += 1) {
    const item = drafts[idx];
    const cleanName = typeof item?.name === 'string' ? item.name.trim().slice(0, 80) : '';
    if (cleanName.length < 2) continue;

    const rawCode =
      typeof item.shortCode === 'string'
        ? item.shortCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
        : '';
    const shortCode = rawCode.length >= 2 ? rawCode : deriveShortCode(cleanName);

    const rawDiv = typeof item.division === 'string' ? item.division.trim().slice(0, 60) : '';
    const division = rawDiv.length >= 2 ? rawDiv : 'Group A';

    const accentColor =
      BULK_ACCENT_PALETTE[(state.teams.length + createdTeams.length) % BULK_ACCENT_PALETTE.length];

    const seed = Math.max(1, Math.min(64, state.teams.length + createdTeams.length + 1));

    const robots: RobotUnit[] = Array.isArray(item.robots)
      ? item.robots
          .slice(0, 10)
          .filter(
            (r) =>
              (r?.designation && r.designation.trim()) ||
              (r?.unitNumber && r.unitNumber.trim()),
          )
          .map((r, rIdx) => ({
            id: `r-${baseStamp}-${idx}-${rIdx}-${Math.random().toString(36).slice(2, 5)}`,
            unitNumber: (r.unitNumber?.trim() || String(rIdx === 0 ? '07' : '01')).slice(0, 4),
            designation: (r.designation?.trim() || `Unit ${rIdx + 1}`).slice(0, 60),
            role: validRoles.includes(r.role as RobotRole)
              ? (r.role as RobotRole)
              : rIdx === 0
                ? 'Striker'
                : 'Keeper',
            actuation: 'Standard Drive',
            operator: 'Unassigned',
          }))
      : [];

    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    const id = `team-${slug || baseStamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`;

    createdTeams.push({
      id,
      name: cleanName,
      shortCode,
      division,
      region: 'School Class',
      accentColor,
      seed,
      robots,
    });
  }

  if (createdTeams.length === 0) {
    throw new Error('No valid teams found (each team name needs at least 2 characters)');
  }

  return {
    state: {
      ...state,
      meta: { ...state.meta, updatedAt: Date.now() },
      teams: [...state.teams, ...createdTeams],
    },
    createdCount: createdTeams.length,
    teams: createdTeams,
  };
}

export function mutateUpdateTeam(
  state: TournamentState,
  teamId: string,
  body: Partial<Team>,
): { state: TournamentState; team: Team } {
  const target = state.teams.find((t) => t.id === teamId);
  if (!target) throw new Error('Team not found');

  const updated: Team = { ...target };
  if (typeof body.name === 'string' && body.name.trim().length >= 2) {
    updated.name = body.name.trim().slice(0, 80);
  }
  if (typeof body.shortCode === 'string' && body.shortCode.trim().length >= 2) {
    updated.shortCode = body.shortCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
  }
  if (typeof body.division === 'string' && body.division.trim().length >= 2) {
    updated.division = body.division.trim().slice(0, 60);
  }
  if (typeof body.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.accentColor)) {
    updated.accentColor = body.accentColor;
  }
  if (typeof body.seed === 'number' && Number.isFinite(body.seed)) {
    updated.seed = Math.max(1, Math.min(64, Math.trunc(body.seed)));
  }
  if (Array.isArray(body.robots)) {
    updated.robots = body.robots.slice(0, 10);
  }

  return {
    state: {
      ...state,
      meta: { ...state.meta, updatedAt: Date.now() },
      teams: state.teams.map((t) => (t.id === teamId ? updated : t)),
    },
    team: updated,
  };
}

export function mutateDeleteTeam(
  state: TournamentState,
  teamId: string,
): { state: TournamentState; affectedMatches: Match[] } {
  const nextTeams = state.teams.filter((t) => t.id !== teamId);
  const affectedMatches: Match[] = [];
  const nextMatches = state.matches.map((match) => {
    if (
      match.homeTeamId === teamId ||
      match.awayTeamId === teamId ||
      match.winnerTeamId === teamId
    ) {
      const cleaned: Match = {
        ...match,
        homeTeamId: match.homeTeamId === teamId ? null : match.homeTeamId,
        awayTeamId: match.awayTeamId === teamId ? null : match.awayTeamId,
        winnerTeamId: match.winnerTeamId === teamId ? null : match.winnerTeamId,
      };
      affectedMatches.push(cleaned);
      return cleaned;
    }
    return match;
  });

  return {
    state: {
      ...state,
      meta: { ...state.meta, updatedAt: Date.now() },
      teams: nextTeams,
      matches: nextMatches,
    },
    affectedMatches,
  };
}

export function mutateSeedBracketFromStandings(state: TournamentState): TournamentState {
  return {
    ...state,
    meta: { ...state.meta, updatedAt: Date.now() },
    matches: applySeededSuddenDeathBracket(state.teams, state.matches),
  };
}

export function mutateGenerateTournamentSchedule(state: TournamentState): TournamentState {
  if (state.teams.length < 2) {
    throw new Error('Register at least 2 teams before generating a tournament schedule');
  }

  const now = Date.now();
  let slotTimeMs = now + 10 * 60 * 1000;

  const nextScheduledIso = (): string => {
    const iso = new Date(slotTimeMs).toISOString();
    slotTimeMs += 10 * 60 * 1000;
    return iso;
  };

  const makeEmptyMatch = (params: {
    id: string;
    round: MatchRound;
    bracketSlot: number;
    nextMatchId: string | null;
    nextMatchSide: 'home' | 'away' | null;
    homeTeamId: string | null;
    awayTeamId: string | null;
    arenaPitch: string;
  }): Match => ({
    id: params.id,
    round: params.round,
    bracketSlot: params.bracketSlot,
    nextMatchId: params.nextMatchId,
    nextMatchSide: params.nextMatchSide,
    homeTeamId: params.homeTeamId,
    awayTeamId: params.awayTeamId,
    homeScore: 0,
    awayScore: 0,
    homeFlipOvers: 0,
    awayFlipOvers: 0,
    durationSeconds: 240,
    status: 'scheduled',
    period: 'Pre-Match',
    clockSeconds: 0,
    clockRunning: false,
    clockUpdatedAt: now,
    arenaPitch: params.arenaPitch,
    scheduledAt: nextScheduledIso(),
    winnerTeamId: null,
    events: [],
  });

  const teamsByGroup = new Map<string, Team[]>();
  for (const team of [...state.teams].sort((a, b) => a.seed - b.seed)) {
    const grp = team.division || 'Group A';
    const list = teamsByGroup.get(grp) ?? [];
    list.push(team);
    teamsByGroup.set(grp, list);
  }

  const generatedMatches: Match[] = [];
  let groupSlot = 1;
  const orderedGroups = Array.from(teamsByGroup.keys()).sort();

  for (const groupName of orderedGroups) {
    const grpTeams = teamsByGroup.get(groupName) ?? [];
    for (let i = 0; i < grpTeams.length; i += 1) {
      for (let j = i + 1; j < grpTeams.length; j += 1) {
        generatedMatches.push(
          makeEmptyMatch({
            id: `grp-${groupSlot}`,
            round: 'Group',
            bracketSlot: groupSlot,
            nextMatchId: null,
            nextMatchSide: null,
            homeTeamId: grpTeams[i].id,
            awayTeamId: grpTeams[j].id,
            arenaPitch: groupSlot % 2 === 1 ? 'Pitch Alpha' : 'Pitch Beta',
          }),
        );
        groupSlot += 1;
      }
    }
  }

  let finalMatches: Match[];
  if (state.teams.length >= 5) {
    generatedMatches.push(
      makeEmptyMatch({ id: 'po-1', round: 'Play-In', bracketSlot: 1, nextMatchId: 'qf-1', nextMatchSide: 'away', homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Alpha' }),
      makeEmptyMatch({ id: 'po-2', round: 'Play-In', bracketSlot: 2, nextMatchId: 'qf-2', nextMatchSide: 'away', homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Beta' }),
      makeEmptyMatch({ id: 'po-3', round: 'Play-In', bracketSlot: 3, nextMatchId: 'qf-3', nextMatchSide: 'away', homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Alpha' }),
      makeEmptyMatch({ id: 'po-4', round: 'Play-In', bracketSlot: 4, nextMatchId: 'qf-4', nextMatchSide: 'away', homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Beta' }),
      makeEmptyMatch({ id: 'qf-1', round: 'Quarterfinal', bracketSlot: 1, nextMatchId: 'sf-1', nextMatchSide: 'home', homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Alpha' }),
      makeEmptyMatch({ id: 'qf-2', round: 'Quarterfinal', bracketSlot: 2, nextMatchId: 'sf-1', nextMatchSide: 'away', homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Beta' }),
      makeEmptyMatch({ id: 'qf-3', round: 'Quarterfinal', bracketSlot: 3, nextMatchId: 'sf-2', nextMatchSide: 'home', homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Alpha' }),
      makeEmptyMatch({ id: 'qf-4', round: 'Quarterfinal', bracketSlot: 4, nextMatchId: 'sf-2', nextMatchSide: 'away', homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Beta' }),
      makeEmptyMatch({ id: 'sf-1', round: 'Semifinal', bracketSlot: 1, nextMatchId: 'final-1', nextMatchSide: 'home', homeTeamId: null, awayTeamId: null, arenaPitch: 'Center Arena' }),
      makeEmptyMatch({ id: 'sf-2', round: 'Semifinal', bracketSlot: 2, nextMatchId: 'final-1', nextMatchSide: 'away', homeTeamId: null, awayTeamId: null, arenaPitch: 'Center Arena' }),
      makeEmptyMatch({ id: 'tp-1', round: 'Third Place', bracketSlot: 1, nextMatchId: null, nextMatchSide: null, homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Beta' }),
      makeEmptyMatch({ id: 'final-1', round: 'Final', bracketSlot: 1, nextMatchId: null, nextMatchSide: null, homeTeamId: null, awayTeamId: null, arenaPitch: 'Center Arena' }),
    );
    finalMatches = applySeededSuddenDeathBracket(state.teams, generatedMatches);
  } else if (state.teams.length >= 4) {
    const sorted = [...state.teams].sort((a, b) => a.seed - b.seed);
    generatedMatches.push(
      makeEmptyMatch({ id: 'sf-1', round: 'Semifinal', bracketSlot: 1, nextMatchId: 'final-1', nextMatchSide: 'home', homeTeamId: sorted[0].id, awayTeamId: sorted[3].id, arenaPitch: 'Center Arena' }),
      makeEmptyMatch({ id: 'sf-2', round: 'Semifinal', bracketSlot: 2, nextMatchId: 'final-1', nextMatchSide: 'away', homeTeamId: sorted[1].id, awayTeamId: sorted[2].id, arenaPitch: 'Center Arena' }),
      makeEmptyMatch({ id: 'tp-1', round: 'Third Place', bracketSlot: 1, nextMatchId: null, nextMatchSide: null, homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Beta' }),
      makeEmptyMatch({ id: 'final-1', round: 'Final', bracketSlot: 1, nextMatchId: null, nextMatchSide: null, homeTeamId: null, awayTeamId: null, arenaPitch: 'Center Arena' }),
    );
    finalMatches = generatedMatches;
  } else {
    const sorted = [...state.teams].sort((a, b) => a.seed - b.seed);
    generatedMatches.push(
      makeEmptyMatch({ id: 'final-1', round: 'Final', bracketSlot: 1, nextMatchId: null, nextMatchSide: null, homeTeamId: sorted[0].id, awayTeamId: sorted[1].id, arenaPitch: 'Center Arena' }),
    );
    finalMatches = generatedMatches;
  }

  return {
    ...state,
    meta: {
      ...state.meta,
      activeMatchId: finalMatches[0]?.id ?? null,
      updatedAt: now,
    },
    matches: finalMatches,
  };
}

export function mutateResetTournament(
  state: TournamentState,
  mode: 'clear' | 'demo' = 'clear',
): TournamentState {
  if (mode === 'demo') {
    return createSeedTournament();
  }
  return createEmptyTournament({
    name: state.meta.name,
    season: state.meta.season,
  });
}
