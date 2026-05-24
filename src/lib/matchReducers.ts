/**
 * Pure per-sport reducers. Given a list of refereeEvents (filtered to
 * undone === false, sorted by `at` ASC), produce the match `state`.
 *
 * This file is INTENTIONALLY framework-free and Firestore-free. It is
 * duplicated in functions/src/reducers/index.ts — keep them in sync.
 *
 * Adding a new sport: add a case in `reduce()` that maps over the events
 * for that sport's `trackableEvents` vocabulary.
 */

import { emptyMatchState, type MatchState, type RefereeEventDoc } from '@/types/match';

/** A version of RefereeEventDoc with primitive timestamps (millis since epoch). */
export type PlainRefereeEvent = Omit<RefereeEventDoc, 'at'> & { atMillis: number };

export function reduce(events: readonly PlainRefereeEvent[], sportId: string): MatchState {
  // Universal first pass: clock + period bookkeeping applies to every sport.
  const state = emptyMatchState();
  // Strip the Timestamp typing for clockStartedAt — reducer outputs millis,
  // caller converts to Firestore Timestamp before persisting.
  let clockStartedAtMs: number | null = null;

  for (const e of events) {
    if (e.undone) continue;

    if (e.type === 'clock-start') {
      if (!state.isRunning) {
        state.isRunning = true;
        clockStartedAtMs = e.atMillis;
      }
      continue;
    }
    if (e.type === 'clock-pause') {
      if (state.isRunning && clockStartedAtMs !== null) {
        state.clockSeconds += Math.max(0, Math.floor((e.atMillis - clockStartedAtMs) / 1000));
        state.isRunning = false;
        clockStartedAtMs = null;
      }
      continue;
    }
    if (e.type === 'clock-reset') {
      state.clockSeconds = 0;
      state.isRunning = false;
      clockStartedAtMs = null;
      continue;
    }
    if (e.type === 'period') {
      state.period = e.value && e.value > 0 ? e.value : state.period + 1;
      // New period — pause and reset the clock by default.
      if (state.isRunning && clockStartedAtMs !== null) {
        state.clockSeconds += Math.max(0, Math.floor((e.atMillis - clockStartedAtMs) / 1000));
      }
      state.clockSeconds = 0;
      state.isRunning = false;
      clockStartedAtMs = null;
      continue;
    }

    // Sport-specific scoring.
    applyScoring(state, e, sportId);
  }

  // Encode the clock start hint as a millis-since-epoch number on `extras` so
  // the writer can convert to Timestamp. Avoids leaking Firestore types here.
  if (clockStartedAtMs !== null) {
    state.extras['_clockStartedAtMs'] = clockStartedAtMs;
  }
  return state;
}

function applyScoring(state: MatchState, e: PlainRefereeEvent, sportId: string): void {
  const side = e.side;
  const inc = (n: number) => {
    if (side === 'A') state.scoreA += n;
    else if (side === 'B') state.scoreB += n;
  };

  // Per-sport scoring.
  switch (sportId) {
    case 'football':
    case 'futsal':
      // 1 goal = 1 score. Cards & fouls don't affect score.
      if (e.type === 'goal') inc(1);
      return;

    case 'badminton':
    case 'squash':
    case 'tennis':
      // Every "point", "let" win, or service-change in favor scores 1.
      // In our vocabulary the referee taps a rally winner as a 'goal' event
      // on the appropriate side (kept generic so the punch grid is simple).
      if (e.type === 'goal' || e.type === 'fault') {
        // 'fault' from the OPPOSITE side credits the OTHER side's score.
        if (e.type === 'fault') {
          if (side === 'A') state.scoreB += 1;
          else if (side === 'B') state.scoreA += 1;
        } else {
          inc(1);
        }
      }
      return;

    case 'cricket': {
      if (e.type === 'run') inc(typeof e.value === 'number' ? e.value : 1);
      if (e.type === 'boundary') inc(4);
      if (e.type === 'six') inc(6);
      if (e.type === 'wide' || e.type === 'no-ball' || e.type === 'bye') inc(1);
      if (e.type === 'wicket') {
        const wkey = side === 'A' ? 'wicketsA' : 'wicketsB';
        const prev = Number(state.extras[wkey] ?? 0);
        state.extras[wkey] = prev + 1;
      }
      return;
    }

    case 'chess': {
      // Result-only sport. The referee taps a 'goal' on the winning side or
      // a 'draw-offer' meaning agreed draw → both scores set to 0.5.
      if (e.type === 'goal') {
        if (side === 'A') {
          state.scoreA = 1;
          state.scoreB = 0;
        } else if (side === 'B') {
          state.scoreA = 0;
          state.scoreB = 1;
        }
      } else if (e.type === 'draw-offer' || e.type === 'resign') {
        // 'resign' on a side gives the win to the OTHER side.
        if (e.type === 'resign') {
          if (side === 'A') {
            state.scoreA = 0;
            state.scoreB = 1;
          } else if (side === 'B') {
            state.scoreA = 1;
            state.scoreB = 0;
          }
        } else {
          state.scoreA = 0.5;
          state.scoreB = 0.5;
        }
      }
      return;
    }

    default:
      // Generic fallback: every `goal` counts as 1.
      if (e.type === 'goal') inc(1);
  }
}

/**
 * Decide a winner for a finalized match. Returns side 'A' / 'B' or null for
 * draw. Pure — does not look at points config.
 */
export function decideWinner(state: MatchState): 'A' | 'B' | null {
  if (state.scoreA > state.scoreB) return 'A';
  if (state.scoreB > state.scoreA) return 'B';
  return null;
}
