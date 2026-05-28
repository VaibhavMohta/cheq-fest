export const ARENA_TYPES = [
  'field', // open multi-player playing area (cricket)
  'court', // rectangular ruled court with a net (badminton, pickleball)
  'pitch', // football-style pitch with goal areas
  'board', // chess-style board game
  'table', // small surface with a net or felt (table tennis, pool)
  'rope', // tug-of-war rope between two teams
  'track', // straight-line / oval running track (relay)
] as const;
export type ArenaType = (typeof ARENA_TYPES)[number];

/** Points awarded per match outcome for a sport. */
export type SportPoints = {
  win: number;
  draw: number;
  loss: number;
};

/**
 * Recommended fixed vocabulary of trackable events the referee console knows
 * how to render out of the box. New sports MAY use custom event names beyond
 * this list (e.g. `run-4`, `frame-start`) — the referee UI will fall back to
 * a generic button for any unrecognised event.
 */
export const TRACKABLE_EVENT_VOCAB = [
  'goal',
  'run',
  'wicket',
  'boundary',
  'six',
  'wide',
  'no-ball',
  'bye',
  'yellow',
  'red',
  'foul',
  'sub',
  'let',
  'fault',
  'service-change',
  'move',
  'draw-offer',
  'resign',
  'timeout',
] as const;

/** A trackable event is any string — the standard list above is the
 *  recommended palette but per-sport custom events are allowed. */
export type TrackableEvent = string;

export type Confidence = 'high' | 'low' | 'missing';

export const SPORT_CATEGORIES = ['team', 'racquet', 'cue-sport'] as const;
export type SportCategory = (typeof SPORT_CATEGORIES)[number];

/** Gender requirements on the field. All fields optional. */
export type GenderRequirement = {
  mandatoryMales?: number;
  mandatoryFemales?: number;
  notes?: string;
};

/**
 * Full sport definition. The original 4-field shape (name, playersOnField,
 * substitutes, duration, format, points, trackableEvents, arenaType) is still
 * here at the top — everything new is optional, so existing data + the simple
 * "manual sport add" flow keep working.
 *
 * The richer fields (scoringRules, bowlingRules, etc.) are populated by the
 * AI rulebook parser and by the "Import 16 standard sports" seed action.
 * Admins can override anything in the SportsTab editor.
 */
export type SportDoc = {
  // ── Core ────────────────────────────────────────────────────────────
  name: string;
  arenaType: ArenaType;
  playersOnField: number;
  substitutes: number;
  duration: string;
  format: string;
  points: SportPoints;
  trackableEvents: TrackableEvent[];

  // ── Categorisation ──────────────────────────────────────────────────
  /** Broad bucket — drives any grouped views (e.g. "all racquet sports"). */
  category?: SportCategory;
  /** Display group for variants — e.g. Badminton Mixed Doubles, Men's Doubles,
   *  etc. all share parentCategory: "Badminton". */
  parentCategory?: string;

  // ── Squad shape ─────────────────────────────────────────────────────
  /** Total players each team must register (subs included). Falls back to
   *  playersOnField + substitutes when not specified. */
  playersToRegister?: number;
  substitutionRules?: string;
  genderRequirement?: GenderRequirement | null;

  // ── Schedule / format extras ────────────────────────────────────────
  overSchedule?: string;
  officials?: string;

  // ── Rule lists (free-form, displayed as bullet lists) ───────────────
  scoringRules?: string[];
  bowlingRules?: string[];
  fieldingRules?: string[];
  gameplayRules?: string[];
  faultsList?: string[];
  tieBreakerRules?: string[];
  houseRules?: string;

  // ── Live-match state shape (used by the referee console reducer) ────
  /** Match-state keys this sport tracks. Lets the referee console show only
   *  the relevant counters and lets the reducer ignore irrelevant fields. */
  stateFields?: string[];

  // ── Provenance ──────────────────────────────────────────────────────
  /** Per-field AI confidence after a rulebook parse. */
  aiConfidence?: Record<string, Confidence>;

  // ── Tournament structure (all optional) ─────────────────────────────
  /** Per-sport groups + rounds. `null` / missing = flat list (the
   *  classic behaviour). Each sport defines its own groups; football's
   *  Group A is unrelated to cricket's Group A. */
  tournament?: TournamentConfig | null;
};

/** Per-sport tournament setup. Groups + rounds are independent; admin
 *  picks how to combine them when creating matches (or via the
 *  round-robin generator). */
export type TournamentConfig = {
  /** Group definitions. Stable `id` (e.g. "A", "B") so match docs
   *  reference it without coupling to the display name. */
  groups: TournamentGroup[];
  /** Ordered round labels — purely cosmetic tags on the match doc.
   *  Defaults `["Group", "QF", "SF", "F"]` when first created. */
  rounds: string[];
  /** Optional per-round point overrides. Keyed by round label (e.g.
   *  "F", "SF"). When present, `pointsForMatch` uses the override
   *  for any match tagged with that round; a per-match override on
   *  the MatchDoc still beats this. Stored as full `SportPoints`
   *  triples to match what PointsTab writes; the resolver in
   *  `lib/tournament.ts` still tolerates partials defensively. */
  roundPoints?: Record<string, SportPoints>;
};

export type TournamentGroup = {
  id: string;
  name: string;
  /** Team ids that participate in this group. */
  teamIds: string[];
  /** How the matches inside this group should be generated.
   *  - 'round-robin': every pair plays once (default).
   *  - 'knockout':    first-round only; pairs adjacent teams from
   *                   `teamIds`. Admin orders the list to control
   *                   seedings and advances winners manually. */
  format?: 'round-robin' | 'knockout';
};

export function defaultSport(name: string): SportDoc {
  return {
    name,
    arenaType: 'field',
    playersOnField: 5,
    substitutes: 3,
    duration: '',
    format: '',
    points: { win: 3, draw: 1, loss: 0 },
    trackableEvents: [],
  };
}
