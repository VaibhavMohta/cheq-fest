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
import { TopBar } from '@/components/shared/TopBar';
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
} from '@/lib/db';
import type { MatchDoc, RefereeEventDoc, Side } from '@/types/match';
import type { SportDoc, TrackableEvent } from '@/types/sport';


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

  const myMatches = useQuery({
    queryKey: ['referee', 'myMatches', uid, isAdmin, activeEventId],
    enabled: !!uid && !!activeEventId,
    queryFn: async (): Promise<SwitcherMatch[]> => {
      if (!activeEventId) return [];
      // Admins see every live + scheduled match. Refs see their assignments.
      const constraints = isAdmin
        ? [where('status', 'in', ['live', 'scheduled', 'final'])]
        : [where('refereeUids', 'array-contains', uid)];
      const snap = await getDocs(query(matchesCol(activeEventId), ...constraints));
      return snap.docs.map((d) => ({
        id: d.id,
        teamAId: d.data().teamAId,
        teamBId: d.data().teamBId,
        sportId: d.data().sportId,
        status: d.data().status,
      }));
    },
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!myMatches.data) return;
    if (activeId && myMatches.data.some((m) => m.id === activeId)) return;
    setActiveId(initialMatchId ?? myMatches.data[0]?.id ?? null);
  }, [myMatches.data, activeId, initialMatchId]);

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

  if (myMatches.isLoading) {
    return (
      <>
        <TopBar title="Referee" />
        <main className="mx-auto max-w-[420px] px-5 pb-28">
          <p className="text-ink-dim">Finding your matches…</p>
        </main>
      </>
    );
  }

  if ((myMatches.data?.length ?? 0) === 0) {
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
          matches={myMatches.data ?? []}
          current={activeId ?? ''}
          onChange={setActiveId}
        />
        {activeId && activeEventId && (
          <RefereePanel matchId={activeId} eventId={activeEventId} meUid={uid!} />
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
}: {
  matchId: string;
  eventId: string;
  meUid: string;
}) {
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

  if (!match) {
    return <p className="px-5 text-ink-dim">Loading match…</p>;
  }

  const disabled = match.status === 'final';
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

  return (
    <>
      <Scoreboard
        teamA={match.teamAId}
        teamB={match.teamBId}
        scoreA={match.state.scoreA}
        scoreB={match.state.scoreB}
        onAdd={(side) => void nudgeScore(side, 1)}
        onSubtract={(side) => void nudgeScore(side, -1)}
        disabled={disabled}
      />

      <MatchClock
        state={match.state}
        disabled={disabled}
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
        trackable={trackable}
        showRunButtons={isCricket}
        disabled={disabled}
        onPunch={(type, side, value) =>
          void appendEvent({ type, side, value: typeof value === 'number' ? value : null })
        }
      />

      <EventLog
        events={events}
        teamA={match.teamAId}
        teamB={match.teamBId}
        meUid={meUid}
        onUndo={(id) => void undo(id)}
      />
    </>
  );
}
