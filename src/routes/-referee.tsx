import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Timestamp,
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TopBar } from '@/components/shared/TopBar';
import { Button } from '@/components/shared/Button';
import { Scoreboard } from '@/components/referee/Scoreboard';
import { MatchClock } from '@/components/referee/MatchClock';
import { PunchGrid } from '@/components/referee/PunchGrid';
import { EventLog } from '@/components/referee/EventLog';
import { MatchSwitcher, type SwitcherMatch } from '@/components/referee/MatchSwitcher';
import { useAuth } from '@/lib/auth';
import { useRole } from '@/lib/roles';
import { useActiveEvent } from '@/lib/activeEvent';
import {
  matchesCol,
  matchRef,
  refereeEventsCol,
  sportsCol,
  teamsCol,
} from '@/lib/db';
import type { MatchDoc, RefereeEventDoc, Side } from '@/types/match';
import type { SportDoc, TrackableEvent } from '@/types/sport';
import type { TeamDoc } from '@/types/player';

/** Resolve a team's display name + stored color (hex/slot) from a map.
 *  Falls back to the raw id and a neutral color when the team has been
 *  deleted, so we never invent a "Tridents" out of a ghost id. */
function resolveTeam(
  teamId: string,
  map: Map<string, TeamDoc>,
): { name: string; color: string } {
  const t = map.get(teamId);
  if (t) return { name: t.name, color: t.color };
  return { name: teamId, color: '' };
}


export default function RefereeScreen() {
  const auth = useAuth();
  const role = useRole();
  const { activeEventId, event: activeEvent } = useActiveEvent();
  const uid = auth.status === 'signedIn' ? auth.user.uid : null;
  const isAdmin = role.is('admin') || role.is('super-admin');

  // Initial pick: ?matchId= query param if present (Admin "Open Referee
  // Console →" link), else first assigned/live match.
  const initialMatchId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('matchId');
  }, []);

  // Live team directory for this event so we can resolve names + colors
  // for every match in the switcher and inside the referee panel without
  // each child component duplicating the read.
  const teams = useQuery({
    queryKey: ['referee', 'teams', activeEventId],
    enabled: !!activeEventId,
    queryFn: async (): Promise<Map<string, TeamDoc>> => {
      if (!activeEventId) return new Map();
      const snap = await getDocs(teamsCol(activeEventId));
      const m = new Map<string, TeamDoc>();
      for (const d of snap.docs) m.set(d.id, d.data());
      return m;
    },
  });
  const teamsMap = teams.data ?? new Map<string, TeamDoc>();

  // Sport name lookup for the switcher pill labels.
  const sportsList = useQuery({
    queryKey: ['referee', 'sports', activeEventId],
    enabled: !!activeEventId,
    queryFn: async (): Promise<Map<string, SportDoc>> => {
      if (!activeEventId) return new Map();
      const snap = await getDocs(sportsCol(activeEventId));
      const m = new Map<string, SportDoc>();
      for (const d of snap.docs) m.set(d.id, d.data());
      return m;
    },
  });
  const sportsMap = sportsList.data ?? new Map<string, SportDoc>();

  // Live subscription to the match list so the switcher status chip
  // (Sched / Live / Final) updates the moment a match's status changes,
  // not just on the next page load.
  const [myMatches, setMyMatches] = useState<SwitcherMatch[]>([]);
  const [myMatchesLoaded, setMyMatchesLoaded] = useState(false);
  useEffect(() => {
    if (!activeEventId || !uid) {
      setMyMatches([]);
      setMyMatchesLoaded(true);
      return;
    }
    setMyMatchesLoaded(false);
    const constraints = isAdmin
      ? [where('status', 'in', ['live', 'scheduled', 'final'])]
      : [where('refereeUids', 'array-contains', uid)];
    const q = query(matchesCol(activeEventId), ...constraints);
    return onSnapshot(
      q,
      (snap) => {
        const rows: SwitcherMatch[] = snap.docs.map((d) => {
          const data = d.data();
          const a = resolveTeam(data.teamAId, teamsMap);
          const b = resolveTeam(data.teamBId, teamsMap);
          const sp = sportsMap.get(data.sportId);
          return {
            id: d.id,
            teamAId: data.teamAId,
            teamBId: data.teamBId,
            teamAName: a.name,
            teamBName: b.name,
            teamAColor: a.color,
            teamBColor: b.color,
            sportId: data.sportId,
            sportName: sp?.name ?? data.sportId,
            matchNumber: data.matchNumber ?? null,
            status: data.status,
            scheduledStart: data.scheduledStart ?? null,
          };
        });
        // Ascending by scheduledStart; unscheduled go to the tail.
        rows.sort((x, y) => {
          const xt = x.scheduledStart?.toMillis() ?? Number.POSITIVE_INFINITY;
          const yt = y.scheduledStart?.toMillis() ?? Number.POSITIVE_INFINITY;
          return xt - yt;
        });
        setMyMatches(rows);
        setMyMatchesLoaded(true);
      },
      () => setMyMatchesLoaded(true),
    );
  }, [activeEventId, uid, isAdmin, teamsMap, sportsMap]);

  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (myMatches.length === 0) return;
    if (activeId && myMatches.some((m) => m.id === activeId)) return;
    setActiveId(initialMatchId ?? myMatches[0]?.id ?? null);
  }, [myMatches, activeId, initialMatchId]);

  if (auth.status === 'loading') {
    return (
      <>
        <TopBar title="Referee" />
        <main className="mx-auto max-w-[420px] px-5 pb-28">
          <p className="text-ink-dim">Loading…</p>
        </main>
      </>
    );
  }

  if (auth.status === 'signedOut') {
    return (
      <>
        <TopBar title="Referee" />
        <main className="mx-auto flex max-w-[420px] flex-col gap-3 px-5 pb-28">
          <p className="text-ink-dim">Sign in with your referee account.</p>
          <Link
            to="/login"
            className="rounded-2xl bg-accent px-4 py-3 text-center font-display text-base uppercase tracking-wide text-bg"
          >
            Sign in
          </Link>
        </main>
      </>
    );
  }

  if (!myMatchesLoaded) {
    return (
      <>
        <TopBar title="Referee" />
        <main className="mx-auto max-w-[420px] px-5 pb-28">
          <p className="text-ink-dim">Finding your matches…</p>
        </main>
      </>
    );
  }

  if (myMatches.length === 0) {
    return (
      <>
        <TopBar title="Referee" />
        <main className="mx-auto flex max-w-[420px] flex-col gap-3 px-5 pb-28">
          <p className="font-display text-2xl uppercase">No matches assigned</p>
          <p className="text-ink-dim">
            {isAdmin
              ? 'Create a match in the Admin → Matches tab and assign yourself as a referee.'
              : 'Ask an admin to assign you to a match.'}
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Referee" />
      <main className="mx-auto max-w-[420px] pb-28">
        <MatchSwitcher
          matches={myMatches}
          current={activeId ?? ''}
          onChange={setActiveId}
        />
        {activeId && activeEventId && (
          <RefereePanel
            matchId={activeId}
            eventId={activeEventId}
            meUid={uid!}
            teamsMap={teamsMap}
            isAdmin={isAdmin}
          />
        )}
        {activeEvent && (
          <p className="mx-5 mt-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            Event · {activeEvent.name}
          </p>
        )}
      </main>
    </>
  );
}

function RefereePanel({
  matchId,
  eventId,
  meUid,
  teamsMap,
  isAdmin,
}: {
  matchId: string;
  eventId: string;
  meUid: string;
  teamsMap: Map<string, TeamDoc>;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [events, setEvents] = useState<(RefereeEventDoc & { id: string })[]>([]);

  // Subscribe to the match doc.
  useEffect(() => {
    return onSnapshot(matchRef(eventId, matchId), (snap) => {
      setMatch(snap.exists() ? snap.data() : null);
    });
  }, [eventId, matchId]);

  // Subscribe to the events log.
  useEffect(() => {
    const q = query(refereeEventsCol(eventId, matchId), orderBy('at', 'asc'));
    return onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [eventId, matchId]);

  const sport = useQuery({
    queryKey: ['sport', eventId, match?.sportId],
    enabled: !!match?.sportId,
    queryFn: async (): Promise<SportDoc | null> => {
      if (!match?.sportId) return null;
      const all = await getDocs(sportsCol(eventId));
      const found = all.docs.find((d) => d.id === match.sportId);
      return found ? found.data() : null;
    },
  });

  // End / reopen mutations (declared before any early return to keep
  // React's hook order stable across renders).
  // endMatch takes an explicit winner so the referee can override the
  // auto-detected result before stopping the clock.
  const endMatch = useMutation({
    mutationFn: async (winnerTeamId: string | null) => {
      if (!match) throw new Error('Match not loaded yet.');
      await setDoc(
        matchRef(eventId, matchId),
        {
          status: 'final',
          winnerTeamId,
          endedAt: serverTimestamp(),
          state: { ...match.state, isRunning: false },
        },
        { merge: true },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referee'] });
    },
  });

  // Admin-only: change the winner on a final match without reopening.
  // The cloud-function awardPoints engine detects the winnerTeamId
  // change and applies the points delta to both teams' totalPoints.
  const changeWinner = useMutation({
    mutationFn: async (winnerTeamId: string | null) => {
      await setDoc(
        matchRef(eventId, matchId),
        { winnerTeamId },
        { merge: true },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referee'] });
    },
  });

  // Admin-only reopen: flip status back to live + clear winner +
  // pointsAwardedAt so awardPoints can run again when re-finalised.
  // (awardPoints is idempotent on pointsAwardedAt, so clearing it is
  // the explicit hand-off.)
  const reopenMatch = useMutation({
    mutationFn: async () => {
      await setDoc(
        matchRef(eventId, matchId),
        {
          status: 'live',
          winnerTeamId: null,
          pointsAwardedAt: null,
        },
        { merge: true },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referee'] });
    },
  });

  if (!match) {
    return <p className="px-5 text-ink-dim">Loading match…</p>;
  }

  // After the match is final the live-clock and punch grid are locked
  // (the match is over — no new events from those flows). The
  // scoreboard +/- buttons stay editable so referees and admins can
  // correct the final score post-stop.
  const matchFinal = match.status === 'final';
  const lockOps = matchFinal;
  const lockScore = false; // scoreboard remains editable always on this page

  const trackable = sport.data?.trackableEvents ?? (['goal'] as const);
  const isCricket = match.sportId === 'cricket';

  async function appendEvent(args: {
    type: TrackableEvent | 'clock-start' | 'clock-pause' | 'clock-reset' | 'period';
    side: Side | null;
    value: number | null;
    meta?: Record<string, number | string | boolean>;
  }) {
    await addDoc(refereeEventsCol(eventId, matchId), {
      type: args.type,
      side: args.side,
      value: args.value,
      meta: args.meta ?? null,
      at: serverTimestamp() as unknown as Timestamp,
      by: meUid,
      undone: false,
    });
  }

  async function undo(id: string) {
    await updateDoc(doc(refereeEventsCol(eventId, matchId), id), { undone: true });
  }

  async function nudgeScore(side: Side, delta: number) {
    // Optimistic local nudge so the scoreboard feels instant; cloud function
    // recomputes the canonical value from the events log.
    if (!match) return;
    const patch =
      side === 'A'
        ? { state: { ...match.state, scoreA: Math.max(0, match.state.scoreA + delta) } }
        : { state: { ...match.state, scoreB: Math.max(0, match.state.scoreB + delta) } };
    await setDoc(matchRef(eventId, matchId), patch, { merge: true });
    // Also write an event so the timeline reflects the change.
    if (delta > 0) {
      await appendEvent({ type: 'goal', side, value: null });
    }
  }

  const a = resolveTeam(match.teamAId, teamsMap);
  const b = resolveTeam(match.teamBId, teamsMap);

  return (
    <>
      <Scoreboard
        teamA={match.teamAId}
        teamB={match.teamBId}
        teamAName={a.name}
        teamBName={b.name}
        teamAColor={a.color}
        teamBColor={b.color}
        scoreA={match.state.scoreA}
        scoreB={match.state.scoreB}
        onAdd={(side) => void nudgeScore(side, 1)}
        onSubtract={(side) => void nudgeScore(side, -1)}
        disabled={lockScore}
      />

      <MatchClock
        state={match.state}
        disabled={lockOps}
        onStart={() => void appendEvent({ type: 'clock-start', side: null, value: null })}
        onPause={() => void appendEvent({ type: 'clock-pause', side: null, value: null })}
        onReset={() => void appendEvent({ type: 'clock-reset', side: null, value: null })}
        onNextPeriod={() =>
          void appendEvent({ type: 'period', side: null, value: match.state.period + 1 })
        }
      />

      <PunchGrid
        teamA={match.teamAId}
        teamB={match.teamBId}
        teamAName={a.name}
        teamBName={b.name}
        teamAColor={a.color}
        teamBColor={b.color}
        trackable={trackable}
        showRunButtons={isCricket}
        disabled={lockOps}
        onPunch={(type, side, value) =>
          void appendEvent({ type, side, value: typeof value === 'number' ? value : null })
        }
      />

      <EventLog
        events={events}
        teamA={match.teamAId}
        teamB={match.teamBId}
        teamAName={a.name}
        teamBName={b.name}
        meUid={meUid}
        onUndo={(id) => void undo(id)}
      />

      {/* Match-end controls. Pre-final: result picker (auto-detected
          from score, referee can override) + End Match button.
          Post-final: status pill, admin can change winner directly
          (cloud function handles the points delta), or fully reopen
          scoring for bigger corrections. */}
      <ResultPanel
        matchFinal={matchFinal}
        teamAId={match.teamAId}
        teamBId={match.teamBId}
        teamAName={a.name}
        teamBName={b.name}
        scoreA={match.state.scoreA}
        scoreB={match.state.scoreB}
        currentWinner={match.winnerTeamId}
        isAdmin={isAdmin}
        endPending={endMatch.isPending}
        changePending={changeWinner.isPending}
        reopenPending={reopenMatch.isPending}
        onEnd={(winnerTeamId) => endMatch.mutate(winnerTeamId)}
        onChangeWinner={(winnerTeamId) => changeWinner.mutate(winnerTeamId)}
        onReopen={() => reopenMatch.mutate()}
      />
      {(endMatch.error || changeWinner.error || reopenMatch.error) && (
        <p className="mx-5 mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-accent">
          {String(endMatch.error ?? changeWinner.error ?? reopenMatch.error)}
        </p>
      )}
    </>
  );
}

/**
 * Match-end / winner picker. Pre-final: lets the referee pick a winner
 * (defaulted to whatever the score suggests) and end the match.
 * Post-final: shows the recorded winner and, for admins, lets them
 * change it (delta is handled by the awardPoints Cloud Function) or
 * fully reopen the match for bigger corrections.
 */
function ResultPanel({
  matchFinal,
  teamAId,
  teamBId,
  teamAName,
  teamBName,
  scoreA,
  scoreB,
  currentWinner,
  isAdmin,
  endPending,
  changePending,
  reopenPending,
  onEnd,
  onChangeWinner,
  onReopen,
}: {
  matchFinal: boolean;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  currentWinner: string | null;
  isAdmin: boolean;
  endPending: boolean;
  changePending: boolean;
  reopenPending: boolean;
  onEnd: (winnerTeamId: string | null) => void;
  onChangeWinner: (winnerTeamId: string | null) => void;
  onReopen: () => void;
}) {
  // Auto-detected result from the live scoreboard.
  const auto: string | null =
    scoreA > scoreB ? teamAId : scoreB > scoreA ? teamBId : null;

  // Selected winner — defaults to the post-final stored value (after
  // the match ends) or the auto-detected result while live.
  const [selected, setSelected] = useState<string | null>(
    matchFinal ? currentWinner : auto,
  );

  // Keep the selection in sync when the underlying data changes (e.g.
  // referee nudged the score, or admin reopened the match). The
  // pre-final default tracks auto; post-final default tracks the
  // stored winner.
  useEffect(() => {
    setSelected(matchFinal ? currentWinner : auto);
    // Intentionally not depending on `selected` — we only re-sync when
    // the upstream truth changes, not when the user picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchFinal, currentWinner, auto]);

  const options: { id: string | null; label: string; sub?: string }[] = [
    { id: teamAId, label: teamAName, sub: `${scoreA}` },
    { id: null, label: 'Draw' },
    { id: teamBId, label: teamBName, sub: `${scoreB}` },
  ];

  const overrideHint =
    !matchFinal && selected !== auto
      ? 'Manual override · differs from the scoreboard result.'
      : null;

  // Post-final, non-admins read the result but can't change it.
  const canEdit = !matchFinal || isAdmin;

  return (
    <div className="mx-5 mt-4 flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        Result
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id ?? 'draw'}
              type="button"
              disabled={!canEdit}
              onClick={() => canEdit && setSelected(opt.id)}
              className="flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition active:scale-[0.99]"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--line)',
                background: active
                  ? 'color-mix(in oklab, var(--accent) 12%, transparent)'
                  : 'var(--bg-card)',
                color: active ? 'var(--accent)' : 'var(--ink)',
                cursor: canEdit ? 'pointer' : 'default',
                opacity: canEdit ? 1 : 0.85,
              }}
            >
              <span className="truncate font-display text-xs uppercase">
                {opt.label}
              </span>
              {opt.sub != null && (
                <span className="font-mono text-[10px] tracking-[0.06em] text-ink-dim">
                  {opt.sub}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {overrideHint && (
        <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-accent-3">
          {overrideHint}
        </p>
      )}

      {!matchFinal ? (
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={endPending}
            onClick={() => {
              const label =
                selected === null
                  ? 'Draw'
                  : `${selected === teamAId ? teamAName : teamBName} wins`;
              const msg =
                `End this match now?\n\n` +
                `Final score: ${teamAName} ${scoreA} — ${scoreB} ${teamBName}\n` +
                `Result: ${label}\n\n` +
                `Status flips to FINAL and the points engine awards team points.`;
              if (window.confirm(msg)) onEnd(selected);
            }}
            className="!w-full"
            style={{
              borderColor: 'color-mix(in oklab, var(--accent) 60%, transparent)',
              color: 'var(--accent)',
            }}
          >
            {endPending ? 'Ending…' : 'End Match'}
          </Button>
          <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
            Referee action — locks the clock and punch grid. +/- score
            stays editable for corrections after stopping.
          </p>
        </>
      ) : (
        <>
          <div
            className="rounded-xl border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{
              color: 'var(--accent-2)',
              borderColor: 'color-mix(in oklab, var(--accent-2) 40%, transparent)',
            }}
          >
            Ended · {teamAName} {scoreA} — {scoreB} {teamBName}
            {currentWinner
              ? ` · ${currentWinner === teamAId ? teamAName : teamBName} wins`
              : ' · Draw'}
          </div>
          {isAdmin && (
            <>
              <Button
                type="button"
                disabled={changePending || selected === currentWinner}
                onClick={() => {
                  const label =
                    selected === null
                      ? 'Draw'
                      : `${selected === teamAId ? teamAName : teamBName} wins`;
                  if (
                    window.confirm(
                      `Change the winner to "${label}"? The leaderboard will adjust automatically.`,
                    )
                  ) {
                    onChangeWinner(selected);
                  }
                }}
                className="!w-auto self-start !px-3 !py-1.5"
              >
                {changePending ? 'Saving…' : 'Change winner (admin)'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={reopenPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Reopen this match for editing? Status returns to LIVE and points will be re-awarded on the next End Match.`,
                    )
                  ) {
                    onReopen();
                  }
                }}
                className="!w-auto self-start !px-3 !py-1.5"
              >
                {reopenPending ? 'Reopening…' : 'Reopen scoring'}
              </Button>
            </>
          )}
          {!isAdmin && (
            <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
              Ask an admin to change the winner or reopen scoring.
            </p>
          )}
        </>
      )}
    </div>
  );
}
