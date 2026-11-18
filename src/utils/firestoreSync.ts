import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { createEmptyTournament } from '../data/seedTournament';
import { AUTHORIZED_ADMIN_EMAIL, auth, db, handleFirestoreError, OperationType } from '../firebase';
import type { Match, Team, TournamentMeta, TournamentState } from '../types/tournament';

function canAdminSync(): boolean {
  const user = auth.currentUser;
  return Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === AUTHORIZED_ADMIN_EMAIL.toLowerCase(),
  );
}

function buildTournamentPayload(meta: TournamentMeta, isCreate: boolean) {
  const safeName = meta.name && meta.name.trim().length >= 2 ? meta.name.trim() : 'RoboPitch Championship 2026';
  const safeSeason =
    meta.season && meta.season.trim().length >= 2
      ? meta.season.trim()
      : '3 Groups · Round-Robin + Sudden-Death Bracket · 4-Min Matches';
  const payload: Record<string, unknown> = {
    id: meta.id,
    name: safeName.slice(0, 120),
    season: safeSeason.slice(0, 120),
    activeMatchId: meta.activeMatchId ?? null,
    rulesVersion: meta.rulesVersion ?? 3,
    visibility: 'public',
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

function buildTeamPayload(team: Team, isCreate: boolean) {
  const safeRegion =
    team.region && team.region.trim().length >= 2 ? team.region.trim() : 'School Class';
  const payload: Record<string, unknown> = {
    id: team.id,
    name: team.name.slice(0, 80),
    shortCode: team.shortCode.slice(0, 6),
    division: team.division.slice(0, 60),
    region: safeRegion.slice(0, 60),
    accentColor: team.accentColor,
    seed: Math.max(1, Math.min(64, Math.trunc(team.seed))),
    robots: team.robots.slice(0, 10),
    visibility: 'public',
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

function buildMatchPayload(match: Match, isCreate: boolean) {
  const payload: Record<string, unknown> = {
    id: match.id,
    round: match.round,
    bracketSlot: Math.max(0, Math.min(100, Math.trunc(match.bracketSlot))),
    nextMatchId: match.nextMatchId ?? null,
    nextMatchSide: match.nextMatchSide ?? '',
    homeTeamId: match.homeTeamId ?? null,
    awayTeamId: match.awayTeamId ?? null,
    homeScore: Math.max(0, Math.min(999, Math.trunc(match.homeScore))),
    awayScore: Math.max(0, Math.min(999, Math.trunc(match.awayScore))),
    homeFlipOvers: Math.max(0, Math.min(999, Math.trunc(match.homeFlipOvers ?? 0))),
    awayFlipOvers: Math.max(0, Math.min(999, Math.trunc(match.awayFlipOvers ?? 0))),
    durationSeconds: Math.max(60, Math.min(7200, Math.trunc(match.durationSeconds ?? 240))),
    status: match.status,
    period: match.period.slice(0, 40),
    clockSeconds: Math.max(0, Math.min(7200, Math.trunc(match.clockSeconds))),
    clockRunning: Boolean(match.clockRunning),
    arenaPitch: match.arenaPitch.slice(0, 60),
    scheduledAt: match.scheduledAt.slice(0, 64),
    winnerTeamId: match.winnerTeamId ?? null,
    events: match.events.slice(0, 50),
    visibility: 'public',
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

export async function syncTournamentMetaToFirestore(meta: TournamentMeta): Promise<void> {
  if (!canAdminSync()) return;
  const path = `tournament/${meta.id}`;
  const ref = doc(db, 'tournament', meta.id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, buildTournamentPayload(meta, false));
    } else {
      await setDoc(ref, buildTournamentPayload(meta, true));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncMatchToFirestore(match: Match): Promise<void> {
  if (!canAdminSync()) return;
  const path = `matches/${match.id}`;
  const ref = doc(db, 'matches', match.id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, buildMatchPayload(match, false));
    } else {
      await setDoc(ref, buildMatchPayload(match, true));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncTeamToFirestore(team: Team): Promise<void> {
  if (!canAdminSync()) return;
  const path = `teams/${team.id}`;
  const ref = doc(db, 'teams', team.id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, buildTeamPayload(team, false));
    } else {
      await setDoc(ref, buildTeamPayload(team, true));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTeamFromFirestore(teamId: string): Promise<void> {
  if (!canAdminSync()) return;
  const path = `teams/${teamId}`;
  try {
    await deleteDoc(doc(db, 'teams', teamId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteMatchFromFirestore(matchId: string): Promise<void> {
  if (!canAdminSync()) return;
  const path = `matches/${matchId}`;
  try {
    await deleteDoc(doc(db, 'matches', matchId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncFullStateToFirestore(state: TournamentState): Promise<void> {
  if (!canAdminSync()) return;

  try {
    const existingTeamsSnap = await getDocs(collection(db, 'teams'));
    const existingMatchesSnap = await getDocs(collection(db, 'matches'));
    const existingTournamentSnap = await getDoc(doc(db, 'tournament', state.meta.id));

    const existingTeamIds = new Set(existingTeamsSnap.docs.map((d) => d.id));
    const existingMatchIds = new Set(existingMatchesSnap.docs.map((d) => d.id));

    const batch = writeBatch(db);

    const metaRef = doc(db, 'tournament', state.meta.id);
    if (existingTournamentSnap.exists()) {
      batch.update(metaRef, buildTournamentPayload(state.meta, false));
    } else {
      batch.set(metaRef, buildTournamentPayload(state.meta, true));
    }

    const nextTeamIds = new Set(state.teams.map((t) => t.id));
    const nextMatchIds = new Set(state.matches.map((m) => m.id));

    for (const oldTeamId of existingTeamIds) {
      if (!nextTeamIds.has(oldTeamId)) {
        batch.delete(doc(db, 'teams', oldTeamId));
      }
    }

    for (const oldMatchId of existingMatchIds) {
      if (!nextMatchIds.has(oldMatchId)) {
        batch.delete(doc(db, 'matches', oldMatchId));
      }
    }

    for (const team of state.teams) {
      const teamRef = doc(db, 'teams', team.id);
      if (existingTeamIds.has(team.id)) {
        batch.update(teamRef, buildTeamPayload(team, false));
      } else {
        batch.set(teamRef, buildTeamPayload(team, true));
      }
    }

    for (const match of state.matches) {
      const matchRef = doc(db, 'matches', match.id);
      if (existingMatchIds.has(match.id)) {
        batch.update(matchRef, buildMatchPayload(match, false));
      } else {
        batch.set(matchRef, buildMatchPayload(match, true));
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'tournament/main');
  }
}

function mapTeamDoc(id: string, data: DocumentData): Team {
  return {
    id: String(data.id ?? id),
    name: String(data.name ?? ''),
    shortCode: String(data.shortCode ?? ''),
    division: String(data.division ?? 'Group A'),
    region: String(data.region ?? 'School Class'),
    accentColor: String(data.accentColor ?? '#C8F135'),
    seed: Number(data.seed ?? 1),
    robots: Array.isArray(data.robots) ? (data.robots as Team['robots']) : [],
  };
}

function mapMatchDoc(id: string, data: DocumentData): Match {
  return {
    id: String(data.id ?? id),
    round: (data.round as Match['round']) ?? 'Group',
    bracketSlot: Number(data.bracketSlot ?? 0),
    nextMatchId: (data.nextMatchId as string | null) ?? null,
    nextMatchSide:
      data.nextMatchSide === 'home' || data.nextMatchSide === 'away'
        ? data.nextMatchSide
        : null,
    homeTeamId: (data.homeTeamId as string | null) ?? null,
    awayTeamId: (data.awayTeamId as string | null) ?? null,
    homeScore: Number(data.homeScore ?? 0),
    awayScore: Number(data.awayScore ?? 0),
    homeFlipOvers: Number(data.homeFlipOvers ?? 0),
    awayFlipOvers: Number(data.awayFlipOvers ?? 0),
    durationSeconds: Number(data.durationSeconds ?? 240),
    status: (data.status as Match['status']) ?? 'scheduled',
    period: String(data.period ?? 'Pre-Match'),
    clockSeconds: Number(data.clockSeconds ?? 0),
    clockRunning: Boolean(data.clockRunning),
    clockUpdatedAt: Date.now(),
    arenaPitch: String(data.arenaPitch ?? 'Pitch Alpha'),
    scheduledAt: String(data.scheduledAt ?? ''),
    winnerTeamId: (data.winnerTeamId as string | null) ?? null,
    events: Array.isArray(data.events) ? (data.events as Match['events']) : [],
  };
}

export async function fetchFirestoreTournamentState(): Promise<TournamentState | null> {
  try {
    const metaSnap = await getDoc(doc(db, 'tournament', 'main'));
    if (!metaSnap.exists()) {
      return null;
    }

    const metaData = metaSnap.data();
    const [teamsSnap, matchesSnap] = await Promise.all([
      getDocs(query(collection(db, 'teams'), where('visibility', '==', 'public'))),
      getDocs(query(collection(db, 'matches'), where('visibility', '==', 'public'))),
    ]);

    const teams: Team[] = teamsSnap.docs.map((d) => mapTeamDoc(d.id, d.data()));
    const matches: Match[] = matchesSnap.docs.map((d) => mapMatchDoc(d.id, d.data()));

    return {
      meta: {
        id: 'main',
        name: String(metaData.name ?? 'RoboPitch Championship 2026'),
        season: String(metaData.season ?? ''),
        activeMatchId: (metaData.activeMatchId as string | null) ?? null,
        updatedAt: Date.now(),
        rulesVersion: Number(metaData.rulesVersion ?? 3),
      },
      teams,
      matches,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'tournament/main');
  }
}

export function subscribeToFirestoreTournamentState(
  onUpdate: (state: TournamentState) => void,
  onError?: (err: Error) => void,
): () => void {
  const fallback = createEmptyTournament();
  let metaLoaded = false;
  let teamsLoaded = false;
  let matchesLoaded = false;

  let currentMeta: TournamentMeta = fallback.meta;
  let currentTeams: Team[] = [];
  let currentMatches: Match[] = [];

  const emitIfReady = () => {
    if (!metaLoaded || !teamsLoaded || !matchesLoaded) return;
    onUpdate({
      meta: { ...currentMeta, updatedAt: Date.now() },
      teams: currentTeams,
      matches: currentMatches,
    });
  };

  const reportError = (err: unknown, path: string) => {
    try {
      handleFirestoreError(err, OperationType.GET, path);
    } catch (wrapped) {
      if (onError && wrapped instanceof Error) {
        onError(wrapped);
      }
    }
  };

  const unsubMeta = onSnapshot(
    doc(db, 'tournament', 'main'),
    (snap) => {
      metaLoaded = true;
      if (snap.exists()) {
        const metaData = snap.data();
        currentMeta = {
          id: 'main',
          name: String(metaData.name ?? 'RoboPitch Championship 2026'),
          season: String(
            metaData.season ??
              '3 Groups · Round-Robin + Sudden-Death Bracket · 4-Min Matches',
          ),
          activeMatchId: (metaData.activeMatchId as string | null) ?? null,
          updatedAt: Date.now(),
          rulesVersion: Number(metaData.rulesVersion ?? 3),
        };
      } else {
        currentMeta = fallback.meta;
      }
      emitIfReady();
    },
    (error) => reportError(error, 'tournament/main'),
  );

  const unsubTeams = onSnapshot(
    query(collection(db, 'teams'), where('visibility', '==', 'public')),
    (snap) => {
      teamsLoaded = true;
      currentTeams = snap.docs
        .map((d) => mapTeamDoc(d.id, d.data()))
        .sort((a, b) => a.seed - b.seed);
      emitIfReady();
    },
    (error) => reportError(error, 'teams'),
  );

  const unsubMatches = onSnapshot(
    query(collection(db, 'matches'), where('visibility', '==', 'public')),
    (snap) => {
      matchesLoaded = true;
      currentMatches = snap.docs
        .map((d) => mapMatchDoc(d.id, d.data()))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      emitIfReady();
    },
    (error) => reportError(error, 'matches'),
  );

  return () => {
    unsubMeta();
    unsubTeams();
    unsubMatches();
  };
}
