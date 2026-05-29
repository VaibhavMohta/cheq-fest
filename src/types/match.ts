import type { Timestamp } from 'firebase/firestore';
import type { AdvancedSlot, TrackableEvent } from './sport';
import type { TeamId } from './team';

export const MATCH_STATUSES = ['scheduled', 'live', 'final'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export type Side = 'A' | 'B';

/**
 * The denormalized live state of a match. Computed by Cloud Function from
 * the refereeEvents log; clients read this (plus the events feed for the
 * activity timeline) but never write directly.
 */
export type MatchState = {
  scoreA: number;
  scoreB: number;
  /** Accumulated clock seconds at the last pause. */
  clockSeconds: number;
  /** When `isRunning`, the clock counts up from clockStartedAt. */
  isRunning: boolean;
  clockStartedAt: Timestamp | null;
  /** Half (football), game (badminton), innings (cricket). 1-based. */
  period: number;
  // Sport-specific extras (cricket); free-form to allow new sports without
  // schema changes. Reducer owns the keys.
  extras: Record<string, number | string | boolean>;
};

export type MatchDoc = {
  /** Sequential per-event match number assigned on creation (#1, #2, ...).
   *  Used as the human-friendly handle across screens. Optional for
   *  back-compat with matches created before this field existed — a
   *  client-side backfill runs in MatchesTab to fill them in. */
  matchNumber?: number | null;
  sportId: string;
  teamAId: TeamId;
  teamBId: TeamId;
  scheduledStart: Timestamp | null;
  venue: string;
  refereeUids: string[];
  state: MatchState;
  status: MatchStatus;
  /** Optional per-match W/D/L override. Top of the lookup chain — takes
   *  precedence over the per-round override and the sport default.
   *  Admin sets this on the Matches tab while fixing the fixture so a
   *  Final win can be worth 50 even if the per-round override is 10. */
  points?: { win: number; draw: number; loss: number } | null;
  /** Set when status flips to 'final'. null = draw. */
  winnerTeamId: TeamId | null;
  pointsAwardedAt: Timestamp | null;
  /** Server timestamp set when the End Match action flips status to 'final'. */
  endedAt?: Timestamp | null;
  createdAt: Timestamp | null;
  /** Optional tournament tags. `null` = ungrouped / unlabelled (the
   *  classic flat-list behaviour). Set when admin defines groups/rounds
   *  on the sport. */
  group: string | null;
  round: string | null;
  /** Per-match format tag. Independent of the bracket so admins can
   *  label one-off matches as knockout / round-robin even when the
   *  sport has no full bracket configured. */
  matchType?: 'round-robin' | 'knockout' | null;
  // ── Bracket linkage (all optional) ──────────────────────────────
  /** Stable bracket-stage id this match belongs to (e.g. 'group',
   *  'qf', 'sf', 'f'). Mirrors the bracket model on the sport doc. */
  stageId?: string | null;
  /** Stable bracket-group id within the stage (e.g. 'A', 'QF1', 'F').
   *  Mirrors `group` for legacy code that filters on the flat tag. */
  groupId?: string | null;
  /** Placeholder slot for the home team when the bracket hasn't
   *  resolved a real teamId yet. `teamAId` is the empty string until
   *  the slot resolves. Once resolved, this is cleared. */
  teamASlot?: AdvancedSlot | null;
  teamBSlot?: AdvancedSlot | null;
  /** True when an admin manually picked a teamA/B that differs from
   *  the bracket-resolved slot. Auto-advance leaves this match
   *  untouched so the override sticks even if the upstream winner
   *  changes. */
  manuallyResolved?: boolean | null;
};

export type RefereeEventDoc = {
  type: TrackableEvent | 'clock-start' | 'clock-pause' | 'clock-reset' | 'period';
  side: Side | null; // some events (clock, period) don't belong to a side
  /** Optional numeric value (e.g. cricket runs, or the new period number). */
  value: number | null;
  /** Free-form payload for sport-specific reducer hints. */
  meta: Record<string, number | string | boolean> | null;
  at: Timestamp;
  by: string; // referee uid
  undone: boolean;
};

export function emptyMatchState(): MatchState {
  return {
    scoreA: 0,
    scoreB: 0,
    clockSeconds: 0,
    isRunning: false,
    clockStartedAt: null,
    period: 1,
    extras: {},
  };
}

/** Format `state.clockSeconds + live delta` as "M:SS". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
