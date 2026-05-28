import type { Timestamp } from 'firebase/firestore';
import type { TrackableEvent } from './sport';
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
  sportId: string;
  teamAId: TeamId;
  teamBId: TeamId;
  scheduledStart: Timestamp | null;
  venue: string;
  refereeUids: string[];
  state: MatchState;
  status: MatchStatus;
  /** Set when status flips to 'final'. null = draw. */
  winnerTeamId: TeamId | null;
  pointsAwardedAt: Timestamp | null;
  createdAt: Timestamp | null;
  /** Optional tournament tags. `null` = ungrouped / unlabelled (the
   *  classic flat-list behaviour). Set when admin defines groups/rounds
   *  on the sport. */
  group: string | null;
  round: string | null;
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
