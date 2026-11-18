import type { Match, MatchEvent, Team, TournamentState } from '../types/tournament.ts';
import { applySeededSuddenDeathBracket } from '../utils/bracketSeeding.ts';

export const MATCH_DURATION_SECONDS = 240; // 4 minutes per match

function makeGroupMatch(params: {
  id: string;
  slot: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeFlipOvers: number;
  awayFlipOvers: number;
  pitch: string;
  scheduledAt: string;
  status?: 'finished' | 'live' | 'scheduled';
  clockSeconds?: number;
  clockRunning?: boolean;
  period?: string;
  events?: MatchEvent[];
  now: number;
}): Match {
  const status = params.status ?? 'finished';
  const winnerTeamId =
    status === 'finished'
      ? params.homeScore > params.awayScore
        ? params.homeTeamId
        : params.awayScore > params.homeScore
          ? params.awayTeamId
          : null
      : null;

  return {
    id: params.id,
    round: 'Group',
    bracketSlot: params.slot,
    nextMatchId: null,
    nextMatchSide: null,
    homeTeamId: params.homeTeamId,
    awayTeamId: params.awayTeamId,
    homeScore: params.homeScore,
    awayScore: params.awayScore,
    homeFlipOvers: params.homeFlipOvers,
    awayFlipOvers: params.awayFlipOvers,
    durationSeconds: MATCH_DURATION_SECONDS,
    status,
    period:
      params.period ??
      (status === 'finished' ? 'Full Time' : status === 'live' ? '2nd Half' : 'Pre-Match'),
    clockSeconds:
      params.clockSeconds ?? (status === 'finished' ? MATCH_DURATION_SECONDS : 0),
    clockRunning: params.clockRunning ?? false,
    clockUpdatedAt: params.now,
    arenaPitch: params.pitch,
    scheduledAt: params.scheduledAt,
    winnerTeamId,
    events: params.events ?? [],
  };
}

export function createSeedTournament(): TournamentState {
  const now = Date.now();

  const teams: Team[] = [
    // GROUP A (4 teams)
    {
      id: 'team-gisborne',
      name: 'Gisborne Kinetic',
      shortCode: 'GIS',
      division: 'Group A',
      region: 'Gisborne, NZ',
      accentColor: '#C8F135',
      seed: 1,
      robots: [
        { id: 'r-gis-1', unitNumber: '07', designation: 'Kahu Striker Mk-IV', role: 'Striker', actuation: 'Omni-Drive 48V', operator: 'H. Fraser' },
        { id: 'r-gis-2', unitNumber: '01', designation: 'Aegis Sentinel', role: 'Keeper', actuation: 'High-Torque Wedge', operator: 'M. Tauranga' },
      ],
    },
    {
      id: 'team-seoul',
      name: 'Seoul Servo FC',
      shortCode: 'SEO',
      division: 'Group A',
      region: 'Seoul, KR',
      accentColor: '#10B981',
      seed: 5,
      robots: [
        { id: 'r-seo-1', unitNumber: '17', designation: 'Han River V3', role: 'Striker', actuation: 'Brushless Agile', operator: 'J. Park' },
        { id: 'r-seo-2', unitNumber: '04', designation: 'Bukhan Wall', role: 'Defender', actuation: 'Carbon Composite', operator: 'S. Kim' },
      ],
    },
    {
      id: 'team-aegis',
      name: 'Aegis Dynamics',
      shortCode: 'AEG',
      division: 'Group A',
      region: 'San Jose, US',
      accentColor: '#22D3EE',
      seed: 8,
      robots: [
        { id: 'r-aeg-1', unitNumber: '23', designation: 'Valkyrie Strike', role: 'Striker', actuation: 'Direct-Drive Omni', operator: 'D. Morales' },
        { id: 'r-aeg-2', unitNumber: '00', designation: 'Zero-Latency GK', role: 'Keeper', actuation: '48V Regenerative', operator: 'R. Vance' },
      ],
    },
    {
      id: 'team-tauranga',
      name: 'Bay Robotics FC',
      shortCode: 'BAY',
      division: 'Group A',
      region: 'Tauranga, NZ',
      accentColor: '#F472B6',
      seed: 12,
      robots: [
        { id: 'r-bay-1', unitNumber: '18', designation: 'Moana Striker', role: 'Striker', actuation: 'Tri-Wheel Omni', operator: 'N. Wiremu' },
        { id: 'r-bay-2', unitNumber: '01', designation: 'Mauao Keeper', role: 'Keeper', actuation: 'Servo Deflector', operator: 'S. Clark' },
      ],
    },

    // GROUP B (4 teams)
    {
      id: 'team-osaka',
      name: 'Osaka Striders',
      shortCode: 'OSA',
      division: 'Group B',
      region: 'Osaka, JP',
      accentColor: '#38BDF8',
      seed: 2,
      robots: [
        { id: 'r-osa-1', unitNumber: '09', designation: 'Hayabusa X2', role: 'Striker', actuation: 'Dual-Core Omni', operator: 'K. Takahashi' },
        { id: 'r-osa-2', unitNumber: '01', designation: 'Kagami Net', role: 'Keeper', actuation: 'Optical Reflex Drive', operator: 'Y. Sato' },
      ],
    },
    {
      id: 'team-auckland',
      name: 'Auckland Vectors',
      shortCode: 'AKL',
      division: 'Group B',
      region: 'Auckland, NZ',
      accentColor: '#A78BFA',
      seed: 6,
      robots: [
        { id: 'r-akl-1', unitNumber: '21', designation: 'Waitemata Bolt', role: 'Striker', actuation: 'Tri-Omni High-RPM', operator: 'T. Rata' },
        { id: 'r-akl-2', unitNumber: '01', designation: 'Beacon Keeper', role: 'Keeper', actuation: 'LiDAR Tracked Drive', operator: 'E. Wallace' },
      ],
    },
    {
      id: 'team-kyoto',
      name: 'Kyoto Torque',
      shortCode: 'KYO',
      division: 'Group B',
      region: 'Kyoto, JP',
      accentColor: '#FB7185',
      seed: 7,
      robots: [
        { id: 'r-kyo-1', unitNumber: '19', designation: 'Arashi Kick', role: 'Striker', actuation: 'Pneumatic Flipper', operator: 'T. Watanabe' },
        { id: 'r-kyo-2', unitNumber: '03', designation: 'Torii Guard', role: 'Defender', actuation: 'Reinforced Alloy', operator: 'M. Ito' },
      ],
    },
    {
      id: 'team-christchurch',
      name: 'Canterbury Apex',
      shortCode: 'CAN',
      division: 'Group B',
      region: 'Christchurch, NZ',
      accentColor: '#60A5FA',
      seed: 11,
      robots: [
        { id: 'r-can-1', unitNumber: '15', designation: 'Alpine Kicker', role: 'Striker', actuation: 'Solenoid Omni 36V', operator: 'B. Evans' },
        { id: 'r-can-2', unitNumber: '06', designation: 'Plains Guard', role: 'Defender', actuation: 'Planetary Gear 4WD', operator: 'G. Thompson' },
      ],
    },

    // GROUP C (4 teams)
    {
      id: 'team-zurich',
      name: 'Zurich Automaton',
      shortCode: 'ZUR',
      division: 'Group C',
      region: 'Zurich, CH',
      accentColor: '#F59E0B',
      seed: 3,
      robots: [
        { id: 'r-zur-1', unitNumber: '10', designation: 'Helvetia Pulse', role: 'Striker', actuation: '4-Wheel Solenoid', operator: 'L. Meier' },
        { id: 'r-zur-2', unitNumber: '03', designation: 'Granite Chassis', role: 'Defender', actuation: 'High-Grip Mecanum', operator: 'N. Keller' },
      ],
    },
    {
      id: 'team-munich',
      name: 'Munich Vanguard',
      shortCode: 'MUC',
      division: 'Group C',
      region: 'Munich, DE',
      accentColor: '#EF4444',
      seed: 4,
      robots: [
        { id: 'r-muc-1', unitNumber: '14', designation: 'Bavaria Blitz', role: 'Striker', actuation: 'Solenoid Chip-Kicker', operator: 'J. Hoffman' },
        { id: 'r-muc-2', unitNumber: '99', designation: 'Iron Bastion', role: 'Keeper', actuation: '48V Field-Oriented', operator: 'K. Wagner' },
      ],
    },
    {
      id: 'team-wellington',
      name: 'Wellington Surge',
      shortCode: 'WLG',
      division: 'Group C',
      region: 'Wellington, NZ',
      accentColor: '#34D399',
      seed: 9,
      robots: [
        { id: 'r-wlg-1', unitNumber: '12', designation: 'Zephyr Ram', role: 'Striker', actuation: '4WD Brushless', operator: 'C. Reid' },
        { id: 'r-wlg-2', unitNumber: '02', designation: 'Harbour Anchor', role: 'Defender', actuation: 'Low-CG Wedge', operator: 'A. Patel' },
      ],
    },
    {
      id: 'team-hamilton',
      name: 'Waikato Mecha',
      shortCode: 'WAI',
      division: 'Group C',
      region: 'Hamilton, NZ',
      accentColor: '#FBBF24',
      seed: 10,
      robots: [
        { id: 'r-wai-1', unitNumber: '08', designation: 'Taniwha Drive', role: 'Striker', actuation: 'High-Torque Mecanum', operator: 'R. Ngata' },
        { id: 'r-wai-2', unitNumber: '05', designation: 'River Shield', role: 'Keeper', actuation: 'Dual-Motor Skid', operator: 'L. Chen' },
      ],
    },
  ];

  const groupMatches: Match[] = [
    // GROUP A ROUND-ROBIN (6 matches)
    makeGroupMatch({
      id: 'grp-a1', slot: 1, homeTeamId: 'team-gisborne', awayTeamId: 'team-seoul',
      homeScore: 3, awayScore: 1, homeFlipOvers: 2, awayFlipOvers: 0,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T08:00:00-08:00', now,
      events: [
        { id: 'ev-a1', minute: 1, teamId: 'team-gisborne', robotNumber: '07', type: 'goal', description: 'Opening solenoid strike by Unit #07', timestamp: now - 9000000 },
        { id: 'ev-a2', minute: 2, teamId: 'team-gisborne', robotNumber: '01', type: 'flip_over', description: 'Flip Over bonus (+1 pt) by Unit #01', timestamp: now - 8900000 },
      ],
    }),
    makeGroupMatch({
      id: 'grp-a2', slot: 2, homeTeamId: 'team-aegis', awayTeamId: 'team-tauranga',
      homeScore: 2, awayScore: 1, homeFlipOvers: 1, awayFlipOvers: 1,
      pitch: 'Pitch Beta', scheduledAt: '2026-11-18T08:10:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-a3', slot: 3, homeTeamId: 'team-gisborne', awayTeamId: 'team-aegis',
      homeScore: 4, awayScore: 0, homeFlipOvers: 1, awayFlipOvers: 0,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T08:40:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-a4', slot: 4, homeTeamId: 'team-seoul', awayTeamId: 'team-tauranga',
      homeScore: 3, awayScore: 2, homeFlipOvers: 1, awayFlipOvers: 0,
      pitch: 'Pitch Beta', scheduledAt: '2026-11-18T08:50:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-a5', slot: 5, homeTeamId: 'team-gisborne', awayTeamId: 'team-tauranga',
      homeScore: 2, awayScore: 1, homeFlipOvers: 1, awayFlipOvers: 1,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T09:20:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-a6', slot: 6, homeTeamId: 'team-seoul', awayTeamId: 'team-aegis',
      homeScore: 2, awayScore: 2, homeFlipOvers: 1, awayFlipOvers: 0,
      pitch: 'Pitch Beta', scheduledAt: '2026-11-18T09:30:00-08:00', now,
    }),

    // GROUP B ROUND-ROBIN (6 matches)
    makeGroupMatch({
      id: 'grp-b1', slot: 7, homeTeamId: 'team-osaka', awayTeamId: 'team-auckland',
      homeScore: 3, awayScore: 2, homeFlipOvers: 1, awayFlipOvers: 1,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T08:20:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-b2', slot: 8, homeTeamId: 'team-kyoto', awayTeamId: 'team-christchurch',
      homeScore: 2, awayScore: 0, homeFlipOvers: 2, awayFlipOvers: 0,
      pitch: 'Pitch Beta', scheduledAt: '2026-11-18T08:30:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-b3', slot: 9, homeTeamId: 'team-osaka', awayTeamId: 'team-kyoto',
      homeScore: 2, awayScore: 1, homeFlipOvers: 1, awayFlipOvers: 1,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T09:00:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-b4', slot: 10, homeTeamId: 'team-auckland', awayTeamId: 'team-christchurch',
      homeScore: 3, awayScore: 1, homeFlipOvers: 0, awayFlipOvers: 1,
      pitch: 'Pitch Beta', scheduledAt: '2026-11-18T09:10:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-b5', slot: 11, homeTeamId: 'team-osaka', awayTeamId: 'team-christchurch',
      homeScore: 4, awayScore: 1, homeFlipOvers: 1, awayFlipOvers: 0,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T09:40:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-b6', slot: 12, homeTeamId: 'team-auckland', awayTeamId: 'team-kyoto',
      homeScore: 1, awayScore: 1, homeFlipOvers: 1, awayFlipOvers: 1,
      pitch: 'Pitch Beta', scheduledAt: '2026-11-18T09:50:00-08:00', now,
    }),

    // GROUP C ROUND-ROBIN (6 matches — final match LIVE now!)
    makeGroupMatch({
      id: 'grp-c1', slot: 13, homeTeamId: 'team-zurich', awayTeamId: 'team-munich',
      homeScore: 2, awayScore: 1, homeFlipOvers: 1, awayFlipOvers: 0,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T10:00:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-c2', slot: 14, homeTeamId: 'team-wellington', awayTeamId: 'team-hamilton',
      homeScore: 2, awayScore: 1, homeFlipOvers: 1, awayFlipOvers: 1,
      pitch: 'Pitch Beta', scheduledAt: '2026-11-18T10:10:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-c3', slot: 15, homeTeamId: 'team-zurich', awayTeamId: 'team-wellington',
      homeScore: 3, awayScore: 1, homeFlipOvers: 2, awayFlipOvers: 0,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T10:25:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-c4', slot: 16, homeTeamId: 'team-munich', awayTeamId: 'team-hamilton',
      homeScore: 3, awayScore: 0, homeFlipOvers: 1, awayFlipOvers: 0,
      pitch: 'Pitch Beta', scheduledAt: '2026-11-18T10:35:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-c5', slot: 17, homeTeamId: 'team-zurich', awayTeamId: 'team-hamilton',
      homeScore: 2, awayScore: 0, homeFlipOvers: 1, awayFlipOvers: 0,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T10:50:00-08:00', now,
    }),
    makeGroupMatch({
      id: 'grp-c6', slot: 18, homeTeamId: 'team-munich', awayTeamId: 'team-wellington',
      homeScore: 2, awayScore: 1, homeFlipOvers: 1, awayFlipOvers: 1,
      pitch: 'Pitch Alpha', scheduledAt: '2026-11-18T11:50:00-08:00',
      status: 'live', clockSeconds: 158, clockRunning: true, period: '2nd Half', now,
      events: [
        { id: 'ev-c1', minute: 1, teamId: 'team-munich', robotNumber: '14', type: 'goal', description: 'Solenoid strike by Unit #14', timestamp: now - 120000 },
        { id: 'ev-c2', minute: 2, teamId: 'team-wellington', robotNumber: '12', type: 'flip_over', description: 'Flip Over bonus (+1 pt) by Unit #12', timestamp: now - 80000 },
        { id: 'ev-c3', minute: 3, teamId: 'team-munich', robotNumber: '99', type: 'flip_over', description: 'Flip Over bonus (+1 pt) by Unit #99', timestamp: now - 35000 },
      ],
    }),
  ];

  // 12-Team Sudden-Death Bracket favouring top teams:
  // Top 4 overall seeds (#1 - #4) get direct Quarterfinal Byes.
  // Seeds #5 - #12 play Round 1 Sudden-Death Play-In: #8v#9, #5v#12, #6v#11, #7v#10.
  const bracketMatches: Match[] = [
    // Round 1 Sudden-Death Play-In (#5 - #12)
    {
      id: 'po-1',
      round: 'Play-In',
      bracketSlot: 1,
      nextMatchId: 'qf-1',
      nextMatchSide: 'away',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Alpha',
      scheduledAt: '2026-11-18T12:15:00-08:00',
      winnerTeamId: null,
      events: [],
    },
    {
      id: 'po-2',
      round: 'Play-In',
      bracketSlot: 2,
      nextMatchId: 'qf-2',
      nextMatchSide: 'away',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Beta',
      scheduledAt: '2026-11-18T12:25:00-08:00',
      winnerTeamId: null,
      events: [],
    },
    {
      id: 'po-3',
      round: 'Play-In',
      bracketSlot: 3,
      nextMatchId: 'qf-3',
      nextMatchSide: 'away',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Alpha',
      scheduledAt: '2026-11-18T12:35:00-08:00',
      winnerTeamId: null,
      events: [],
    },
    {
      id: 'po-4',
      round: 'Play-In',
      bracketSlot: 4,
      nextMatchId: 'qf-4',
      nextMatchSide: 'away',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Beta',
      scheduledAt: '2026-11-18T12:45:00-08:00',
      winnerTeamId: null,
      events: [],
    },

    // Quarterfinals (#1 - #4 receive Round 1 Bye)
    {
      id: 'qf-1',
      round: 'Quarterfinal',
      bracketSlot: 1,
      nextMatchId: 'sf-1',
      nextMatchSide: 'home',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Alpha',
      scheduledAt: '2026-11-18T13:05:00-08:00',
      winnerTeamId: null,
      events: [],
    },
    {
      id: 'qf-2',
      round: 'Quarterfinal',
      bracketSlot: 2,
      nextMatchId: 'sf-1',
      nextMatchSide: 'away',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Beta',
      scheduledAt: '2026-11-18T13:15:00-08:00',
      winnerTeamId: null,
      events: [],
    },
    {
      id: 'qf-3',
      round: 'Quarterfinal',
      bracketSlot: 3,
      nextMatchId: 'sf-2',
      nextMatchSide: 'home',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Alpha',
      scheduledAt: '2026-11-18T13:25:00-08:00',
      winnerTeamId: null,
      events: [],
    },
    {
      id: 'qf-4',
      round: 'Quarterfinal',
      bracketSlot: 4,
      nextMatchId: 'sf-2',
      nextMatchSide: 'away',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Beta',
      scheduledAt: '2026-11-18T13:35:00-08:00',
      winnerTeamId: null,
      events: [],
    },

    // Semifinals
    {
      id: 'sf-1',
      round: 'Semifinal',
      bracketSlot: 1,
      nextMatchId: 'final-1',
      nextMatchSide: 'home',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Center Arena',
      scheduledAt: '2026-11-18T13:55:00-08:00',
      winnerTeamId: null,
      events: [],
    },
    {
      id: 'sf-2',
      round: 'Semifinal',
      bracketSlot: 2,
      nextMatchId: 'final-1',
      nextMatchSide: 'away',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Center Arena',
      scheduledAt: '2026-11-18T14:05:00-08:00',
      winnerTeamId: null,
      events: [],
    },

    // Third Place & Grand Final
    {
      id: 'tp-1',
      round: 'Third Place',
      bracketSlot: 1,
      nextMatchId: null,
      nextMatchSide: null,
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Pitch Beta',
      scheduledAt: '2026-11-18T14:20:00-08:00',
      winnerTeamId: null,
      events: [],
    },
    {
      id: 'final-1',
      round: 'Final',
      bracketSlot: 1,
      nextMatchId: null,
      nextMatchSide: null,
      homeTeamId: null,
      awayTeamId: null,
      homeScore: 0,
      awayScore: 0,
      homeFlipOvers: 0,
      awayFlipOvers: 0,
      durationSeconds: MATCH_DURATION_SECONDS,
      status: 'scheduled',
      period: 'Pre-Match',
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: now,
      arenaPitch: 'Center Arena',
      scheduledAt: '2026-11-18T14:35:00-08:00',
      winnerTeamId: null,
      events: [],
    },
  ];

  const allMatches = applySeededSuddenDeathBracket(teams, [
    ...groupMatches,
    ...bracketMatches,
  ]);

  return {
    meta: {
      id: 'main',
      name: 'RoboPitch Championship 2026',
      season: '3 Groups · Round-Robin + Sudden-Death Seeded Bracket · 4-Min Matches',
      activeMatchId: 'grp-c6',
      updatedAt: now,
      rulesVersion: 3,
    },
    teams,
    matches: allMatches,
  };
}

export function createEmptyTournament(
  existingMeta?: Partial<Pick<TournamentState['meta'], 'name' | 'season'>>,
): TournamentState {
  const now = Date.now();
  return {
    meta: {
      id: 'main',
      name: existingMeta?.name?.trim() || 'RoboPitch Championship 2026',
      season:
        existingMeta?.season?.trim() ||
        '3 Groups · Round-Robin + Sudden-Death Bracket · 4-Min Matches',
      activeMatchId: null,
      updatedAt: now,
      rulesVersion: 3,
    },
    teams: [],
    matches: [],
  };
}

