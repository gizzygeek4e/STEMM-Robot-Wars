export type RobotRole = 'Striker' | 'Midfielder' | 'Defender' | 'Keeper';

export interface RobotUnit {
  id: string;
  unitNumber: string;
  designation: string;
  role: RobotRole;
  actuation: string;
  operator: string;
}

export interface Team {
  id: string;
  name: string;
  shortCode: string;
  division: string; // Group A | Group B | Group C
  region: string;
  accentColor: string;
  seed: number;
  robots: RobotUnit[];
}

export type MatchRound =
  | 'Group'
  | 'Play-In'
  | 'Quarterfinal'
  | 'Semifinal'
  | 'Third Place'
  | 'Final';
export type MatchStatus = 'scheduled' | 'live' | 'halftime' | 'finished';
export type MatchEventType =
  | 'goal'
  | 'flip_over'
  | 'own_goal'
  | 'penalty'
  | 'card_yellow'
  | 'timeout';

export interface MatchEvent {
  id: string;
  minute: number;
  teamId: string;
  robotNumber: string;
  type: MatchEventType;
  description: string;
  timestamp: number;
}

export interface Match {
  id: string;
  round: MatchRound;
  bracketSlot: number;
  nextMatchId: string | null;
  nextMatchSide: 'home' | 'away' | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  homeFlipOvers: number;
  awayFlipOvers: number;
  durationSeconds: number;
  status: MatchStatus;
  period: string;
  clockSeconds: number;
  clockRunning: boolean;
  clockUpdatedAt: number;
  arenaPitch: string;
  scheduledAt: string;
  winnerTeamId: string | null;
  events: MatchEvent[];
}

export interface TournamentMeta {
  id: string;
  name: string;
  season: string;
  activeMatchId: string | null;
  updatedAt: number;
  rulesVersion?: number;
}

export interface TournamentState {
  meta: TournamentMeta;
  teams: Team[];
  matches: Match[];
}

export interface TeamStanding {
  team: Team;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  flipOvers: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

export type WSServerMessage =
  | {
      type: 'state:init';
      payload: TournamentState;
      serverTime: number;
      connectedClients: number;
    }
  | {
      type: 'state:sync';
      payload: TournamentState;
      serverTime: number;
    }
  | {
      type: 'match:updated';
      payload: Match;
      serverTime: number;
    }
  | {
      type: 'clock:tick';
      payload: Array<{
        id: string;
        clockSeconds: number;
        clockRunning: boolean;
        clockUpdatedAt: number;
      }>;
      serverTime: number;
    }
  | {
      type: 'presence:count';
      payload: { connectedClients: number };
    };
