/**
 * CHEQ Sports Fest 3.0 — the 16 standard sport events.
 *
 * Sourced from `sports-config.json` (Captains Sheet — Rules, v1). Used by the
 * "Import 16 standard sports" button in the Admin → Sports tab to seed an
 * event in one tap.
 *
 * Anything in here is editable by the admin after seeding — the data is just
 * a starting point. If you change the rulebook, update both this file and
 * the JSON it came from.
 */
import type { SportDoc } from '@/types/sport';

export type StandardSport = SportDoc & { id: string };

export const STANDARD_SPORTS: StandardSport[] = [
  {
    id: 'cricket',
    name: 'Cricket',
    category: 'team',
    arenaType: 'field',
    playersOnField: 6,
    playersToRegister: 7,
    substitutes: 1,
    substitutionRules: 'Substitutions allowed only for female players or fielders.',
    genderRequirement: {
      mandatoryFemales: 1,
      notes: 'At least 1 female required on field at all times (out of 7 registered).',
    },
    format: '6 overs per side · 7-over total game (1 + 6)',
    overSchedule: '2 + 2 + 1 + 1 (except Oldies category)',
    duration: '6 overs per side',
    scoringRules: [
      '1st over mandatory to be bowled to a woman batter. If she gets out, over ends.',
      'Runs scored from the bat by women are doubled.',
      'Ball hitting back net post via side/ground = 4 runs. Top net = 6 runs.',
      'Straight net poles = 4 or 6 depending on height.',
      'After third light pole = 2 runs.',
      'No overthrows count.',
      'Retired hurt player is considered out.',
      'Dead ball rule for girls: two bounces before popping crease.',
    ],
    bowlingRules: [
      '2 bowlers can bowl up to 2 overs each.',
      'No jerk or throw bowls allowed by male bowlers.',
      'Female bowler can be substituted with another female bowler.',
      'After 10 dead balls: captain’s choice to change female bowler.',
      'After 15 dead balls: mandatory change of female bowler.',
    ],
    fieldingRules: [
      '2 players behind bowling stumps.',
      '2 players between stumps and third light pole.',
      '1 wicket keeper.',
      'Remaining players anywhere after the third pole.',
    ],
    tieBreakerRules: [
      'Tied matches resolved by Bowl Outs (6 players bowl one ball each, 1 female mandatory).',
      'If bowl out also tied, sudden death.',
      'Round robin ties resolved by Net Run Rate (NRR).',
    ],
    trackableEvents: [
      'run-0', 'run-1', 'run-2', 'run-3', 'run-4', 'run-6',
      'wicket', 'wide', 'no-ball', 'bye', 'leg-bye',
      'dead-ball', 'over-end', 'innings-end',
      'female-over-start', 'retired-hurt',
    ],
    stateFields: ['overs', 'balls', 'runs', 'wickets', 'innings', 'currentBatter', 'currentBowler'],
    points: { win: 10, draw: 4, loss: 0 },
  },
  {
    id: 'football',
    name: 'Football',
    category: 'team',
    arenaType: 'pitch',
    playersOnField: 4,
    playersToRegister: 7,
    substitutes: 3,
    substitutionRules: 'Running substitutions allowed for the 3 subs.',
    genderRequirement: null,
    format: '4-a-side',
    duration: '10 min per game (5 min each half · no extra time)',
    officials: '2 referees per match. Referee’s call is final.',
    scoringRules: [
      'Standard goals — no special weighting.',
      'Strict yellow and red cards.',
      'Indirect free kicks only — no direct free kicks allowed.',
      'Goalkeeper area (D): if defending team touches ball inside D, attacking team gets penalty.',
      'If attacking team touches ball inside D, defending team gets free kick.',
      'Penalties taken from the half way line.',
    ],
    gameplayRules: [
      'Play only resumes on whistle.',
      'Indirect free kicks only — no one can be inside the D.',
    ],
    tieBreakerRules: [
      'Knockouts: Shootout from distance without goalie.',
      'Round robin ties resolved by: Goal Difference → Goals Scored → Goals Conceded → Penalties (between all three tied teams).',
    ],
    trackableEvents: [
      'goal', 'yellow', 'red', 'foul', 'sub', 'penalty',
      'free-kick', 'corner', 'half-time', 'full-time',
    ],
    stateFields: ['scoreA', 'scoreB', 'clockSeconds', 'half', 'isRunning', 'yellowCards', 'redCards'],
    points: { win: 8, draw: 3, loss: 0 },
  },
  {
    id: 'tug-of-war',
    name: 'Tug of War',
    category: 'team',
    arenaType: 'rope',
    playersOnField: 6,
    playersToRegister: 6,
    substitutes: 0,
    substitutionRules: 'No substitutions specified.',
    genderRequirement: {
      mandatoryMales: 4,
      mandatoryFemales: 2,
      notes: '6 per side: 4 males + 2 females mandatory.',
    },
    format: 'Team of 6 (4 males + 2 females)',
    duration: 'Variable per pull',
    gameplayRules: ['No stoppage once a game commences.'],
    trackableEvents: ['pull-start', 'pull-end', 'winner-side-a', 'winner-side-b'],
    stateFields: ['pullsWon', 'currentPull'],
    points: { win: 6, draw: 2, loss: 0 },
  },
  {
    id: 'relay-race',
    name: 'Relay Race',
    category: 'team',
    arenaType: 'track',
    playersOnField: 6,
    playersToRegister: 6,
    substitutes: 0,
    substitutionRules: 'No substitutions specified.',
    genderRequirement: {
      mandatoryMales: 4,
      mandatoryFemales: 2,
      notes: 'Team of 6: 4 males + 2 females.',
    },
    format: 'One to-and-fro round of cricket court · stump as baton',
    duration: 'Timed per team',
    officials:
      '2 referees per team — average of both times counted. Third ref at the far end verifies line crossings.',
    gameplayRules: [
      'Each runner runs between 2 lines on the ground.',
      'Each runner carries a stump to complete one round.',
      'Ref at far end checks if runner has crossed the line.',
      'Top two teams progress to finals.',
    ],
    tieBreakerRules: [
      'Each team is timed independently.',
      'Top two teams to run for finals.',
      'Ref’s decision is final.',
    ],
    trackableEvents: [
      'start-time', 'runner-1-leg', 'runner-2-leg', 'runner-3-leg',
      'runner-4-leg', 'runner-5-leg', 'runner-6-leg', 'finish-time',
    ],
    stateFields: ['startedAt', 'finishedAt', 'totalSeconds', 'ref1Seconds', 'ref2Seconds'],
    points: { win: 6, draw: 2, loss: 0 },
  },
  badmintonVariant('badminton-mixed-doubles', 'Mixed Doubles', 2, {
    mandatoryMales: 1,
    mandatoryFemales: 1,
    notes: '1 male + 1 female pair.',
  }),
  badmintonVariant('badminton-mens-doubles', "Men's Doubles", 2, {
    mandatoryMales: 2,
    notes: "Men's pair.",
  }),
  badmintonVariant('badminton-mens-singles', "Men's Singles", 1, {
    mandatoryMales: 1,
    notes: 'One male player.',
  }),
  badmintonVariant('badminton-womens-singles', "Women's Singles", 1, {
    mandatoryFemales: 1,
    notes: 'One female player.',
  }),
  ttVariant('tt-mixed-doubles', 'Mixed Doubles', 2, {
    mandatoryMales: 1,
    mandatoryFemales: 1,
    notes: '1 male + 1 female pair.',
  }),
  ttVariant('tt-mens-doubles', "Men's Doubles", 2, {
    mandatoryMales: 2,
    notes: "Men's pair.",
  }),
  ttVariant('tt-mens-singles', "Men's Singles", 1, {
    mandatoryMales: 1,
    notes: 'One male player.',
  }),
  ttVariant('tt-womens-singles', "Women's Singles", 1, {
    mandatoryFemales: 1,
    notes: 'One female player.',
  }),
  poolVariant('pool-singles', 'Singles', 1, null),
  poolVariant('pool-doubles', 'Doubles', 2, { notes: 'Pair can be either gender.' }),
  pickleballVariant('pickleball-singles', 'Singles', 1, null),
  pickleballVariant('pickleball-doubles', 'Doubles', 2, { notes: 'Pair can be either gender.' }),
];

// ─── Variant factories ────────────────────────────────────────────────
// Badminton, TT, Pool and Pickleball each have variants that share most
// fields with their parent. Defining them through factories keeps the data
// file under 300 lines without duplicating rule text.

function badmintonVariant(
  id: string,
  variantName: string,
  playersOnField: number,
  genderRequirement: SportDoc['genderRequirement'],
): StandardSport {
  return {
    id,
    name: `Badminton — ${variantName}`,
    category: 'racquet',
    parentCategory: 'Badminton',
    arenaType: 'court',
    playersOnField,
    playersToRegister: playersOnField,
    substitutes: 1,
    substitutionRules: 'Only 1 substitution allowed, in case of injury only.',
    genderRequirement,
    format: 'Best of 1 (knockouts + round robin) · Best of 3 (finals)',
    duration: '21 points (KO/RR) · 15 points × 3 (finals)',
    scoringRules: [
      '21 points single game in knockout and round robin stages.',
      'Final to be 15 point best of 3 games.',
      'Serving: Diagonal serve into opponent’s service box. Even score = right side, odd score = left side. One serve attempt only.',
      'Rotation: Serving team wins rally → score + switch sides + serve again. Lose → opponent gets serve.',
      'Faults: Shuttle out, hits net, touches floor, player touches net, or double hit/carry.',
      playersOnField === 1
        ? 'Singles uses inner side lines and back boundary. Shuttle landing on line = in.'
        : 'Doubles uses full court boundaries.',
    ],
    tieBreakerRules: ['Round robin ties: best difference in points scored vs conceded across all matches.'],
    trackableEvents: ['point-a', 'point-b', 'fault', 'let', 'service-change', 'game-end'],
    stateFields: ['scoreA', 'scoreB', 'currentGame', 'gamesA', 'gamesB', 'servingSide'],
    points: { win: 6, draw: 2, loss: 0 },
  };
}

function ttVariant(
  id: string,
  variantName: string,
  playersOnField: number,
  genderRequirement: SportDoc['genderRequirement'],
): StandardSport {
  const scoring = [
    'KO/RR: one set of 21 points with 5 serve rule.',
    'Finals: 3 sets of 21 points with 5 serve rule.',
    'Serve must bounce once on server’s side, once on opponent’s side.',
    'Ball must bounce once before being returned (no volleying).',
    'Edge balls = in. Side-only balls = out.',
  ];
  if (playersOnField === 2) {
    scoring.push('Doubles: teammates hit ball alternately — one player cannot hit consecutive shots.');
  }
  return {
    id,
    name: `Table Tennis — ${variantName}`,
    category: 'racquet',
    parentCategory: 'Table Tennis',
    arenaType: 'table',
    playersOnField,
    playersToRegister: playersOnField,
    substitutes: 0,
    genderRequirement,
    format: 'Single set (KO/RR) · Best of 3 (finals)',
    duration: '21 points with 5 serve rule',
    scoringRules: scoring,
    faultsList: [
      'Misses or fails to return the ball',
      'Lets the ball bounce twice',
      'Hits the ball before it bounces',
      'Serves incorrectly',
      'Touches the table with free hand',
      'Moves or shakes the table',
      'Obstructs the ball',
      'Hits the net and fails to cross over',
    ],
    tieBreakerRules: ['Round robin ties: best difference in points scored vs conceded.'],
    trackableEvents: ['point-a', 'point-b', 'fault', 'service-change', 'game-end'],
    stateFields: ['scoreA', 'scoreB', 'currentGame', 'gamesA', 'gamesB', 'servingSide'],
    points: { win: 6, draw: 2, loss: 0 },
  };
}

function poolVariant(
  id: string,
  variantName: string,
  playersOnField: number,
  genderRequirement: SportDoc['genderRequirement'],
): StandardSport {
  const scoring = [
    'Pot all balls in assigned group (solids/stripes) before attempting black ball.',
    'Player who legally pots black ball after clearing group wins.',
    'Break: must pot a ball OR drive at least 4 balls to the cushion.',
  ];
  if (playersOnField === 2) {
    scoring.push('Teammates play in alternate turns.');
    scoring.push('Player continues until they miss, foul, or lose turn.');
  }
  const faults = [
    'Pots the cue ball (scratch)',
    'Fails to hit own group first',
    'Fails to hit any ball',
    'Pots opponent’s ball illegally',
    'No ball touches a cushion after contact',
    'Pots black ball before clearing group',
    'Jumps the cue ball off the table',
    'Pots cue ball and black ball together',
    'Touches/moves balls accidentally',
    'Plays out of turn',
    'Both feet off floor while shooting',
    'Double-hits or pushes the cue ball',
  ];
  if (playersOnField === 2) {
    faults.push('Receives outside physical assistance during a shot');
  }
  return {
    id,
    name: `Pool — ${variantName}`,
    category: 'cue-sport',
    parentCategory: 'Pool',
    arenaType: 'table',
    playersOnField,
    playersToRegister: playersOnField,
    substitutes: 0,
    genderRequirement,
    format: '1-frame (KO/RR) · 3-frame finals',
    duration: 'Variable per frame',
    scoringRules: scoring,
    faultsList: faults,
    houseRules:
      'Black Ball: foul on black ball or scratch attempting it does NOT end game. Black must be legally potted in a later shot to win.',
    trackableEvents: ['frame-start', 'ball-potted', 'foul', 'scratch', 'frame-end', 'winner-a', 'winner-b'],
    stateFields:
      playersOnField === 2
        ? ['framesA', 'framesB', 'currentFrame', 'groupAssigned', 'currentPlayer']
        : ['framesA', 'framesB', 'currentFrame', 'groupAssigned'],
    points: { win: 5, draw: 2, loss: 0 },
  };
}

function pickleballVariant(
  id: string,
  variantName: string,
  playersOnField: number,
  genderRequirement: SportDoc['genderRequirement'],
): StandardSport {
  const scoring = [
    'Only the serving player/team scores points.',
    'Serves: underhand, hit diagonally into opponent’s service court.',
    'Server serves from right side on even score, left on odd.',
    'Double Bounce Rule: after serve, each side must let ball bounce once before volleying.',
    'Non-Volley Zone (Kitchen): cannot volley while standing inside kitchen or touching its line. Momentum into kitchen after volley = fault.',
  ];
  if (playersOnField === 2) {
    scoring.push(
      'Both players on a team get to serve before service passes (except game start, where only one player serves).',
    );
  }
  const faults = [
    'Hits ball out of bounds',
    'Hits the net',
    'Volleys in the kitchen',
    'Violates double bounce rule',
    'Misses the ball',
    'Serves incorrectly',
    'Touches net or post during play',
    'Hits ball before it crosses the net',
  ];
  if (playersOnField === 2) {
    faults.push('Wrong player serves or receives');
  }
  return {
    id,
    name: `Pickleball — ${variantName}`,
    category: 'racquet',
    parentCategory: 'Pickleball',
    arenaType: 'court',
    playersOnField,
    playersToRegister: playersOnField,
    substitutes: 0,
    genderRequirement,
    format: '1 set (KO/RR) · 3 frame finals',
    duration: '11 points',
    scoringRules: scoring,
    faultsList: faults,
    trackableEvents: ['point-a', 'point-b', 'fault', 'service-change', 'game-end'],
    stateFields:
      playersOnField === 2
        ? ['scoreA', 'scoreB', 'currentGame', 'framesA', 'framesB', 'servingSide', 'currentServer']
        : ['scoreA', 'scoreB', 'currentGame', 'framesA', 'framesB', 'servingSide'],
    points: { win: 5, draw: 2, loss: 0 },
  };
}
