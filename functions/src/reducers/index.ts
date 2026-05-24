/**
 * Server-side mirror of src/lib/matchReducers.ts. Keep in sync!
 *
 * The Firestore Admin SDK uses different Timestamp types, so the pure
 * reducer here works in plain millis-since-epoch.
 */

export type Side = 'A' | 'B';

export type PlainRefereeEvent = {
  type: string;
  side: Side | null;
  value: number | null;
  meta: Record<string, number | string | boolean> | null;
  atMillis: number;
  by: string;
  undone: boolean;
};

export type ReducedState = {
  scoreA: number;
  scoreB: number;
  clockSeconds: number;
  isRunning: boolean;
  /** Millis-since-epoch of the latest clock-start, or null. */
  clockStartedAtMs: number | null;
  period: number;
  extras: Record<string, number | string | boolean>;
};

export function empty(): ReducedState {
  return {
    scoreA: 0,
    scoreB: 0,
    clockSeconds: 0,
    isRunning: false,
    clockStartedAtMs: null,
    period: 1,
    extras: {},
  };
}

export function reduce(events: readonly PlainRefereeEvent[], sportId: string): ReducedState {
  const state = empty();

  for (const e of events) {
    if (e.undone) continue;

    if (e.type === 'clock-start') {
      if (!state.isRunning) {
        state.isRunning = true;
        state.clockStartedAtMs = e.atMillis;
      }
      continue;
    }
    if (e.type === 'clock-pause') {
      if (state.isRunning && state.clockStartedAtMs !== null) {
        state.clockSeconds += Math.max(0, Math.floor((e.atMillis - state.clockStartedAtMs) / 1000));
        state.isRunning = false;
        state.clockStartedAtMs = null;
      }
      continue;
    }
    if (e.type === 'clock-reset') {
      state.clockSeconds = 0;
      state.isRunning = false;
      state.clockStartedAtMs = null;
      continue;
    }
    if (e.type === 'period') {
      state.period = e.value && e.value > 0 ? e.value : state.period + 1;
      if (state.isRunning && state.clockStartedAtMs !== null) {
        state.clockSeconds += Math.max(0, Math.floor((e.atMillis - state.clockStartedAtMs) / 1000));
      }
      state.clockSeconds = 0;
      state.isRunning = false;
      state.clockStartedAtMs = null;
      continue;
    }

    applyScoring(state, e, sportId);
  }

  return state;
}

function applyScoring(state: ReducedState, e: PlainRefereeEvent, sportId: string): void {
  const side = e.side;
  const inc = (n: number): void => {
    if (side === 'A') state.scoreA += n;
    else if (side === 'B') state.scoreB += n;
  };

  switch (sportId) {
    case 'football':
    case 'futsal':
      if (e.type === 'goal') inc(1);
      return;

    case 'badminton':
    case 'squash':
    case 'tennis':
      if (e.type === 'goal') inc(1);
      else if (e.type === 'fault') {
        if (side === 'A') state.scoreB += 1;
        else if (side === 'B') state.scoreA += 1;
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
      if (e.type === 'goal') {
        if (side === 'A') {
          state.scoreA = 1;
          state.scoreB = 0;
        } else if (side === 'B') {
          state.scoreA = 0;
          state.scoreB = 1;
        }
      } else if (e.type === 'resign') {
        if (side === 'A') {
          state.scoreA = 0;
          state.scoreB = 1;
        } else if (side === 'B') {
          state.scoreA = 1;
          state.scoreB = 0;
        }
      } else if (e.type === 'draw-offer') {
        state.scoreA = 0.5;
        state.scoreB = 0.5;
      }
      return;
    }

    default:
      if (e.type === 'goal') inc(1);
  }
}
