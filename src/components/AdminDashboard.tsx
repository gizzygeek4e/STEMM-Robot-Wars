import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Check,
  CloudUpload,
  LogOut,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AUTHORIZED_ADMIN_EMAIL, auth, googleProvider } from '../firebase';
import type {
  Match,
  MatchEventType,
  MatchRound,
  MatchStatus,
  RobotRole,
  RobotUnit,
  Team,
  TournamentState,
} from '../types/tournament';
import {
  deleteMatchFromFirestore,
  deleteTeamFromFirestore,
  fetchFirestoreTournamentState,
  syncFullStateToFirestore,
  syncMatchToFirestore,
  syncTeamToFirestore,
  syncTournamentMetaToFirestore,
} from '../utils/firestoreSync';
import { formatMatchClock, formatScheduledDateTime } from '../utils/formatTime';
import {
  mutateAddMatchEvent,
  mutateBulkCreateTeams,
  mutateCreateMatch,
  mutateCreateTeam,
  mutateDeleteMatch,
  mutateDeleteMatchEvent,
  mutateDeleteTeam,
  mutateGenerateTournamentSchedule,
  mutateMatchFlipOver,
  mutateMatchScore,
  mutatePatchMatch,
  mutateResetTournament,
  mutateSeedBracketFromStandings,
  mutateTournamentMeta,
  mutateUpdateTeam,
} from '../utils/tournamentMutations';
import type { BackendMode } from '../hooks/useTournamentSocket';
import { BulkTeamImporter, type BulkTeamDraft } from './BulkTeamImporter';
import { TeamCrest } from './TeamCrest';

interface AdminDashboardProps {
  user: User | null;
  authReady: boolean;
  state: TournamentState;
  backendMode?: BackendMode;
  untouchedBoot?: boolean;
  onStateUpdated: (nextState: TournamentState) => void;
  onBackToPublic: () => void;
}

type AdminTab = 'scoring' | 'matches' | 'teams' | 'settings';

export function AdminDashboard({
  user,
  authReady,
  state,
  backendMode = 'server',
  untouchedBoot = false,
  onStateUpdated,
  onBackToPublic,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('scoring');
  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    state.meta.activeMatchId ?? state.matches[0]?.id ?? '',
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string>(state.teams[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState<boolean>(state.teams.length === 0);
  const hydratedRef = useRef(false);

  // Scoring helper inputs
  const [homeScorerUnit, setHomeScorerUnit] = useState('07');
  const [awayScorerUnit, setAwayScorerUnit] = useState('09');
  const [eventTeamId, setEventTeamId] = useState('');
  const [eventType, setEventType] = useState<MatchEventType>('card_yellow');
  const [eventUnit, setEventUnit] = useState('04');
  const [eventDesc, setEventDesc] = useState('');

  // New Match form
  const [newMatchRound, setNewMatchRound] = useState<MatchRound>('Group');
  const [newMatchPitch, setNewMatchPitch] = useState('Pitch Alpha');
  const [newMatchHomeId, setNewMatchHomeId] = useState(state.teams[0]?.id ?? '');
  const [newMatchAwayId, setNewMatchAwayId] = useState(state.teams[1]?.id ?? '');
  const [newMatchTime, setNewMatchTime] = useState('2026-11-17T21:00');

  // New Team form
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCode, setNewTeamCode] = useState('');
  const [newTeamDiv, setNewTeamDiv] = useState('Group A');
  const [newTeamColor, setNewTeamColor] = useState('#C8F135');

  // Edit Selected Team form
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamCode, setEditTeamCode] = useState('');
  const [editTeamDiv, setEditTeamDiv] = useState('');
  const [editTeamSeed, setEditTeamSeed] = useState(1);
  const [editTeamColor, setEditTeamColor] = useState('#C8F135');

  // New Robot Unit form
  const [robotNum, setRobotNum] = useState('');
  const [robotDesig, setRobotDesig] = useState('');
  const [robotRole, setRobotRole] = useState<RobotRole>('Striker');
  const [robotActuation, setRobotActuation] = useState('');
  const [robotOperator, setRobotOperator] = useState('');

  // Inline Edit Robot Unit state
  const [editingRobotId, setEditingRobotId] = useState<string | null>(null);
  const [editRobotNum, setEditRobotNum] = useState('');
  const [editRobotDesig, setEditRobotDesig] = useState('');
  const [editRobotRole, setEditRobotRole] = useState<RobotRole>('Striker');
  const [editRobotActuation, setEditRobotActuation] = useState('');
  const [editRobotOperator, setEditRobotOperator] = useState('');

  // Settings form
  const [metaName, setMetaName] = useState(state.meta.name);
  const [metaSeason, setMetaSeason] = useState(state.meta.season);

  useEffect(() => {
    setMetaName(state.meta.name);
    setMetaSeason(state.meta.season);
  }, [state.meta.name, state.meta.season]);

  const isAuthorizedAdmin = Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === AUTHORIZED_ADMIN_EMAIL.toLowerCase(),
  );

  const teamMap = useMemo(() => new Map(state.teams.map((t) => [t.id, t])), [state.teams]);

  const activeMatch = useMemo(
    () => state.matches.find((m) => m.id === selectedMatchId) ?? state.matches[0],
    [state.matches, selectedMatchId],
  );

  const activeTeam = useMemo(
    () => state.teams.find((t) => t.id === selectedTeamId) ?? state.teams[0],
    [state.teams, selectedTeamId],
  );

  useEffect(() => {
    if (activeMatch) {
      const home = activeMatch.homeTeamId ? teamMap.get(activeMatch.homeTeamId) : undefined;
      const away = activeMatch.awayTeamId ? teamMap.get(activeMatch.awayTeamId) : undefined;
      if (home?.robots[0]) setHomeScorerUnit(home.robots[0].unitNumber);
      if (away?.robots[0]) setAwayScorerUnit(away.robots[0].unitNumber);
      if (!eventTeamId || (eventTeamId !== activeMatch.homeTeamId && eventTeamId !== activeMatch.awayTeamId)) {
        setEventTeamId(activeMatch.homeTeamId ?? activeMatch.awayTeamId ?? '');
      }
    }
  }, [activeMatch?.id, activeMatch?.homeTeamId, activeMatch?.awayTeamId, teamMap, eventTeamId]);

  useEffect(() => {
    if (activeTeam) {
      setEditTeamName(activeTeam.name);
      setEditTeamCode(activeTeam.shortCode);
      setEditTeamDiv(activeTeam.division);
      setEditTeamSeed(activeTeam.seed);
      setEditTeamColor(activeTeam.accentColor);
      setEditingRobotId(null);
    }
  }, [activeTeam?.id, activeTeam?.name, activeTeam?.shortCode, activeTeam?.division, activeTeam?.seed, activeTeam?.accentColor]);

  // If the server booted fresh without local state and Firestore holds persisted/reset state, hydrate server
  useEffect(() => {
    if (!isAuthorizedAdmin || !untouchedBoot || hydratedRef.current || !user) return;
    hydratedRef.current = true;
    void (async () => {
      try {
        const fsState = await fetchFirestoreTournamentState();
        if (!fsState) return;
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/hydrate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ state: fsState }),
        });
        if (res.ok) {
          const data = (await res.json()) as { state: TournamentState; hydrated: boolean };
          if (data.hydrated) {
            onStateUpdated(data.state);
          }
        }
      } catch {
        // Ignore if offline or Firestore unreadable
      }
    })();
  }, [isAuthorizedAdmin, untouchedBoot, user, onStateUpdated]);

  function notify(type: 'ok' | 'err', text: string) {
    setFeedback({ type, text });
    window.setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }

  async function adminFetch<T>(
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
  ): Promise<T> {
    if (!user) throw new Error('Not authenticated');
    const token = await user.getIdToken();
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  async function handleSignIn() {
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      notify('ok', 'Signed in via Google Authentication.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    notify('ok', 'Signed out of administrative session.');
  }

  async function handleScoreChange(side: 'home' | 'away', delta: number) {
    if (!activeMatch) return;
    setBusy(true);
    try {
      const unitNumber = side === 'home' ? homeScorerUnit : awayScorerUnit;
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateMatchScore(state, activeMatch.id, {
          side,
          delta,
          robotNumber: unitNumber,
          eventType: 'goal',
        });
        onStateUpdated(res.state);
        await syncMatchToFirestore(res.match);
        for (const extra of res.extraChangedMatches) {
          await syncMatchToFirestore(extra);
        }
      } else {
        const data = await adminFetch<{ match: Match; state: TournamentState }>(
          `/api/admin/matches/${activeMatch.id}/score`,
          'POST',
          { side, delta, robotNumber: unitNumber, eventType: 'goal' },
        );
        onStateUpdated(data.state);
        void syncMatchToFirestore(data.match);
      }
      notify('ok', `Updated ${side === 'home' ? 'Home' : 'Away'} score and broadcast live.`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to update score');
    } finally {
      setBusy(false);
    }
  }

  async function handleFlipOverChange(side: 'home' | 'away', delta: number) {
    if (!activeMatch) return;
    setBusy(true);
    try {
      const unitNumber = side === 'home' ? homeScorerUnit : awayScorerUnit;
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateMatchFlipOver(state, activeMatch.id, {
          side,
          delta,
          robotNumber: unitNumber,
        });
        onStateUpdated(res.state);
        await syncMatchToFirestore(res.match);
      } else {
        const data = await adminFetch<{ match: Match; state: TournamentState }>(
          `/api/admin/matches/${activeMatch.id}/flip`,
          'POST',
          { side, delta, robotNumber: unitNumber },
        );
        onStateUpdated(data.state);
        void syncMatchToFirestore(data.match);
      }
      notify(
        'ok',
        `Updated ${side === 'home' ? 'Home' : 'Away'} Flip Over bonus (+1 pt each).`,
      );
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to update Flip Over count');
    } finally {
      setBusy(false);
    }
  }

  async function handlePatchMatch(matchId: string, patch: Partial<Match>) {
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutatePatchMatch(state, matchId, patch);
        onStateUpdated(res.state);
        await syncMatchToFirestore(res.match);
        for (const extra of res.extraChangedMatches) {
          await syncMatchToFirestore(extra);
        }
        if (res.metaChanged) {
          await syncTournamentMetaToFirestore(res.state.meta);
        }
      } else {
        const data = await adminFetch<{ match: Match; state: TournamentState }>(
          `/api/admin/matches/${matchId}`,
          'PATCH',
          patch,
        );
        onStateUpdated(data.state);
        await syncMatchToFirestore(data.match);
        if (data.match.nextMatchId) {
          const nextM = data.state.matches.find((m) => m.id === data.match.nextMatchId);
          if (nextM) await syncMatchToFirestore(nextM);
        }
      }
      notify('ok', 'Match state updated across all connected clients.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to update match');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCustomEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!activeMatch || !eventTeamId || !eventDesc.trim()) return;
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateAddMatchEvent(state, activeMatch.id, {
          teamId: eventTeamId,
          robotNumber: eventUnit || '00',
          type: eventType,
          description: eventDesc.trim(),
        });
        onStateUpdated(res.state);
        setEventDesc('');
        await syncMatchToFirestore(res.match);
      } else {
        const data = await adminFetch<{ match: Match; state: TournamentState }>(
          `/api/admin/matches/${activeMatch.id}/events`,
          'POST',
          {
            teamId: eventTeamId,
            robotNumber: eventUnit || '00',
            type: eventType,
            description: eventDesc.trim(),
          },
        );
        onStateUpdated(data.state);
        setEventDesc('');
        void syncMatchToFirestore(data.match);
      }
      notify('ok', 'Match timeline event logged.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to add event');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!activeMatch) return;
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateDeleteMatchEvent(state, activeMatch.id, eventId);
        onStateUpdated(res.state);
        await syncMatchToFirestore(res.match);
      } else {
        const data = await adminFetch<{ match: Match; state: TournamentState }>(
          `/api/admin/matches/${activeMatch.id}/events/${eventId}`,
          'DELETE',
        );
        onStateUpdated(data.state);
        void syncMatchToFirestore(data.match);
      }
      notify('ok', 'Event removed from timeline.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateMatch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const iso = newMatchTime.length === 16 ? `${newMatchTime}:00-08:00` : newMatchTime;
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateCreateMatch(state, {
          round: newMatchRound,
          arenaPitch: newMatchPitch,
          homeTeamId: newMatchHomeId || null,
          awayTeamId: newMatchAwayId || null,
          scheduledAt: iso,
        });
        onStateUpdated(res.state);
        setSelectedMatchId(res.match.id);
        await syncMatchToFirestore(res.match);
      } else {
        const data = await adminFetch<{ match: Match; state: TournamentState }>(
          '/api/admin/matches',
          'POST',
          {
            round: newMatchRound,
            arenaPitch: newMatchPitch,
            homeTeamId: newMatchHomeId || null,
            awayTeamId: newMatchAwayId || null,
            scheduledAt: iso,
          },
        );
        onStateUpdated(data.state);
        setSelectedMatchId(data.match.id);
        void syncMatchToFirestore(data.match);
      }
      notify('ok', 'New fixture added to tournament schedule.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to create match');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMatch(matchId: string) {
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateDeleteMatch(state, matchId);
        onStateUpdated(res.state);
        await deleteMatchFromFirestore(matchId);
        if (res.metaChanged) {
          await syncTournamentMetaToFirestore(res.state.meta);
        }
      } else {
        const data = await adminFetch<{ state: TournamentState }>(
          `/api/admin/matches/${matchId}`,
          'DELETE',
        );
        onStateUpdated(data.state);
        void deleteMatchFromFirestore(matchId);
      }
      notify('ok', 'Fixture removed.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to delete match');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamCode.trim()) return;
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateCreateTeam(state, {
          name: newTeamName.trim(),
          shortCode: newTeamCode.trim().toUpperCase(),
          division: newTeamDiv,
          accentColor: newTeamColor,
          robots: [],
        });
        onStateUpdated(res.state);
        setSelectedTeamId(res.team.id);
        setShowBulkImport(false);
        setNewTeamName('');
        setNewTeamCode('');
        await syncTeamToFirestore(res.team);
        notify('ok', `Registered team ${res.team.name}.`);
      } else {
        const data = await adminFetch<{ team: Team; state: TournamentState }>(
          '/api/admin/teams',
          'POST',
          {
            name: newTeamName.trim(),
            shortCode: newTeamCode.trim().toUpperCase(),
            division: newTeamDiv,
            accentColor: newTeamColor,
            robots: [],
          },
        );
        onStateUpdated(data.state);
        setSelectedTeamId(data.team.id);
        setShowBulkImport(false);
        setNewTeamName('');
        setNewTeamCode('');
        await syncTeamToFirestore(data.team);
        notify('ok', `Registered team ${data.team.name}.`);
      }
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateTeamDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeam || !editTeamName.trim() || !editTeamCode.trim()) return;
    setBusy(true);
    try {
      const patch = {
        name: editTeamName.trim(),
        shortCode: editTeamCode.trim().toUpperCase(),
        division: editTeamDiv.trim() || 'Group A',
        seed: Number(editTeamSeed) || activeTeam.seed,
        accentColor: editTeamColor,
      };
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateUpdateTeam(state, activeTeam.id, patch);
        onStateUpdated(res.state);
        await syncTeamToFirestore(res.team);
        notify('ok', `Saved changes for ${res.team.name}.`);
      } else {
        const data = await adminFetch<{ team: Team; state: TournamentState }>(
          `/api/admin/teams/${activeTeam.id}`,
          'PATCH',
          patch,
        );
        onStateUpdated(data.state);
        await syncTeamToFirestore(data.team);
        notify('ok', `Saved changes for ${data.team.name}.`);
      }
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to update team details');
    } finally {
      setBusy(false);
    }
  }

  function startEditingRobot(robot: RobotUnit) {
    setEditingRobotId(robot.id);
    setEditRobotNum(robot.unitNumber);
    setEditRobotDesig(robot.designation);
    setEditRobotRole(robot.role);
    setEditRobotActuation(robot.actuation);
    setEditRobotOperator(robot.operator);
  }

  async function handleUpdateRobot(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeam || !editingRobotId || !editRobotNum.trim() || !editRobotDesig.trim()) return;
    setBusy(true);
    try {
      const updatedRobots = activeTeam.robots.map((r) =>
        r.id === editingRobotId
          ? {
              ...r,
              unitNumber: editRobotNum.trim().slice(0, 4),
              designation: editRobotDesig.trim().slice(0, 60),
              role: editRobotRole,
              actuation: editRobotActuation.trim() || 'Standard Drive',
              operator: editRobotOperator.trim() || 'Unassigned',
            }
          : r,
      );
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateUpdateTeam(state, activeTeam.id, { robots: updatedRobots });
        onStateUpdated(res.state);
        setEditingRobotId(null);
        await syncTeamToFirestore(res.team);
      } else {
        const data = await adminFetch<{ team: Team; state: TournamentState }>(
          `/api/admin/teams/${activeTeam.id}`,
          'PATCH',
          { robots: updatedRobots },
        );
        onStateUpdated(data.state);
        setEditingRobotId(null);
        await syncTeamToFirestore(data.team);
      }
      notify('ok', `Updated robot unit on ${activeTeam.name}.`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to update robot unit');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddRobot(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeam || !robotNum.trim() || !robotDesig.trim()) return;
    setBusy(true);
    try {
      const newRobot: RobotUnit = {
        id: `r-${Date.now().toString(36)}`,
        unitNumber: robotNum.trim().slice(0, 4),
        designation: robotDesig.trim().slice(0, 60),
        role: robotRole,
        actuation: robotActuation.trim() || 'Standard Drive',
        operator: robotOperator.trim() || 'Unassigned',
      };
      const updatedRobots = [...activeTeam.robots, newRobot].slice(0, 10);
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateUpdateTeam(state, activeTeam.id, { robots: updatedRobots });
        onStateUpdated(res.state);
        setRobotNum('');
        setRobotDesig('');
        setRobotActuation('');
        setRobotOperator('');
        await syncTeamToFirestore(res.team);
      } else {
        const data = await adminFetch<{ team: Team; state: TournamentState }>(
          `/api/admin/teams/${activeTeam.id}`,
          'PATCH',
          { robots: updatedRobots },
        );
        onStateUpdated(data.state);
        setRobotNum('');
        setRobotDesig('');
        setRobotActuation('');
        setRobotOperator('');
        await syncTeamToFirestore(data.team);
      }
      notify('ok', `Added Unit #${newRobot.unitNumber} to ${activeTeam.name}.`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to add robot unit');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveRobot(robotId: string) {
    if (!activeTeam) return;
    setBusy(true);
    try {
      const updatedRobots = activeTeam.robots.filter((r) => r.id !== robotId);
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateUpdateTeam(state, activeTeam.id, { robots: updatedRobots });
        onStateUpdated(res.state);
        await syncTeamToFirestore(res.team);
      } else {
        const data = await adminFetch<{ team: Team; state: TournamentState }>(
          `/api/admin/teams/${activeTeam.id}`,
          'PATCH',
          { robots: updatedRobots },
        );
        onStateUpdated(data.state);
        await syncTeamToFirestore(data.team);
      }
      notify('ok', 'Robot unit removed from roster.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to remove robot');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTeam(teamId: string) {
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateDeleteTeam(state, teamId);
        onStateUpdated(res.state);
        await deleteTeamFromFirestore(teamId);
        for (const m of res.affectedMatches) {
          await syncMatchToFirestore(m);
        }
      } else {
        const data = await adminFetch<{ state: TournamentState }>(
          `/api/admin/teams/${teamId}`,
          'DELETE',
        );
        onStateUpdated(data.state);
        await deleteTeamFromFirestore(teamId);
      }
      notify('ok', 'Team deleted.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const nextState = mutateTournamentMeta(state, { name: metaName, season: metaSeason });
        onStateUpdated(nextState);
        await syncFullStateToFirestore(nextState);
      } else {
        const data = await adminFetch<{ state: TournamentState }>(
          '/api/admin/tournament',
          'PATCH',
          { name: metaName, season: metaSeason },
        );
        onStateUpdated(data.state);
        await syncFullStateToFirestore(data.state);
      }
      notify('ok', 'Tournament settings saved and synced to Firestore.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncCloud() {
    setBusy(true);
    try {
      await syncFullStateToFirestore(state);
      notify('ok', 'Full tournament state persisted to Firestore.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Cloud sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSeedBracketFromStandings() {
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const nextState = mutateSeedBracketFromStandings(state);
        onStateUpdated(nextState);
        await syncFullStateToFirestore(nextState);
      } else {
        const data = await adminFetch<{ state: TournamentState }>(
          '/api/admin/bracket/seed-from-standings',
          'POST',
        );
        onStateUpdated(data.state);
        await syncFullStateToFirestore(data.state);
      }
      notify(
        'ok',
        'Sudden-death bracket seeded from group standings (#1–#4 QF Bye, #5–#12 Play-In).',
      );
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to seed bracket');
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkImportTeams(drafts: BulkTeamDraft[]) {
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const res = mutateBulkCreateTeams(state, drafts);
        onStateUpdated(res.state);
        if (res.teams[0]) {
          setSelectedTeamId(res.teams[0].id);
        }
        setShowBulkImport(false);
        await syncFullStateToFirestore(res.state);
        notify(
          'ok',
          `Imported ${res.createdCount} team${res.createdCount === 1 ? '' : 's'} and synced to Firestore.`,
        );
      } else {
        const data = await adminFetch<{
          createdCount: number;
          teams: Team[];
          state: TournamentState;
        }>('/api/admin/teams/bulk', 'POST', { teams: drafts });
        onStateUpdated(data.state);
        if (data.teams[0]) {
          setSelectedTeamId(data.teams[0].id);
        }
        setShowBulkImport(false);
        await syncFullStateToFirestore(data.state);
        notify(
          'ok',
          `Imported ${data.createdCount} team${data.createdCount === 1 ? '' : 's'} and synced to Firestore.`,
        );
      }
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to bulk import teams');
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateTournamentSchedule() {
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const nextState = mutateGenerateTournamentSchedule(state);
        onStateUpdated(nextState);
        if (nextState.matches[0]) {
          setSelectedMatchId(nextState.matches[0].id);
        }
        await syncFullStateToFirestore(nextState);
        notify(
          'ok',
          `Generated ${nextState.matches.length} fixtures (Group Round-Robin + Sudden-Death Bracket).`,
        );
      } else {
        const data = await adminFetch<{ state: TournamentState }>(
          '/api/admin/schedule/generate-tournament',
          'POST',
        );
        onStateUpdated(data.state);
        if (data.state.matches[0]) {
          setSelectedMatchId(data.state.matches[0].id);
        }
        await syncFullStateToFirestore(data.state);
        notify(
          'ok',
          `Generated ${data.state.matches.length} fixtures (Group Round-Robin + Sudden-Death Bracket).`,
        );
      }
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetTournament() {
    setBusy(true);
    try {
      if (backendMode === 'firestore') {
        if (!isAuthorizedAdmin) throw new Error('Account not authorized');
        const nextState = mutateResetTournament(state, 'clear');
        onStateUpdated(nextState);
        setSelectedMatchId('');
        setSelectedTeamId('');
        setNewMatchHomeId('');
        setNewMatchAwayId('');
        setConfirmReset(false);
        setShowBulkImport(true);
        setActiveTab('teams');
        await syncFullStateToFirestore(nextState);
      } else {
        const data = await adminFetch<{ state: TournamentState }>('/api/admin/reset', 'POST', {
          mode: 'clear',
        });
        onStateUpdated(data.state);
        setSelectedMatchId('');
        setSelectedTeamId('');
        setNewMatchHomeId('');
        setNewMatchAwayId('');
        setConfirmReset(false);
        setShowBulkImport(true);
        setActiveTab('teams');
        await syncFullStateToFirestore(data.state);
      }
      notify(
        'ok',
        'Tournament reset. Enter your teams below via Bulk Add or Register New Team.',
      );
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to reset tournament');
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return (
      <div className="max-w-lg mx-auto my-16 bg-[#11151C] border border-white/10 rounded-xl p-8 text-center text-sm text-slate-400">
        Verifying authentication session...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto my-12 bg-[#11151C] border border-white/10 rounded-2xl p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-extrabold text-white">
            Tournament Director Sign In
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Access to live score tracking, match clock controls, and team roster editing is
            restricted to the authorised tournament administrator.
          </p>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-lg border text-xs ${
              feedback.type === 'err'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-[#C8F135]/10 border-[#C8F135]/30 text-[#C8F135]'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleSignIn}
            className="px-5 py-2.5 text-sm font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Signing in...' : 'Sign in with Google'}
          </button>
          <button
            type="button"
            onClick={onBackToPublic}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Return to Public View
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="max-w-lg mx-auto my-12 bg-[#11151C] border border-white/10 rounded-2xl p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-extrabold text-white">
            Access Restricted
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Signed in as <span className="font-mono text-white">{user.email}</span>. Score and
            bracket administration is restricted to{' '}
            <span className="font-mono text-[#C8F135]">{AUTHORIZED_ADMIN_EMAIL}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            Sign Out
          </button>
          <button
            type="button"
            onClick={onBackToPublic}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            View Public Broadcast
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header Strip */}
      <div className="bg-[#11151C] border border-white/10 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-[#C8F135]">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>Authenticated Director · {user.email}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
            Tournament Control Center
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!confirmReset ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Tournament</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleResetTournament}
                className="px-3.5 py-2 text-xs font-bold rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                Confirm Clear All Data
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmReset(false)}
                className="px-2.5 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={handleSyncCloud}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-white/15 bg-[#171C26] text-slate-200 hover:border-[#C8F135] transition-colors cursor-pointer disabled:opacity-50"
          >
            <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sync Firestore</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'err'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-[#C8F135]/10 border-[#C8F135]/30 text-[#C8F135]'
          }`}
        >
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Admin Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-[#11151C] border border-white/10 w-fit overflow-x-auto max-w-full">
        {(
          [
            { id: 'scoring', label: 'Live Scoring' },
            { id: 'matches', label: 'Matches & Bracket' },
            { id: 'teams', label: 'Teams & Rosters' },
            { id: 'settings', label: 'Settings' },
          ] as Array<{ id: AdminTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#C8F135] text-[#090B0E]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: LIVE SCORING */}
      {activeTab === 'scoring' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Match Selector */}
          <div className="lg:col-span-4 bg-[#11151C] border border-white/10 rounded-xl overflow-hidden divide-y divide-white/10">
            <div className="px-4 py-3 text-xs font-semibold text-slate-400">
              Select Fixture to Control
            </div>
            {state.matches.length === 0 ? (
              <div className="px-4 py-8 text-xs text-slate-500 text-center">
                No fixtures created yet.
              </div>
            ) : (
              state.matches.map((m) => {
                const home = m.homeTeamId ? teamMap.get(m.homeTeamId) : undefined;
                const away = m.awayTeamId ? teamMap.get(m.awayTeamId) : undefined;
                const isSelected = activeMatch?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMatchId(m.id)}
                    className={`w-full px-4 py-3 text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#171C26]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mb-1">
                      <span className="text-slate-400">
                        {m.round} · {m.arenaPitch}
                      </span>
                      <span
                        className={
                          m.status === 'live'
                            ? 'text-rose-400 font-bold'
                            : m.status === 'finished'
                              ? 'text-[#C8F135]'
                              : 'text-slate-400'
                        }
                      >
                        {m.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 font-display text-base font-bold text-white">
                      <span className="truncate">
                        {home?.shortCode ?? 'TBD'} vs {away?.shortCode ?? 'TBD'}
                      </span>
                      <span className="font-mono tabular-nums text-sm">
                        {m.homeScore} - {m.awayScore}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Match Control Console */}
          {!activeMatch && (
            <div className="lg:col-span-8 bg-[#11151C] border border-white/10 rounded-xl p-10 text-center space-y-4">
              <div className="font-display text-xl font-bold text-white">
                No Active Matches Scheduled
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Register or bulk import your teams in Teams &amp; Rosters, then generate or create fixtures in Matches &amp; Bracket.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkImport(true);
                    setActiveTab('teams');
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors cursor-pointer"
                >
                  Bulk Add Teams
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('matches')}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-white/15 text-slate-200 hover:border-[#C8F135] transition-colors cursor-pointer"
                >
                  Open Matches &amp; Bracket
                </button>
              </div>
            </div>
          )}
          {activeMatch && (
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-[#11151C] border border-white/10 rounded-xl p-6 space-y-6">
                {/* Status & Clock Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <div className="text-xs text-slate-400 font-mono">
                      {activeMatch.round} · {activeMatch.arenaPitch} ·{' '}
                      {formatScheduledDateTime(activeMatch.scheduledAt)}
                    </div>
                    <h2 className="font-display text-2xl font-bold text-white mt-1">
                      {activeMatch.homeTeamId
                        ? teamMap.get(activeMatch.homeTeamId)?.name
                        : 'TBD'}{' '}
                      vs{' '}
                      {activeMatch.awayTeamId
                        ? teamMap.get(activeMatch.awayTeamId)?.name
                        : 'TBD'}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || state.meta.activeMatchId === activeMatch.id}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          if (backendMode === 'firestore') {
                            if (!isAuthorizedAdmin) throw new Error('Account not authorized');
                            const nextState = mutateTournamentMeta(state, {
                              activeMatchId: activeMatch.id,
                            });
                            onStateUpdated(nextState);
                            await syncTournamentMetaToFirestore(nextState.meta);
                          } else {
                            const data = await adminFetch<{ state: TournamentState }>(
                              '/api/admin/tournament',
                              'PATCH',
                              { activeMatchId: activeMatch.id },
                            );
                            onStateUpdated(data.state);
                            void syncTournamentMetaToFirestore(data.state.meta);
                          }
                          notify('ok', 'Featured match updated on Live Arena.');
                        } catch (err) {
                          notify(
                            'err',
                            err instanceof Error ? err.message : 'Failed to feature match',
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/15 text-slate-200 hover:border-[#C8F135] transition-colors cursor-pointer disabled:opacity-45"
                    >
                      {state.meta.activeMatchId === activeMatch.id
                        ? 'Featured in Live Arena'
                        : 'Feature in Live Arena'}
                    </button>
                  </div>
                </div>

                {/* Status & Period Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-400">
                      Match Status
                    </label>
                    <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#090B0E] border border-white/10">
                      {(['scheduled', 'live', 'halftime', 'finished'] as MatchStatus[]).map(
                        (st) => (
                          <button
                            key={st}
                            type="button"
                            disabled={busy}
                            onClick={() => handlePatchMatch(activeMatch.id, { status: st })}
                            className={`py-2 text-xs font-semibold rounded-md capitalize transition-colors cursor-pointer ${
                              activeMatch.status === st
                                ? st === 'live'
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-[#C8F135] text-[#090B0E]'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {st}
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-400">
                      Match Clock ({formatMatchClock(activeMatch.clockSeconds)} /{' '}
                      {formatMatchClock(activeMatch.durationSeconds ?? 240)})
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handlePatchMatch(activeMatch.id, {
                            status: activeMatch.status === 'scheduled' ? 'live' : activeMatch.status,
                            clockRunning: !activeMatch.clockRunning,
                          })
                        }
                        className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          activeMatch.clockRunning
                            ? 'bg-amber-400 text-[#090B0E]'
                            : 'bg-[#C8F135] text-[#090B0E]'
                        }`}
                      >
                        {activeMatch.clockRunning ? (
                          <>
                            <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Pause Clock</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Start Clock</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handlePatchMatch(activeMatch.id, {
                            clockSeconds: 0,
                            clockRunning: false,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Reset</span>
                      </button>

                      <select
                        aria-label="Match period"
                        value={activeMatch.period}
                        onChange={(e) =>
                          handlePatchMatch(activeMatch.id, { period: e.target.value })
                        }
                        className="ml-auto px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white focus:outline-none focus:border-[#C8F135]"
                      >
                        <option value="Pre-Match">Pre-Match</option>
                        <option value="1st Half">1st Half</option>
                        <option value="Halftime">Halftime</option>
                        <option value="2nd Half">2nd Half</option>
                        <option value="Overtime">Overtime</option>
                        <option value="Full Time">Full Time</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Live Scoreboard Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {/* Home Team Score Box */}
                  {(['home', 'away'] as const).map((side) => {
                    const teamId =
                      side === 'home' ? activeMatch.homeTeamId : activeMatch.awayTeamId;
                    const team = teamId ? teamMap.get(teamId) : undefined;
                    const score =
                      side === 'home' ? activeMatch.homeScore : activeMatch.awayScore;
                    const flipOvers =
                      side === 'home'
                        ? (activeMatch.homeFlipOvers ?? 0)
                        : (activeMatch.awayFlipOvers ?? 0);
                    const unitVal = side === 'home' ? homeScorerUnit : awayScorerUnit;
                    const setUnitVal =
                      side === 'home' ? setHomeScorerUnit : setAwayScorerUnit;

                    return (
                      <div
                        key={side}
                        className="p-5 rounded-xl bg-[#090B0E] border border-white/10 space-y-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <TeamCrest
                              shortCode={team?.shortCode ?? 'TBD'}
                              accentColor={team?.accentColor ?? '#64748B'}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="text-[11px] text-slate-400 uppercase tracking-wider">
                                {side === 'home' ? 'Home Squad' : 'Away Squad'}
                              </div>
                              <div className="font-display text-xl font-bold text-white truncate">
                                {team?.name ?? 'TBD'}
                              </div>
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-4xl font-bold text-white">
                            {score}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`${side} scoring robot unit`}
                            value={unitVal}
                            onChange={(e) => setUnitVal(e.target.value)}
                            className="flex-1 px-2.5 py-2 text-xs rounded-lg bg-[#11151C] border border-white/10 text-slate-200 focus:outline-none focus:border-[#C8F135]"
                          >
                            {team?.robots.length ? (
                              team.robots.map((r) => (
                                <option key={r.id} value={r.unitNumber}>
                                  Unit #{r.unitNumber} · {r.designation}
                                </option>
                              ))
                            ) : (
                              <option value="07">Unit #07</option>
                            )}
                          </select>

                          <button
                            type="button"
                            disabled={busy || !team}
                            onClick={() => handleScoreChange(side, 1)}
                            className="px-4 py-2 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors disabled:opacity-40 cursor-pointer"
                          >
                            +1 Goal
                          </button>

                          <button
                            type="button"
                            disabled={busy || score <= 0}
                            onClick={() => handleScoreChange(side, -1)}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-white/15 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                          >
                            -1
                          </button>
                        </div>

                        {/* Flip Over Bonus Controls */}
                        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                          <div className="text-xs text-slate-300 font-mono tabular-nums">
                            Flip Overs:{' '}
                            <span className="font-bold text-sky-300">{flipOvers}</span>{' '}
                            <span className="text-slate-500">(+{flipOvers} bonus pt)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy || !team}
                              onClick={() => handleFlipOverChange(side, 1)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-sky-400/15 border border-sky-400/35 text-sky-300 hover:bg-sky-400/25 transition-colors disabled:opacity-40 cursor-pointer"
                            >
                              +1 Flip Over
                            </button>
                            <button
                              type="button"
                              disabled={busy || flipOvers <= 0}
                              onClick={() => handleFlipOverChange(side, -1)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-white/15 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                            >
                              -1
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Sudden-Death Knockout Winner Selection (for tied knockout matches) */}
                {activeMatch.round !== 'Group' &&
                  activeMatch.homeTeamId &&
                  activeMatch.awayTeamId && (
                    <div className="p-4 rounded-xl bg-[#090B0E] border border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-white">
                          Sudden-Death Bracket Advancement ({activeMatch.round})
                        </div>
                        <div className="text-[11px] text-slate-400">
                          When a knockout match finishes tied, select the sudden-death winner to advance.
                        </div>
                      </div>
                      <select
                        aria-label="Sudden-death advancing winner"
                        value={activeMatch.winnerTeamId ?? ''}
                        disabled={busy}
                        onChange={(e) =>
                          handlePatchMatch(activeMatch.id, {
                            winnerTeamId: e.target.value || null,
                          })
                        }
                        className="px-3 py-2 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white focus:outline-none focus:border-[#C8F135]"
                      >
                        <option value="">Auto (By Higher Score)</option>
                        <option value={activeMatch.homeTeamId}>
                          Advance: {teamMap.get(activeMatch.homeTeamId)?.name ?? 'Home'}
                        </option>
                        <option value={activeMatch.awayTeamId}>
                          Advance: {teamMap.get(activeMatch.awayTeamId)?.name ?? 'Away'}
                        </option>
                      </select>
                    </div>
                  )}

                {/* Log Custom Event */}
                <form
                  onSubmit={handleAddCustomEvent}
                  className="pt-4 border-t border-white/10 space-y-3"
                >
                  <div className="text-xs font-semibold text-slate-300">
                    Log Match Event (Flip Over, Penalty, Card, Timeout)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <select
                      aria-label="Event team"
                      value={eventTeamId}
                      onChange={(e) => setEventTeamId(e.target.value)}
                      className="sm:col-span-3 px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                    >
                      {activeMatch.homeTeamId && (
                        <option value={activeMatch.homeTeamId}>
                          {teamMap.get(activeMatch.homeTeamId)?.shortCode ?? 'Home'}
                        </option>
                      )}
                      {activeMatch.awayTeamId && (
                        <option value={activeMatch.awayTeamId}>
                          {teamMap.get(activeMatch.awayTeamId)?.shortCode ?? 'Away'}
                        </option>
                      )}
                    </select>
                    <select
                      aria-label="Event type"
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value as MatchEventType)}
                      className="sm:col-span-3 px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                    >
                      <option value="goal">Goal</option>
                      <option value="flip_over">Flip Over (+1 Bonus)</option>
                      <option value="penalty">Penalty</option>
                      <option value="card_yellow">Yellow Card</option>
                      <option value="timeout">Tech Timeout</option>
                    </select>
                    <input
                      type="text"
                      value={eventUnit}
                      onChange={(e) => setEventUnit(e.target.value)}
                      placeholder="Unit #"
                      maxLength={6}
                      className="sm:col-span-2 px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                    />
                    <input
                      type="text"
                      value={eventDesc}
                      onChange={(e) => setEventDesc(e.target.value)}
                      placeholder="Event description..."
                      className="sm:col-span-4 px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busy || !eventDesc.trim() || !eventTeamId}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      Add Timeline Event
                    </button>
                  </div>
                </form>

                {/* Existing Match Events */}
                {activeMatch.events.length > 0 && (
                  <div className="pt-3 border-t border-white/10 space-y-2">
                    <div className="text-xs font-semibold text-slate-400">
                      Recorded Events
                    </div>
                    <div className="divide-y divide-white/10 border border-white/10 rounded-lg overflow-hidden">
                      {[...activeMatch.events].reverse().map((ev) => (
                        <div
                          key={ev.id}
                          className="px-3.5 py-2.5 bg-[#090B0E] flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono font-bold text-[#C8F135]">
                              {ev.minute}&apos;
                            </span>
                            <span className="text-slate-300 truncate">
                              {teamMap.get(ev.teamId)?.shortCode ?? 'TEAM'} · Unit #{ev.robotNumber} —{' '}
                              {ev.description}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDeleteEvent(ev.id)}
                            aria-label="Delete event"
                            className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MATCHES & BRACKET */}
      {activeTab === 'matches' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateMatch}
            className="lg:col-span-4 bg-[#11151C] border border-white/10 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-bold text-white">
              Schedule New Match
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Round</label>
                <select
                  value={newMatchRound}
                  onChange={(e) => setNewMatchRound(e.target.value as MatchRound)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
                >
                  <option value="Group">Group</option>
                  <option value="Play-In">Play-In (Sudden Death R1)</option>
                  <option value="Quarterfinal">Quarterfinal</option>
                  <option value="Semifinal">Semifinal</option>
                  <option value="Third Place">Third Place</option>
                  <option value="Final">Final</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Home Team</label>
                <select
                  value={newMatchHomeId}
                  onChange={(e) => setNewMatchHomeId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
                >
                  <option value="">TBD</option>
                  {state.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Away Team</label>
                <select
                  value={newMatchAwayId}
                  onChange={(e) => setNewMatchAwayId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
                >
                  <option value="">TBD</option>
                  {state.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Arena Pitch</label>
                <input
                  type="text"
                  value={newMatchPitch}
                  onChange={(e) => setNewMatchPitch(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Scheduled Time</label>
                <input
                  type="datetime-local"
                  value={newMatchTime}
                  onChange={(e) => setNewMatchTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Create Match</span>
            </button>
          </form>

          <div className="lg:col-span-8 space-y-4">
            <div className="bg-[#11151C] border border-white/10 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="font-display text-lg font-bold text-white">
                  Tournament Schedule &amp; Sudden-Death Bracket
                </div>
                <p className="text-xs text-slate-400">
                  Generate Group A/B/C round-robin games + 12-team seeded bracket, or re-seed the bracket from current group standings.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busy || state.teams.length < 2}
                  onClick={handleGenerateTournamentSchedule}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors disabled:opacity-45 cursor-pointer"
                >
                  Generate Round-Robin &amp; Bracket
                </button>
                <button
                  type="button"
                  disabled={busy || state.matches.length === 0}
                  onClick={handleSeedBracketFromStandings}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-white/15 bg-[#171C26] text-slate-200 hover:border-[#C8F135] transition-colors disabled:opacity-45 cursor-pointer"
                >
                  Re-Seed Bracket Now
                </button>
              </div>
            </div>

            <div className="bg-[#11151C] border border-white/10 rounded-xl overflow-hidden divide-y divide-white/10">
              <div className="px-5 py-3.5 text-xs font-semibold text-slate-400">
                Edit Match Assignments &amp; Status ({state.matches.length} Fixtures)
              </div>
            {state.matches.map((m) => (
              <div
                key={m.id}
                className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
              >
                <div className="sm:col-span-3 text-xs">
                  <div className="font-semibold text-white">{m.round}</div>
                  <div className="text-slate-400 font-mono">{m.arenaPitch}</div>
                </div>
                <div className="sm:col-span-4">
                  <select
                    aria-label={`Home team for ${m.id}`}
                    value={m.homeTeamId ?? ''}
                    onChange={(e) =>
                      handlePatchMatch(m.id, { homeTeamId: e.target.value || null })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                  >
                    <option value="">TBD (Home)</option>
                    {state.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <select
                    aria-label={`Away team for ${m.id}`}
                    value={m.awayTeamId ?? ''}
                    onChange={(e) =>
                      handlePatchMatch(m.id, { awayTeamId: e.target.value || null })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                  >
                    <option value="">TBD (Away)</option>
                    {state.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDeleteMatch(m.id)}
                    aria-label={`Delete match ${m.id}`}
                    className="p-2 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TEAMS & ROSTERS */}
      {activeTab === 'teams' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Register New Team + Team List */}
          <div className="lg:col-span-4 space-y-6">
            <form
              onSubmit={handleCreateTeam}
              className="bg-[#11151C] border border-white/10 rounded-xl p-5 space-y-3"
            >
              <h2 className="font-display text-xl font-bold text-white">
                Register New Team
              </h2>
              <input
                type="text"
                required
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Team Name (e.g. Wellington Pulse)"
                className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  maxLength={5}
                  value={newTeamCode}
                  onChange={(e) => setNewTeamCode(e.target.value.toUpperCase())}
                  placeholder="Code (WLG)"
                  className="px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white font-mono"
                />
                <input
                  type="color"
                  aria-label="Team crest accent color"
                  value={newTeamColor}
                  onChange={(e) => setNewTeamColor(e.target.value)}
                  className="w-full h-10 p-1 rounded-lg bg-[#090B0E] border border-white/15 cursor-pointer"
                />
              </div>
              <select
                aria-label="New team group"
                value={newTeamDiv}
                onChange={(e) => setNewTeamDiv(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
              >
                <option value="Group A">Group A</option>
                <option value="Group B">Group B</option>
                <option value="Group C">Group C</option>
              </select>
              <button
                type="submit"
                disabled={busy}
                className="w-full px-4 py-2 text-sm font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors cursor-pointer"
              >
                Add Team
              </button>
            </form>

            <div className="bg-[#11151C] border border-white/10 rounded-xl overflow-hidden divide-y divide-white/10">
              {state.teams.length === 0 ? (
                <div className="px-4 py-8 text-xs text-slate-500 text-center">
                  0 teams registered. Use the form above to add your squads.
                </div>
              ) : (
                state.teams.map((t) => (
                  <div
                    key={t.id}
                    className={`px-4 py-3 flex items-center justify-between gap-2 ${
                      activeTeam?.id === t.id ? 'bg-[#171C26]' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedTeamId(t.id)}
                      className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <TeamCrest
                        shortCode={t.shortCode}
                        accentColor={t.accentColor}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="font-display text-base font-bold text-white truncate">
                          {t.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate">
                          {t.division} · {t.robots.length} robot{t.robots.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDeleteTeam(t.id)}
                      aria-label={`Delete ${t.name}`}
                      className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Selected Team Editor & Bulk Team Importer */}
          <div className="lg:col-span-8 space-y-6">
            {state.teams.length > 0 && (
              <div className="bg-[#11151C] border border-white/10 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-300">
                  <span className="font-semibold text-white">{state.teams.length} Teams Registered</span>
                  {' · '}Select any team on the left to edit its name, group, or robots, or bulk add more teams.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkImport((prev) => !prev)}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      showBulkImport
                        ? 'border border-white/15 text-slate-300 hover:text-white'
                        : 'bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863]'
                    }`}
                  >
                    {showBulkImport ? 'Edit Selected Team' : 'Bulk Add Teams'}
                  </button>
                  {state.teams.length >= 2 && state.matches.length === 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        await handleGenerateTournamentSchedule();
                        setActiveTab('matches');
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-[#C8F135]/50 text-[#C8F135] hover:bg-[#C8F135]/10 transition-colors cursor-pointer"
                    >
                      Generate Fixtures &amp; Bracket
                    </button>
                  )}
                </div>
              </div>
            )}

            {showBulkImport || !activeTeam ? (
              <BulkTeamImporter
                busy={busy}
                existingTeamCount={state.teams.length}
                onImport={handleBulkImportTeams}
                onClose={() => setShowBulkImport(false)}
              />
            ) : (
            <div className="bg-[#11151C] border border-white/10 rounded-xl p-6 space-y-6">
              <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                <TeamCrest
                  shortCode={activeTeam.shortCode}
                  accentColor={activeTeam.accentColor}
                  size="lg"
                />
                <div>
                  <h3 className="font-display text-2xl font-bold text-white">
                    {activeTeam.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Seed #{activeTeam.seed} · {activeTeam.division} ·{' '}
                    {activeTeam.robots.length} Robots Assigned
                  </p>
                </div>
              </div>

              {/* Edit Team Name & Metadata */}
              <form
                onSubmit={handleUpdateTeamDetails}
                className="p-4 rounded-xl bg-[#090B0E] border border-white/10 space-y-3"
              >
                <div className="text-xs font-semibold text-slate-300">
                  Edit Team Name & Profile
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-400 mb-1">Team Name</label>
                    <input
                      type="text"
                      required
                      value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">Code</label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      value={editTeamCode}
                      onChange={(e) => setEditTeamCode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">Group</label>
                    <select
                      aria-label="Edit team group"
                      value={editTeamDiv}
                      onChange={(e) => setEditTeamDiv(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white"
                    >
                      <option value="Group A">Group A</option>
                      <option value="Group B">Group B</option>
                      <option value="Group C">Group C</option>
                      {editTeamDiv &&
                        !['Group A', 'Group B', 'Group C'].includes(editTeamDiv) && (
                          <option value={editTeamDiv}>{editTeamDiv}</option>
                        )}
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] text-slate-400 mb-1">Seed</label>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={editTeamSeed}
                      onChange={(e) => setEditTeamSeed(Number(e.target.value))}
                      className="w-full px-2.5 py-2 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] text-slate-400 mb-1">Color</label>
                    <input
                      type="color"
                      aria-label="Edit team accent color"
                      value={editTeamColor}
                      onChange={(e) => setEditTeamColor(e.target.value)}
                      className="w-full h-9 p-1 rounded-lg bg-[#11151C] border border-white/15 cursor-pointer"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </form>

              <div className="divide-y divide-white/10 border border-white/10 rounded-lg overflow-hidden">
                {activeTeam.robots.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No robot units assigned to this squad yet.
                  </div>
                ) : (
                  activeTeam.robots.map((r) =>
                    editingRobotId === r.id ? (
                      <form
                        key={r.id}
                        onSubmit={handleUpdateRobot}
                        className="p-4 bg-[#090B0E] space-y-2.5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <input
                            type="text"
                            required
                            maxLength={4}
                            value={editRobotNum}
                            onChange={(e) => setEditRobotNum(e.target.value)}
                            placeholder="Unit #"
                            className="sm:col-span-2 px-2.5 py-1.5 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white font-mono"
                          />
                          <input
                            type="text"
                            required
                            value={editRobotDesig}
                            onChange={(e) => setEditRobotDesig(e.target.value)}
                            placeholder="Robot Designation"
                            className="sm:col-span-4 px-2.5 py-1.5 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white"
                          />
                          <select
                            aria-label="Edit robot role"
                            value={editRobotRole}
                            onChange={(e) => setEditRobotRole(e.target.value as RobotRole)}
                            className="sm:col-span-2 px-2 py-1.5 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white"
                          >
                            <option value="Striker">Striker</option>
                            <option value="Midfielder">Midfielder</option>
                            <option value="Defender">Defender</option>
                            <option value="Keeper">Keeper</option>
                          </select>
                          <input
                            type="text"
                            value={editRobotActuation}
                            onChange={(e) => setEditRobotActuation(e.target.value)}
                            placeholder="Actuation"
                            className="sm:col-span-2 px-2.5 py-1.5 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white"
                          />
                          <input
                            type="text"
                            value={editRobotOperator}
                            onChange={(e) => setEditRobotOperator(e.target.value)}
                            placeholder="Operator"
                            className="sm:col-span-2 px-2.5 py-1.5 text-xs rounded-lg bg-[#11151C] border border-white/15 text-white"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingRobotId(null)}
                            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={busy}
                            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] cursor-pointer"
                          >
                            Save Robot
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div
                        key={r.id}
                        className="px-4 py-3 bg-[#090B0E] flex items-center justify-between gap-4 text-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono font-bold text-[#C8F135]">
                            #{r.unitNumber}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate">
                              {r.designation}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {r.role} · {r.actuation} · Pilot: {r.operator}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startEditingRobot(r)}
                            aria-label={`Edit unit ${r.unitNumber}`}
                            className="p-1.5 text-slate-400 hover:text-[#C8F135] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRemoveRobot(r.id)}
                            aria-label={`Remove unit ${r.unitNumber}`}
                            className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>

              <form onSubmit={handleAddRobot} className="space-y-3 pt-2">
                <div className="text-xs font-semibold text-slate-300">
                  Add Robot Unit to {activeTeam.shortCode}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={robotNum}
                    onChange={(e) => setRobotNum(e.target.value)}
                    placeholder="Unit #"
                    className="sm:col-span-2 px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                  />
                  <input
                    type="text"
                    required
                    value={robotDesig}
                    onChange={(e) => setRobotDesig(e.target.value)}
                    placeholder="Robot Designation"
                    className="sm:col-span-4 px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                  />
                  <select
                    aria-label="Robot role"
                    value={robotRole}
                    onChange={(e) => setRobotRole(e.target.value as RobotRole)}
                    className="sm:col-span-2 px-2.5 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                  >
                    <option value="Striker">Striker</option>
                    <option value="Midfielder">Midfielder</option>
                    <option value="Defender">Defender</option>
                    <option value="Keeper">Keeper</option>
                  </select>
                  <input
                    type="text"
                    value={robotActuation}
                    onChange={(e) => setRobotActuation(e.target.value)}
                    placeholder="Actuation / Drive"
                    className="sm:col-span-2 px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                  />
                  <input
                    type="text"
                    value={robotOperator}
                    onChange={(e) => setRobotOperator(e.target.value)}
                    placeholder="Operator"
                    className="sm:col-span-2 px-3 py-2 text-xs rounded-lg bg-[#090B0E] border border-white/15 text-white"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy || activeTeam.robots.length >= 10}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Add Unit to Roster
                  </button>
                </div>
              </form>
            </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-6">
          <form
            onSubmit={handleSaveSettings}
            className="bg-[#11151C] border border-white/10 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-bold text-white">
              Tournament Configuration
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Tournament Title
                </label>
                <input
                  type="text"
                  required
                  value={metaName}
                  onChange={(e) => setMetaName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Season / Subtitle
                </label>
                <input
                  type="text"
                  required
                  value={metaSeason}
                  onChange={(e) => setMetaSeason(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#090B0E] border border-white/15 text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 text-sm font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors cursor-pointer"
            >
              Save & Broadcast Settings
            </button>
          </form>

          <div className="bg-[#11151C] border border-white/10 rounded-xl p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-white">
              Reset Tournament (Clear Demo Data)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Permanently remove all current teams, robot rosters, scores, and matches so demo data
              is no longer loaded on the site, leaving a clean slate to enter your real tournament.
            </p>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                Reset Tournament
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResetTournament}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                >
                  Confirm Clear All Data
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
