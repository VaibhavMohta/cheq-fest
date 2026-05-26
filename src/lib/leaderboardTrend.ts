/**
 * Lightweight rank-change tracker. Captures a snapshot of every team's
 * rank the first time the leaderboard loads for an event in this session
 * (or after a manual reset), then exposes a `trendFor(teamId)` that
 * returns `baselineRank - currentRank` so positive = climbed, negative =
 * dropped, zero = no change. Persisted via localStorage so it survives
 * page refreshes within the same baseline window.
 *
 * No backend, no scheduled function — admin hits "Reset trend" at the
 * start of each day (or session) to re-baseline. A full daily-snapshot
 * pipeline is the planned Phase 2 if we need cross-session diffs.
 */
import { useEffect, useMemo, useState } from 'react';

type Baseline = Record<string, number>; // teamId → rank

function storageKey(eventId: string | null): string | null {
  return eventId ? `cheq-fest:leaderboardBaseline:${eventId}` : null;
}

function loadBaseline(eventId: string | null): Baseline | null {
  const key = storageKey(eventId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Baseline;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveBaseline(eventId: string | null, value: Baseline): void {
  const key = storageKey(eventId);
  if (!key || typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function clearBaselineStorage(eventId: string | null): void {
  const key = storageKey(eventId);
  if (!key || typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

export function useLeaderboardTrend(
  eventId: string | null,
  ranked: { id: string; rank: number }[],
): {
  /** Positive = climbed, negative = dropped, 0 = no change or no baseline. */
  trendFor: (teamId: string) => number;
  /** Clears the baseline so the next render re-captures. */
  resetBaseline: () => void;
  /** True once a baseline has been captured for this event. */
  hasBaseline: boolean;
} {
  // Tracks whatever we've persisted for this event. `null` until first
  // load attempt completes so we don't render a stale baseline from a
  // different event between renders.
  const [baseline, setBaseline] = useState<Baseline | null>(() =>
    loadBaseline(eventId),
  );

  // Re-hydrate when the active event changes.
  useEffect(() => {
    setBaseline(loadBaseline(eventId));
  }, [eventId]);

  // Capture the baseline once we have actual rankings AND there's no
  // baseline yet. Storing in localStorage too so it survives refreshes.
  useEffect(() => {
    if (!eventId || ranked.length === 0) return;
    if (baseline !== null) return;
    const next: Baseline = {};
    for (const { id, rank } of ranked) next[id] = rank;
    saveBaseline(eventId, next);
    setBaseline(next);
  }, [eventId, ranked, baseline]);

  const currentByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const { id, rank } of ranked) m.set(id, rank);
    return m;
  }, [ranked]);

  const trendFor = (teamId: string): number => {
    if (!baseline) return 0;
    const before = baseline[teamId];
    const after = currentByTeam.get(teamId);
    if (before === undefined || after === undefined) return 0;
    return before - after; // climbed (lower rank number) → positive
  };

  const resetBaseline = (): void => {
    clearBaselineStorage(eventId);
    setBaseline(null);
  };

  return { trendFor, resetBaseline, hasBaseline: baseline !== null };
}
