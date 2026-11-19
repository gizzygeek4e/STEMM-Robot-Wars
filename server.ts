import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { WebSocket, WebSocketServer } from 'ws';
import { createEmptyTournament, createSeedTournament } from './src/data/seedTournament.ts';
import { applySeededSuddenDeathBracket } from './src/utils/bracketSeeding.ts';
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
  WSServerMessage,
} from './src/types/tournament.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = 'hermanf@gisboyshigh.net';
const DATA_DIR = path.resolve(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'tournament-state.json');

// Load Firebase projectId for ID token verification (no IAM required)
const firebaseConfigRaw = fs.readFileSync(
  path.resolve(__dirname, 'firebase-applet-config.json'),
  'utf-8',
);
const firebaseConfig = JSON.parse(firebaseConfigRaw) as { projectId?: string };

const adminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp(
        firebaseConfig.projectId ? { projectId: firebaseConfig.projectId } : undefined,
      );
const adminAuth = getAuth(adminApp);

let untouchedBoot = false;

function loadState(): TournamentState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as TournamentState;
      if (
        parsed &&
        parsed.meta &&
        (parsed.meta.rulesVersion ?? 1) >= 3 &&
        Array.isArray(parsed.teams) &&
        Array.isArray(parsed.matches)
      ) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load tournament state from disk, seeding fresh:', err);
  }
  untouchedBoot = true;
  const seeded = createSeedTournament();
  saveState(seeded);
  return seeded;
}

function saveState(nextState: TournamentState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(nextState, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err) {
    console.error('Failed to persist tournament state:', err);
  }
}

let state: TournamentState = loadState();

const app = express();
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(message: WSServerMessage): void {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastFullState(): void {
  untouchedBoot = false;
  state.meta.updatedAt = Date.now();
  saveState(state);
  broadcast({
    type: 'state:sync',
    payload: state,
    serverTime: Date.now(),
  });
}

function propagateBracketAdvancement(match: Match): void {
  if (match.status !== 'finished') return;

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
    const nextMatch = state.matches.find((m) => m.id === match.nextMatchId);
    if (nextMatch) {
      if (match.nextMatchSide === 'home') {
        nextMatch.homeTeamId = winnerId;
      } else {
        nextMatch.awayTeamId = winnerId;
      }
    }
  }

  // Semifinal losers feed Third Place match if present
  if (match.round === 'Semifinal' && loserId) {
    const tpMatch = state.matches.find((m) => m.round === 'Third Place');
    if (tpMatch) {
      if (match.bracketSlot === 1) {
        tpMatch.homeTeamId = loserId;
      } else if (match.bracketSlot === 2) {
        tpMatch.awayTeamId = loserId;
      }
    }
  }
}

// Authoritative 1-second clock tick for active live matches
setInterval(() => {
  const now = Date.now();
  const updates: Array<{
    id: string;
    clockSeconds: number;
    clockRunning: boolean;
    clockUpdatedAt: number;
  }> = [];

  for (const match of state.matches) {
    if (match.status === 'live' && match.clockRunning) {
      const maxDuration = match.durationSeconds || 240;
      const nextSeconds = Math.min(maxDuration, match.clockSeconds + 1);
      match.clockSeconds = nextSeconds;
      if (nextSeconds >= maxDuration) {
        match.clockRunning = false;
      }
      match.clockUpdatedAt = now;
      updates.push({
        id: match.id,
        clockSeconds: match.clockSeconds,
        clockRunning: match.clockRunning,
        clockUpdatedAt: match.clockUpdatedAt,
      });
    }
  }

  if (updates.length > 0) {
    broadcast({
      type: 'clock:tick',
      payload: updates,
      serverTime: now,
    });
  }
}, 1000);

// Persist periodic clock snapshots every 10s so restarts stay closely aligned
setInterval(() => {
  if (state.matches.some((m) => m.status === 'live' && m.clockRunning)) {
    saveState(state);
  }
}, 10000);

wss.on('connection', (ws) => {
  const initMsg: WSServerMessage = {
    type: 'state:init',
    payload: state,
    serverTime: Date.now(),
    connectedClients: wss.clients.size,
  };
  ws.send(JSON.stringify(initMsg));

  broadcast({
    type: 'presence:count',
    payload: { connectedClients: wss.clients.size },
  });

  ws.on('close', () => {
    broadcast({
      type: 'presence:count',
      payload: { connectedClients: wss.clients.size },
    });
  });

  ws.on('error', (err) => {
    console.error('WebSocket client error:', err);
  });
});

interface AuthenticatedRequest extends express.Request {
  adminEmail?: string;
}

async function requireAdmin(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Empty ID token' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email_verified || decoded.email?.toLowerCase() !== ADMIN_EMAIL) {
      res.status(403).json({ error: 'Account is not authorized for tournament administration' });
      return;
    }
    req.adminEmail = decoded.email;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
  }
}

// Public endpoints
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, connectedClients: wss.clients.size, serverTime: Date.now() });
});

app.get('/api/tournament', (_req, res) => {
  res.json({
    state,
    serverTime: Date.now(),
    connectedClients: wss.clients.size,
    untouchedBoot,
  });
});

// Admin endpoints
app.get('/api/admin/verify', requireAdmin, (req: AuthenticatedRequest, res) => {
  res.json({ authorized: true, email: req.adminEmail });
});

app.patch('/api/admin/tournament', requireAdmin, (req, res) => {
  const { name, season, activeMatchId } = req.body as {
    name?: string;
    season?: string;
    activeMatchId?: string | null;
  };
  if (typeof name === 'string' && name.trim().length >= 2) {
    state.meta.name = name.trim().slice(0, 120);
  }
  if (typeof season === 'string' && season.trim().length >= 2) {
    state.meta.season = season.trim().slice(0, 120);
  }
  if (activeMatchId !== undefined) {
    state.meta.activeMatchId = activeMatchId;
  }
  broadcastFullState();
  res.json({ state });
});

app.post('/api/admin/matches/:id/score', requireAdmin, (req, res) => {
  const match = state.matches.find((m) => m.id === req.params.id);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  const { side, delta, robotNumber, eventType, description } = req.body as {
    side: 'home' | 'away';
    delta: number;
    robotNumber?: string;
    eventType?: MatchEventType;
    description?: string;
  };

  if (side !== 'home' && side !== 'away') {
    res.status(400).json({ error: 'Invalid side' });
    return;
  }

  const step = Number.isFinite(delta) ? Math.trunc(delta) : 1;
  if (side === 'home') {
    match.homeScore = Math.max(0, Math.min(999, match.homeScore + step));
  } else {
    match.awayScore = Math.max(0, Math.min(999, match.awayScore + step));
  }

  const teamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
  if (step > 0 && teamId) {
    const minute = Math.max(1, Math.ceil(match.clockSeconds / 60));
    const unit = (robotNumber || '07').trim().slice(0, 8);
    const ev: MatchEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      minute,
      teamId,
      robotNumber: unit,
      type: eventType || 'goal',
      description:
        (description && description.trim()) || `Goal scored by Unit #${unit}`,
      timestamp: Date.now(),
    };
    match.events = [...match.events, ev].slice(-50);
  }

  if (match.status === 'finished') {
    propagateBracketAdvancement(match);
  }

  broadcastFullState();
  res.json({ match, state });
});

app.post('/api/admin/matches/:id/flip', requireAdmin, (req, res) => {
  const match = state.matches.find((m) => m.id === req.params.id);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  const { side, delta, robotNumber } = req.body as {
    side: 'home' | 'away';
    delta: number;
    robotNumber?: string;
  };

  if (side !== 'home' && side !== 'away') {
    res.status(400).json({ error: 'Invalid side' });
    return;
  }

  const step = Number.isFinite(delta) ? Math.trunc(delta) : 1;
  const prevFlipOvers = side === 'home' ? (match.homeFlipOvers ?? 0) : (match.awayFlipOvers ?? 0);
  const nextFlipOvers = Math.max(0, Math.min(999, prevFlipOvers + step));
  const appliedDelta = nextFlipOvers - prevFlipOvers;

  if (side === 'home') {
    match.homeFlipOvers = nextFlipOvers;
    match.homeScore = Math.max(0, Math.min(999, match.homeScore + appliedDelta));
  } else {
    match.awayFlipOvers = nextFlipOvers;
    match.awayScore = Math.max(0, Math.min(999, match.awayScore + appliedDelta));
  }

  const teamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
  if (appliedDelta > 0 && teamId) {
    const minute = Math.max(1, Math.ceil(match.clockSeconds / 60));
    const unit = (robotNumber || '07').trim().slice(0, 8);
    const ev: MatchEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      minute,
      teamId,
      robotNumber: unit,
      type: 'flip_over',
      description: `Flip Over bonus (+1 pt) by Unit #${unit}`,
      timestamp: Date.now(),
    };
    match.events = [...match.events, ev].slice(-50);
  }

  if (match.status === 'finished') {
    propagateBracketAdvancement(match);
  }

  broadcastFullState();
  res.json({ match, state });
});

app.post('/api/admin/matches/:id/events', requireAdmin, (req, res) => {
  const match = state.matches.find((m) => m.id === req.params.id);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  const { teamId, robotNumber, type, description } = req.body as {
    teamId: string;
    robotNumber: string;
    type: MatchEventType;
    description: string;
  };

  if (!teamId || !description?.trim()) {
    res.status(400).json({ error: 'teamId and description are required' });
    return;
  }

  const ev: MatchEvent = {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    minute: Math.max(1, Math.ceil(match.clockSeconds / 60)),
    teamId,
    robotNumber: (robotNumber || '00').trim().slice(0, 8),
    type: type || 'goal',
    description: description.trim().slice(0, 140),
    timestamp: Date.now(),
  };

  match.events = [...match.events, ev].slice(-50);
  broadcastFullState();
  res.json({ match, state });
});

app.delete('/api/admin/matches/:id/events/:eventId', requireAdmin, (req, res) => {
  const match = state.matches.find((m) => m.id === req.params.id);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }
  match.events = match.events.filter((e) => e.id !== req.params.eventId);
  broadcastFullState();
  res.json({ match, state });
});

app.patch('/api/admin/matches/:id', requireAdmin, (req, res) => {
  const match = state.matches.find((m) => m.id === req.params.id);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  const body = req.body as Partial<{
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
  }>;

  if (body.status && ['scheduled', 'live', 'halftime', 'finished'].includes(body.status)) {
    match.status = body.status;
    if (body.status === 'live') {
      state.meta.activeMatchId = match.id;
      if (match.period === 'Pre-Match' || match.period === 'Full Time') {
        match.period = '1st Half';
      } else if (match.period === 'Halftime') {
        match.period = '2nd Half';
      }
    } else if (body.status === 'halftime') {
      match.clockRunning = false;
      match.period = 'Halftime';
    } else if (body.status === 'finished') {
      match.clockRunning = false;
      match.period = 'Full Time';
    } else if (body.status === 'scheduled') {
      match.clockRunning = false;
      match.period = 'Pre-Match';
    }
  }

  if (typeof body.period === 'string' && body.period.trim()) {
    match.period = body.period.trim().slice(0, 40);
  }
  if (typeof body.clockSeconds === 'number' && Number.isFinite(body.clockSeconds)) {
    match.clockSeconds = Math.max(0, Math.min(7200, Math.trunc(body.clockSeconds)));
    match.clockUpdatedAt = Date.now();
  }
  if (typeof body.clockRunning === 'boolean') {
    match.clockRunning = body.clockRunning;
    match.clockUpdatedAt = Date.now();
  }
  if (body.homeTeamId !== undefined) match.homeTeamId = body.homeTeamId || null;
  if (body.awayTeamId !== undefined) match.awayTeamId = body.awayTeamId || null;
  if (typeof body.homeScore === 'number' && Number.isFinite(body.homeScore)) {
    match.homeScore = Math.max(0, Math.min(999, Math.trunc(body.homeScore)));
  }
  if (typeof body.awayScore === 'number' && Number.isFinite(body.awayScore)) {
    match.awayScore = Math.max(0, Math.min(999, Math.trunc(body.awayScore)));
  }
  if (typeof body.homeFlipOvers === 'number' && Number.isFinite(body.homeFlipOvers)) {
    match.homeFlipOvers = Math.max(0, Math.min(999, Math.trunc(body.homeFlipOvers)));
  }
  if (typeof body.awayFlipOvers === 'number' && Number.isFinite(body.awayFlipOvers)) {
    match.awayFlipOvers = Math.max(0, Math.min(999, Math.trunc(body.awayFlipOvers)));
  }
  if (typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds)) {
    match.durationSeconds = Math.max(60, Math.min(7200, Math.trunc(body.durationSeconds)));
  }
  if (typeof body.arenaPitch === 'string' && body.arenaPitch.trim()) {
    match.arenaPitch = body.arenaPitch.trim().slice(0, 60);
  }
  if (typeof body.scheduledAt === 'string' && body.scheduledAt.trim()) {
    match.scheduledAt = body.scheduledAt.trim().slice(0, 64);
  }
  if (
    body.round &&
    ['Group', 'Play-In', 'Quarterfinal', 'Semifinal', 'Third Place', 'Final'].includes(body.round)
  ) {
    match.round = body.round;
  }
  if (body.winnerTeamId !== undefined) {
    match.winnerTeamId = body.winnerTeamId;
  }

  if (match.status === 'finished') {
    propagateBracketAdvancement(match);
  }

  broadcastFullState();
  res.json({ match, state });
});

app.post('/api/admin/matches', requireAdmin, (req, res) => {
  const { round, homeTeamId, awayTeamId, arenaPitch, scheduledAt } = req.body as {
    round?: MatchRound;
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    arenaPitch?: string;
    scheduledAt?: string;
  };

  const id = `match-${Date.now().toString(36)}`;
  const newMatch: Match = {
    id,
    round: round || 'Group',
    bracketSlot: state.matches.length + 1,
    nextMatchId: null,
    nextMatchSide: null,
    homeTeamId: homeTeamId || null,
    awayTeamId: awayTeamId || null,
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
    arenaPitch: (arenaPitch || 'Pitch Alpha').trim().slice(0, 60),
    scheduledAt: scheduledAt || new Date().toISOString(),
    winnerTeamId: null,
    events: [],
  };

  state.matches = [...state.matches, newMatch];
  broadcastFullState();
  res.status(201).json({ match: newMatch, state });
});

app.delete('/api/admin/matches/:id', requireAdmin, (req, res) => {
  const exists = state.matches.some((m) => m.id === req.params.id);
  if (!exists) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }
  state.matches = state.matches.filter((m) => m.id !== req.params.id);
  if (state.meta.activeMatchId === req.params.id) {
    const live = state.matches.find((m) => m.status === 'live');
    state.meta.activeMatchId = live?.id ?? state.matches[0]?.id ?? null;
  }
  broadcastFullState();
  res.json({ state });
});

app.post('/api/admin/teams', requireAdmin, (req, res) => {
  const { name, shortCode, division, region, accentColor, seed, robots } = req.body as {
    name: string;
    shortCode: string;
    division?: string;
    region?: string;
    accentColor?: string;
    seed?: number;
    robots?: RobotUnit[];
  };

  if (!name?.trim() || !shortCode?.trim()) {
    res.status(400).json({ error: 'Team name and shortCode are required' });
    return;
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const id = `team-${slug || Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

  const newTeam: Team = {
    id,
    name: name.trim().slice(0, 80),
    shortCode: shortCode.trim().toUpperCase().slice(0, 6),
    division: (division || 'Group A').trim().slice(0, 60),
    region: (region && region.trim().length >= 2 ? region.trim() : 'School Class').slice(0, 60),
    accentColor: /^#[0-9a-fA-F]{6}$/.test(accentColor || '') ? (accentColor as string) : '#C8F135',
    seed: Number.isFinite(seed) ? Math.max(1, Math.min(64, Math.trunc(seed as number))) : state.teams.length + 1,
    robots: Array.isArray(robots) ? robots.slice(0, 10) : [],
  };

  state.teams = [...state.teams, newTeam];
  broadcastFullState();
  res.status(201).json({ team: newTeam, state });
});

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

app.post('/api/admin/teams/bulk', requireAdmin, (req, res) => {
  const rawTeams = (
    req.body as {
      teams?: Array<{
        name?: string;
        shortCode?: string;
        division?: string;
        region?: string;
        accentColor?: string;
        seed?: number;
        robots?: Array<{
          unitNumber?: string;
          designation?: string;
          role?: RobotRole;
          actuation?: string;
          operator?: string;
        }>;
      }>;
    }
  )?.teams;

  if (!Array.isArray(rawTeams) || rawTeams.length === 0) {
    res.status(400).json({ error: 'Provide at least one team to import' });
    return;
  }

  const validRoles: RobotRole[] = ['Striker', 'Midfielder', 'Defender', 'Keeper'];
  const createdTeams: Team[] = [];
  const baseStamp = Date.now().toString(36);

  for (let idx = 0; idx < Math.min(64, rawTeams.length); idx += 1) {
    const item = rawTeams[idx];
    const cleanName = typeof item?.name === 'string' ? item.name.trim().slice(0, 80) : '';
    if (cleanName.length < 2) continue;

    const rawCode =
      typeof item.shortCode === 'string'
        ? item.shortCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
        : '';
    const shortCode = rawCode.length >= 2 ? rawCode : deriveShortCode(cleanName);

    const rawDiv = typeof item.division === 'string' ? item.division.trim().slice(0, 60) : '';
    const division = rawDiv.length >= 2 ? rawDiv : 'Group A';

    const rawRegion = typeof item.region === 'string' ? item.region.trim().slice(0, 60) : '';
    const region = rawRegion.length >= 2 ? rawRegion : 'School Class';

    const paletteColor =
      BULK_ACCENT_PALETTE[(state.teams.length + createdTeams.length) % BULK_ACCENT_PALETTE.length];
    const accentColor =
      typeof item.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.accentColor)
        ? item.accentColor
        : paletteColor;

    const seedNum = Number.isFinite(item.seed)
      ? Math.max(1, Math.min(64, Math.trunc(item.seed as number)))
      : Math.max(1, Math.min(64, state.teams.length + createdTeams.length + 1));

    const robots: RobotUnit[] = Array.isArray(item.robots)
      ? item.robots
          .slice(0, 10)
          .filter((r) => (r?.designation && r.designation.trim()) || (r?.unitNumber && r.unitNumber.trim()))
          .map((r, rIdx) => ({
            id: `r-${baseStamp}-${idx}-${rIdx}-${Math.random().toString(36).slice(2, 5)}`,
            unitNumber: (r.unitNumber?.trim() || String(rIdx === 0 ? '07' : '01')).slice(0, 4),
            designation: (r.designation?.trim() || `Unit ${rIdx + 1}`).slice(0, 60),
            role: validRoles.includes(r.role as RobotRole)
              ? (r.role as RobotRole)
              : rIdx === 0
                ? 'Striker'
                : 'Keeper',
            actuation: (r.actuation?.trim() || 'Standard Drive').slice(0, 60),
            operator: (r.operator?.trim() || 'Unassigned').slice(0, 60),
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
      region,
      accentColor,
      seed: seedNum,
      robots,
    });
  }

  if (createdTeams.length === 0) {
    res.status(400).json({ error: 'No valid teams found (each team name needs at least 2 characters)' });
    return;
  }

  state.teams = [...state.teams, ...createdTeams];
  broadcastFullState();
  res.status(201).json({ createdCount: createdTeams.length, teams: createdTeams, state });
});

app.patch('/api/admin/teams/:id', requireAdmin, (req, res) => {
  const team = state.teams.find((t) => t.id === req.params.id);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const body = req.body as Partial<Team>;
  if (typeof body.name === 'string' && body.name.trim()) team.name = body.name.trim().slice(0, 80);
  if (typeof body.shortCode === 'string' && body.shortCode.trim()) {
    team.shortCode = body.shortCode.trim().toUpperCase().slice(0, 6);
  }
  if (typeof body.division === 'string' && body.division.trim()) {
    team.division = body.division.trim().slice(0, 60);
  }
  if (typeof body.region === 'string' && body.region.trim()) {
    team.region = body.region.trim().slice(0, 60);
  }
  if (typeof body.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.accentColor)) {
    team.accentColor = body.accentColor;
  }
  if (typeof body.seed === 'number' && Number.isFinite(body.seed)) {
    team.seed = Math.max(1, Math.min(64, Math.trunc(body.seed)));
  }
  if (Array.isArray(body.robots)) {
    team.robots = body.robots.slice(0, 10);
  }

  broadcastFullState();
  res.json({ team, state });
});

app.delete('/api/admin/teams/:id', requireAdmin, (req, res) => {
  const exists = state.teams.some((t) => t.id === req.params.id);
  if (!exists) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }
  state.teams = state.teams.filter((t) => t.id !== req.params.id);
  for (const match of state.matches) {
    if (match.homeTeamId === req.params.id) match.homeTeamId = null;
    if (match.awayTeamId === req.params.id) match.awayTeamId = null;
    if (match.winnerTeamId === req.params.id) match.winnerTeamId = null;
  }
  broadcastFullState();
  res.json({ state });
});

app.post('/api/admin/bracket/seed-from-standings', requireAdmin, (_req, res) => {
  state.matches = applySeededSuddenDeathBracket(state.teams, state.matches);
  broadcastFullState();
  res.json({ state });
});

app.post('/api/admin/schedule/generate-tournament', requireAdmin, (req, res) => {
  if (state.teams.length < 2) {
    res.status(400).json({ error: 'Register at least 2 teams before generating a tournament schedule' });
    return;
  }

  const now = Date.now();
  const startBaseMs = Date.parse((req.body as { startTime?: string } | undefined)?.startTime || '');
  let slotTimeMs = Number.isFinite(startBaseMs) ? startBaseMs : now + 10 * 60 * 1000;

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

  // Build Sudden-Death Bracket matches
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
    state.matches = applySeededSuddenDeathBracket(state.teams, generatedMatches);
  } else if (state.teams.length >= 4) {
    const sorted = [...state.teams].sort((a, b) => a.seed - b.seed);
    generatedMatches.push(
      makeEmptyMatch({ id: 'sf-1', round: 'Semifinal', bracketSlot: 1, nextMatchId: 'final-1', nextMatchSide: 'home', homeTeamId: sorted[0].id, awayTeamId: sorted[3].id, arenaPitch: 'Center Arena' }),
      makeEmptyMatch({ id: 'sf-2', round: 'Semifinal', bracketSlot: 2, nextMatchId: 'final-1', nextMatchSide: 'away', homeTeamId: sorted[1].id, awayTeamId: sorted[2].id, arenaPitch: 'Center Arena' }),
      makeEmptyMatch({ id: 'tp-1', round: 'Third Place', bracketSlot: 1, nextMatchId: null, nextMatchSide: null, homeTeamId: null, awayTeamId: null, arenaPitch: 'Pitch Beta' }),
      makeEmptyMatch({ id: 'final-1', round: 'Final', bracketSlot: 1, nextMatchId: null, nextMatchSide: null, homeTeamId: null, awayTeamId: null, arenaPitch: 'Center Arena' }),
    );
    state.matches = generatedMatches;
  } else {
    const sorted = [...state.teams].sort((a, b) => a.seed - b.seed);
    generatedMatches.push(
      makeEmptyMatch({ id: 'final-1', round: 'Final', bracketSlot: 1, nextMatchId: null, nextMatchSide: null, homeTeamId: sorted[0].id, awayTeamId: sorted[1].id, arenaPitch: 'Center Arena' }),
    );
    state.matches = generatedMatches;
  }

  state.meta.activeMatchId = state.matches[0]?.id ?? null;
  broadcastFullState();
  res.status(201).json({ state });
});

app.post('/api/admin/hydrate', requireAdmin, (req, res) => {
  if (!untouchedBoot) {
    res.json({ state, hydrated: false });
    return;
  }
  const incoming = (req.body as { state?: TournamentState })?.state;
  if (
    !incoming ||
    !incoming.meta ||
    !Array.isArray(incoming.teams) ||
    !Array.isArray(incoming.matches)
  ) {
    res.status(400).json({ error: 'Invalid tournament state payload' });
    return;
  }
  state = {
    meta: {
      id: 'main',
      name: String(incoming.meta.name || 'RoboPitch Championship 2026').slice(0, 120),
      season: String(
        incoming.meta.season ||
          '3 Groups · Round-Robin + Sudden-Death Bracket · 4-Min Matches',
      ).slice(0, 120),
      activeMatchId: incoming.meta.activeMatchId ?? null,
      updatedAt: Date.now(),
      rulesVersion: 3,
    },
    teams: incoming.teams,
    matches: incoming.matches,
  };
  broadcastFullState();
  res.json({ state, hydrated: true });
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  const mode = (req.body as { mode?: 'clear' | 'demo' } | undefined)?.mode ?? 'clear';
  if (mode === 'demo') {
    state = createSeedTournament();
  } else {
    state = createEmptyTournament({
      name: state.meta.name,
      season: state.meta.season,
    });
  }
  broadcastFullState();
  res.json({ state });
});

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RoboPitch Championship server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
