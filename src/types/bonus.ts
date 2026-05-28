import type { Timestamp } from 'firebase/firestore';
import type { TeamId } from './team';

/**
 * Discretionary "bonus" point grant — independent of match results.
 * Awarded directly by Admin / Super Admin from the Points tab; surfaces
 * in the leaderboard alongside match-derived points.
 *
 * Lives at `events/{eventId}/bonusAwards/{autoId}`.
 *
 * Server gating (firestore.rules):
 *  - read: public (mirrors the rest of the event tree)
 *  - write (create / update / delete): admin claim only
 */
export type BonusAwardDoc = {
  /** Team that receives the points. */
  teamId: TeamId;
  /** Awarded points. Can be negative (penalty / deduction). */
  points: number;
  /** Free-form reason / category (e.g. "Spirit award", "Late arrival"). */
  reason: string;
  /** Optional sub-label so admins can group awards (e.g. "Sportsmanship",
   *  "Discipline"). Falls back to reason in the UI when empty. */
  category?: string | null;
  awardedAt: Timestamp;
  awardedByUid: string;
  awardedByEmail: string;
};
