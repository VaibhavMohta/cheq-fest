import { firestore } from 'firebase-functions/v1';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

type PointsTriple = { win: number; draw: number; loss: number };
type MatchData = {
  status?: string;
  sportId?: string;
  teamAId?: string;
  teamBId?: string;
  winnerTeamId?: string | null;
  pointsAwardedAt?: Timestamp | null;
  round?: string | null;
  points?: PointsTriple | null;
};

/**
 * Points engine. Handles two cases on a match update:
 *
 *   1. First-time award — status flips to 'final' and pointsAwardedAt is
 *      empty. Awards both teams in a single transaction, then stamps
 *      pointsAwardedAt.
 *
 *   2. Post-final winner change — status stays 'final' but winnerTeamId
 *      differs between before/after. Recomputes both teams' awards and
 *      applies the *delta* via FieldValue.increment so totalPoints stays
 *      consistent. pointsAwardedAt is left untouched (it stamps "when
 *      this match first finalised", not the last edit).
 *
 * Idempotent — duplicate triggers don't double-award (case 1 short-
 * circuits on pointsAwardedAt; case 2 is a no-op when winnerTeamId is
 * unchanged).
 */
export const awardPoints = firestore
  .document('events/{eventId}/matches/{matchId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data() as MatchData;
    const after = change.after.data() as MatchData;

    if (after.status !== 'final') return;
    if (!after.sportId || !after.teamAId || !after.teamBId) return;

    const justFinalized = before.status !== 'final' && !after.pointsAwardedAt;
    const winnerChanged =
      before.status === 'final' &&
      (before.winnerTeamId ?? null) !== (after.winnerTeamId ?? null);
    if (!justFinalized && !winnerChanged) return;

    const db = getFirestore();
    const eventId = ctx.params.eventId;

    const sportSnap = await db.doc(`events/${eventId}/sports/${after.sportId}`).get();
    if (!sportSnap.exists) {
      logger.warn('Cannot award points: sport doc missing', {
        sportId: after.sportId,
        matchId: ctx.params.matchId,
      });
      return;
    }
    const sportData = sportSnap.data() as {
      points?: PointsTriple;
      tournament?: { roundPoints?: Record<string, PointsTriple> } | null;
    };
    const defaults = sportData.points ?? { win: 3, draw: 1, loss: 0 };
    // Lookup chain (highest priority first):
    //   1. match.points  (per-match override set on the Matches tab)
    //   2. sport.tournament.roundPoints[match.round] (per-round override)
    //   3. sport.points  (sport default)
    const roundOverride = after.round
      ? sportData.tournament?.roundPoints?.[after.round]
      : undefined;
    const matchOverride = after.points ?? undefined;
    const points: PointsTriple = {
      win: matchOverride?.win ?? roundOverride?.win ?? defaults.win,
      draw: matchOverride?.draw ?? roundOverride?.draw ?? defaults.draw,
      loss: matchOverride?.loss ?? roundOverride?.loss ?? defaults.loss,
    };

    const award = (winner: string | null | undefined) => ({
      a: winner === after.teamAId ? points.win : winner == null ? points.draw : points.loss,
      b: winner === after.teamBId ? points.win : winner == null ? points.draw : points.loss,
    });
    const fresh = award(after.winnerTeamId);

    const teamARef = db.doc(`events/${eventId}/teams/${after.teamAId}`);
    const teamBRef = db.doc(`events/${eventId}/teams/${after.teamBId}`);
    const matchRef = change.after.ref;

    if (justFinalized) {
      await db.runTransaction(async (tx) => {
        // Re-check in transaction so a duplicate trigger can't double-award.
        const m = await tx.get(matchRef);
        if (m.data()?.pointsAwardedAt) return;
        tx.set(teamARef, { totalPoints: FieldValue.increment(fresh.a) }, { merge: true });
        tx.set(teamBRef, { totalPoints: FieldValue.increment(fresh.b) }, { merge: true });
        tx.update(matchRef, { pointsAwardedAt: FieldValue.serverTimestamp() });
      });
      logger.info('Awarded points (first-time)', {
        matchId: ctx.params.matchId,
        round: after.round ?? null,
        winner: after.winnerTeamId ?? null,
        teamAPoints: fresh.a,
        teamBPoints: fresh.b,
      });
      return;
    }

    // Winner changed while still final — apply the delta from old → new.
    const prev = award(before.winnerTeamId);
    const deltaA = fresh.a - prev.a;
    const deltaB = fresh.b - prev.b;
    if (deltaA === 0 && deltaB === 0) return;
    await db.runTransaction(async (tx) => {
      tx.set(teamARef, { totalPoints: FieldValue.increment(deltaA) }, { merge: true });
      tx.set(teamBRef, { totalPoints: FieldValue.increment(deltaB) }, { merge: true });
    });
    logger.info('Adjusted points (winner change)', {
      matchId: ctx.params.matchId,
      from: before.winnerTeamId ?? null,
      to: after.winnerTeamId ?? null,
      deltaA,
      deltaB,
    });
  });
