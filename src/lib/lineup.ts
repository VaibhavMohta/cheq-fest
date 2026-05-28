import type { TeamId } from '@/types/team';

export const BUCKETS = ['pitch', 'tentative', 'substitutes', 'notPlaying'] as const;
export type BucketId = (typeof BUCKETS)[number];

export const BUCKET_LABEL: Record<BucketId, string> = {
  pitch: 'On The Pitch',
  tentative: 'Tentative',
  substitutes: 'Substitutes',
  notPlaying: 'Not Playing',
};

export const BUCKET_ACCENT: Record<BucketId, string> = {
  pitch: 'var(--accent)',
  tentative: 'var(--accent-2)',
  substitutes: 'var(--accent-3)',
  notPlaying: 'var(--ink-dim)',
};

export type LineupPlayer = {
  uid: string;
  name: string;
  initials?: string;
  teamId: TeamId;
  /** True if this player is the Sport Captain for the current (sport, team).
   *  Locks the tile in the Pitch bucket. */
  isCaptain: boolean;
  /** True if this player is the Group Captain of the team (independent of
   *  sport). Drives a gold "C" badge in the lineup view. */
  isGroupCaptain?: boolean;
  /** Optional sport-cap role, only relevant in lineup display. */
  sportCapOf?: string;
  googlePhotoUrl?: string | null;
  adminPhotoUrl?: string | null;
};

export type LineupState = Record<BucketId, string[]>; // uid arrays per bucket

export type LineupSport = {
  id: string;
  name: string;
  /** Max number of players in the `pitch` bucket. */
  playersOnField: number;
  /** Max number of players in the `substitutes` bucket. Soft cap (warn only). */
  substitutes: number;
  /** Format display string, e.g. "5-a-side · 2 × 15 min". */
  format: string;
};

export type DropDecision =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Pure validator. Decides whether dragging `player` from `from` to `to` is
 * allowed, given the current lineup state and the sport's caps.
 *
 * Rules:
 *  - The captain stays on the pitch — every other move is rejected.
 *  - Moving INTO `pitch` is rejected if the bucket is already at
 *    `sport.playersOnField` (and the source isn't already `pitch`).
 *  - Reordering within the same bucket is a no-op (caller handles).
 */
export function canDrop(args: {
  player: LineupPlayer;
  from: BucketId;
  to: BucketId;
  state: LineupState;
  sport: LineupSport;
}): DropDecision {
  const { player, from, to, state, sport } = args;
  if (from === to) return { ok: true };
  if (player.isCaptain && to !== 'pitch') {
    return { ok: false, reason: 'Captain stays on the pitch.' };
  }
  if (to === 'pitch' && state.pitch.length >= sport.playersOnField) {
    return { ok: false, reason: `Pitch is full (${sport.playersOnField}).` };
  }
  return { ok: true };
}

/** Returns a NEW state with `uid` moved from `from` to `to`. */
export function applyMove(
  state: LineupState,
  uid: string,
  from: BucketId,
  to: BucketId,
): LineupState {
  if (from === to) return state;
  return {
    ...state,
    [from]: state[from].filter((u) => u !== uid),
    [to]: [...state[to], uid],
  };
}

/** Finds which bucket a uid currently lives in, or null if none. */
export function findBucket(state: LineupState, uid: string): BucketId | null {
  for (const b of BUCKETS) {
    if (state[b].includes(uid)) return b;
  }
  return null;
}
