import { firestore } from 'firebase-functions/v1';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * Points engine. When a match transitions to `status: 'final'`, award team
 * points in a single transaction. Idempotent: pointsAwardedAt is set on the
 * match doc; if it's already populated, this is a no-op.
 */
export const awardPoints = firestore
  .document('events/{eventId}/matches/{matchId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data() as { status?: string };
    const after = change.after.data() as {
      status?: string;
      sportId?: string;
      teamAId?: string;
      teamBId?: string;
      winnerTeamId?: string | null;
      pointsAwardedAt?: Timestamp | null;
    };

    if (after.status !== 'final') return;
    if (before.status === 'final') return;
    if (after.pointsAwardedAt) return; // already awarded
    if (!after.sportId || !after.teamAId || !after.teamBId) return;

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
    const points = (sportSnap.data() as { points?: { win: number; draw: number; loss: number } })
      .points ?? { win: 3, draw: 1, loss: 0 };

    const winner = after.winnerTeamId ?? null;
    const teamAPoints = winner === after.teamAId ? points.win : winner === null ? points.draw : points.loss;
    const teamBPoints = winner === after.teamBId ? points.win : winner === null ? points.draw : points.loss;

    const teamARef = db.doc(`events/${eventId}/teams/${after.teamAId}`);
    const teamBRef = db.doc(`events/${eventId}/teams/${after.teamBId}`);
    const matchRef = change.after.ref;

    await db.runTransaction(async (tx) => {
      // Re-check in transaction so a duplicate trigger can't double-award.
      const fresh = await tx.get(matchRef);
      if (fresh.data()?.pointsAwardedAt) return;

      tx.set(teamARef, { totalPoints: FieldValue.increment(teamAPoints) }, { merge: true });
      tx.set(teamBRef, { totalPoints: FieldValue.increment(teamBPoints) }, { merge: true });
      tx.update(matchRef, {
        pointsAwardedAt: FieldValue.serverTimestamp(),
      });
    });

    logger.info('Awarded points', {
      matchId: ctx.params.matchId,
      winner,
      teamAPoints,
      teamBPoints,
    });
  });
