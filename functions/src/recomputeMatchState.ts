import { firestore } from 'firebase-functions/v1';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { reduce, type PlainRefereeEvent } from './reducers';

/**
 * On any write to refereeEvents/* for a match, recompute the match state.
 *
 * Pulls every event for the match, runs the pure reducer, and writes the
 * resulting `state` back. Idempotent — re-running yields the same result.
 */
export const recomputeMatchState = firestore
  .document('events/{eventId}/matches/{matchId}/refereeEvents/{evtId}')
  .onWrite(async (_change, ctx) => {
    const { eventId, matchId } = ctx.params;
    const db = getFirestore();

    const matchRef = db.doc(`events/${eventId}/matches/${matchId}`);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      logger.warn('Recompute skipped: match missing', { eventId, matchId });
      return;
    }
    const match = matchSnap.data() as { sportId: string };

    const eventsSnap = await db
      .collection(`events/${eventId}/matches/${matchId}/refereeEvents`)
      .orderBy('at', 'asc')
      .get();

    const events: PlainRefereeEvent[] = eventsSnap.docs.map((d) => {
      const data = d.data();
      const at = data['at'] as Timestamp | undefined;
      return {
        type: String(data['type'] ?? ''),
        side: (data['side'] as PlainRefereeEvent['side']) ?? null,
        value: typeof data['value'] === 'number' ? data['value'] : null,
        meta: (data['meta'] as PlainRefereeEvent['meta']) ?? null,
        atMillis: at ? at.toMillis() : 0,
        by: String(data['by'] ?? ''),
        undone: data['undone'] === true,
      };
    });

    const reduced = reduce(events, match.sportId);

    await matchRef.update({
      state: {
        scoreA: reduced.scoreA,
        scoreB: reduced.scoreB,
        clockSeconds: reduced.clockSeconds,
        isRunning: reduced.isRunning,
        clockStartedAt:
          reduced.clockStartedAtMs !== null
            ? Timestamp.fromMillis(reduced.clockStartedAtMs)
            : null,
        period: reduced.period,
        extras: reduced.extras,
      },
    });

    logger.debug('Recomputed match state', {
      matchId,
      score: `${reduced.scoreA}-${reduced.scoreB}`,
      period: reduced.period,
    });
  });
