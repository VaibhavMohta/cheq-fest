import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDocs, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { EventBar } from '@/components/shared/EventBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { Field } from '@/components/arena/Field';
import { ArenaPlayer, ArenaEmptySlot } from '@/components/arena/ArenaPlayer';
import { Ball } from '@/components/arena/Ball';
import { ArenaScoreStrip } from '@/components/arena/ArenaScoreStrip';
import { MatchSwitcher, type SwitcherMatch } from '@/components/referee/MatchSwitcher';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers } from '@/lib/playerDirectory';
import { useAuth } from '@/lib/auth';
import { useRole } from '@/lib/roles';
import { displayEmail } from '@/lib/syntheticEmail';
import {
  matchRef,
  matchesCol,
  rosterRef,
  sportsCol,
  teamsCol,
} from '@/lib/db';
import { awayPositions, homePositions } from '@/lib/arenaLayout';
import { formatClock, type MatchDoc } from '@/types/match';
import type { TeamDoc } from '@/types/player';
import type { SportDoc, ArenaType } from '@/types/sport';
import type { RosterDoc } from '@/lib/db';

/**
 * Live Arena. Shows every match in the active event as switcher pills,
 * with the selected match's score / clock / players / equipment animating
 * on the realistic field. Score + clock update live via match doc snap;
 * rosters refresh as the Sport Captain edits buckets.
 */
export default function ArenaScreen() {
  const { activeEventId } = useActiveEvent();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Load supporting data once. Matches doesn't need a live subscription
  // here — the switcher list only changes on admin actions — but the
  // *selected* match doc does (handled separately below).
  const teams = useQuery({
    queryKey: ['arena', 'teams', activeEventId],
    enabled: !!activeEventId,
    queryFn: async (): Promise<Map<string, TeamDoc>> => {
      if (!activeEventId) return new Map();
      const snap = await getDocs(teamsCol(activeEventId));
      const m = new Map<string, TeamDoc>();
      for (const d of snap.docs) m.set(d.id, d.data());
      return m;
    },
  });
  const sports = useQuery({
    queryKey: ['arena', 'sports', activeEventId],
    enabled: !!activeEventId,
    queryFn: async (): Promise<Map<string, SportDoc>> => {
      if (!activeEventId) return new Map();
      const snap = await getDocs(sportsCol(activeEventId));
      const m = new Map<string, SportDoc>();
      for (const d of snap.docs) m.set(d.id, d.data());
      return m;
    },
  });
  const matches = useQuery({
    queryKey: [
      'arena',
      'matches',
      activeEventId,
      teams.data?.size ?? 0,
      sports.data?.size ?? 0,
    ],
    enabled: !!activeEventId && !!teams.data && !!sports.data,
    queryFn: async (): Promise<SwitcherMatch[]> => {
      if (!activeEventId || !teams.data || !sports.data) return [];
      const snap = await getDocs(matchesCol(activeEventId));
      const rows: SwitcherMatch[] = snap.docs.map((d) => {
        const data = d.data();
        const a = teams.data!.get(data.teamAId);
        const b = teams.data!.get(data.teamBId);
        const sp = sports.data!.get(data.sportId);
        return {
          id: d.id,
          teamAId: data.teamAId,
          teamBId: data.teamBId,
          teamAName: a?.name ?? data.teamAId,
          teamBName: b?.name ?? data.teamBId,
          teamAColor: a?.color ?? '',
          teamBColor: b?.color ?? '',
          sportId: data.sportId,
          sportName: sp?.name ?? data.sportId,
          matchNumber: data.matchNumber ?? null,
          status: data.status,
          scheduledStart: data.scheduledStart ?? null,
        };
      });
      // Ascending by scheduledStart. Unscheduled matches go last so the
      // most "actionable" timed matches always lead the list.
      rows.sort((x, y) => {
        const xt = x.scheduledStart?.toMillis() ?? Number.POSITIVE_INFINITY;
        const yt = y.scheduledStart?.toMillis() ?? Number.POSITIVE_INFINITY;
        return xt - yt;
      });
      return rows;
    },
  });

  // Default selection: first live → first upcoming → first whatever.
  useEffect(() => {
    if (!matches.data) return;
    if (activeId && matches.data.some((m) => m.id === activeId)) return;
    setActiveId(matches.data[0]?.id ?? null);
  }, [matches.data, activeId]);

  if (!activeEventId) {
    return (
      <>
        <TopBar title="Live Arena" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EventBar />
          <EmptyState
            title="No active event"
            hint="Pick an event from the top bar to see live matches."
          />
        </main>
      </>
    );
  }

  if (teams.isLoading || sports.isLoading || matches.isLoading) {
    return (
      <>
        <TopBar title="Live Arena" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EventBar />
          <p className="px-5 text-ink-dim">Loading…</p>
        </main>
      </>
    );
  }

  const allMatches = matches.data ?? [];
  if (allMatches.length === 0) {
    return (
      <>
        <TopBar title="Live Arena" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EventBar />
          <EmptyState
            title="No matches yet"
            hint="The arena lights up once an admin schedules the first match."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Live Arena" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />
        <MatchSwitcher
          matches={allMatches}
          current={activeId ?? ''}
          onChange={setActiveId}
        />
        {activeId && (
          <ArenaForMatch
            eventId={activeEventId}
            matchId={activeId}
            teams={teams.data ?? new Map()}
            sports={sports.data ?? new Map()}
          />
        )}
      </main>
    </>
  );
}

function ArenaForMatch({
  eventId,
  matchId,
  teams,
  sports,
}: {
  eventId: string;
  matchId: string;
  teams: Map<string, TeamDoc>;
  sports: Map<string, SportDoc>;
}) {
  const qc = useQueryClient();
  const auth = useAuth();
  const role = useRole();
  const myUid = auth.status === 'signedIn' ? auth.user.uid : null;
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [rosterA, setRosterA] = useState<RosterDoc | null>(null);
  const [rosterB, setRosterB] = useState<RosterDoc | null>(null);
  const [squadOpen, setSquadOpen] = useState<null | 'A' | 'B'>(null);
  const { people } = useAllEventPlayers();

  // Live match doc — score, clock, status all reactive.
  useEffect(() => {
    return onSnapshot(matchRef(eventId, matchId), (snap) => {
      setMatch(snap.exists() ? snap.data() : null);
    });
  }, [eventId, matchId]);

  // Live roster docs per side so the field reflects Sport-Captain edits.
  useEffect(() => {
    if (!match) return;
    return onSnapshot(
      rosterRef(eventId, match.teamAId, match.sportId),
      (snap) => setRosterA(snap.exists() ? snap.data() : null),
    );
  }, [eventId, match?.teamAId, match?.sportId]);
  useEffect(() => {
    if (!match) return;
    return onSnapshot(
      rosterRef(eventId, match.teamBId, match.sportId),
      (snap) => setRosterB(snap.exists() ? snap.data() : null),
    );
  }, [eventId, match?.teamBId, match?.sportId]);

  const peopleByEmail = useMemo(() => {
    const m = new Map<string, (typeof people)[number]>();
    for (const p of people) m.set(p.email.toLowerCase(), p);
    return m;
  }, [people]);

  // End-match mutation must be declared before any early return so the
  // hooks order stays stable across renders. It captures `match` lazily
  // via the closure — only read it when the user actually fires.
  const endMatch = useMutation({
    mutationFn: async () => {
      if (!match) throw new Error('Match not loaded yet.');
      const a = match.state.scoreA;
      const b = match.state.scoreB;
      const winnerTeamId = a > b ? match.teamAId : b > a ? match.teamBId : null;
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
      void qc.invalidateQueries({ queryKey: ['arena', 'matches', eventId] });
    },
  });

  if (!match) {
    return <p className="mx-5 text-ink-dim">Loading match…</p>;
  }

  const sport = sports.get(match.sportId);
  const teamA = teams.get(match.teamAId);
  const teamB = teams.get(match.teamBId);
  const arena: ArenaType = sport?.arenaType ?? 'pitch';

  // Who can call the match? Admin / Super Admin always; assigned referees
  // for this specific match (per refereeUids).
  const isAdmin = role.is('admin');
  const isReferee = !!myUid && (match.refereeUids ?? []).includes(myUid);
  const canEndMatch = (isAdmin || isReferee) && match.status !== 'final';

  // Players on the pitch for each side. Fall back to team.members if a
  // roster hasn't been seeded yet — beats showing an empty field.
  const sideEmailsA = (rosterA?.pitch?.length ? rosterA.pitch : teamA?.members ?? []).map(
    (e) => e.toLowerCase(),
  );
  const sideEmailsB = (rosterB?.pitch?.length ? rosterB.pitch : teamB?.members ?? []).map(
    (e) => e.toLowerCase(),
  );
  const capEmailA = rosterA?.sportCaptainEmail?.toLowerCase() ?? null;
  const capEmailB = rosterB?.sportCaptainEmail?.toLowerCase() ?? null;

  const homeSlots = homePositions(arena, sideEmailsA.length);
  const awaySlots = awayPositions(arena, sideEmailsB.length);

  const statusForStrip: 'live' | 'upcoming' | 'done' =
    match.status === 'live' ? 'live' : match.status === 'final' ? 'done' : 'upcoming';

  return (
    <>
      <ArenaScoreStrip
        teamA={match.teamAId}
        teamB={match.teamBId}
        teamAName={teamA?.name ?? match.teamAId}
        teamBName={teamB?.name ?? match.teamBId}
        teamAColor={teamA?.color ?? ''}
        teamBColor={teamB?.color ?? ''}
        scoreA={match.state.scoreA}
        scoreB={match.state.scoreB}
        clock={formatClock(match.state.clockSeconds)}
        status={statusForStrip}
        sportName={sport?.name ?? match.sportId}
        onTeamAClick={() => setSquadOpen((p) => (p === 'A' ? null : 'A'))}
        onTeamBClick={() => setSquadOpen((p) => (p === 'B' ? null : 'B'))}
      />

      {squadOpen && (
        <SquadSheet
          side={squadOpen}
          teamName={
            squadOpen === 'A' ? teamA?.name ?? match.teamAId : teamB?.name ?? match.teamBId
          }
          teamColor={squadOpen === 'A' ? teamA?.color ?? '' : teamB?.color ?? ''}
          pitchEmails={squadOpen === 'A' ? sideEmailsA : sideEmailsB}
          captainEmail={squadOpen === 'A' ? capEmailA : capEmailB}
          groupCaptainEmail={
            (squadOpen === 'A'
              ? teamA?.groupCaptainEmail
              : teamB?.groupCaptainEmail
            )?.toLowerCase() ?? null
          }
          peopleByEmail={peopleByEmail}
          onClose={() => setSquadOpen(null)}
        />
      )}

      <Field arena={arena} sportId={match.sportId}>
        {sideEmailsA.map((email, i) => {
          const pos = homeSlots[i];
          const person = peopleByEmail.get(email);
          if (!pos) return null;
          return (
            <ArenaPlayer
              key={`a-${email}`}
              position={pos}
              name={person?.name ?? email.split('@')[0]!}
              teamId={teamA?.color ?? ''}
              isCaptain={capEmailA === email}
              size={avatarSizeFor(arena, sideEmailsA.length)}
              compact={shouldCompact(arena, sideEmailsA.length)}
              delaySeed={i}
            />
          );
        })}
        {sideEmailsB.map((email, i) => {
          const pos = awaySlots[i];
          const person = peopleByEmail.get(email);
          if (!pos) return null;
          return (
            <ArenaPlayer
              key={`b-${email}`}
              position={pos}
              name={person?.name ?? email.split('@')[0]!}
              teamId={teamB?.color ?? ''}
              isCaptain={capEmailB === email}
              size={avatarSizeFor(arena, sideEmailsB.length)}
              compact={shouldCompact(arena, sideEmailsB.length)}
              delaySeed={i + 100}
            />
          );
        })}
        {homeSlots.length === 0 && sideEmailsA.length === 0 && (
          <ArenaEmptySlot position={{ x: 35, y: 50 }} />
        )}
        {awaySlots.length === 0 && sideEmailsB.length === 0 && (
          <ArenaEmptySlot position={{ x: 65, y: 50 }} />
        )}
        <Ball arena={arena} sportId={match.sportId} />
      </Field>

      <p className="mx-5 mt-3 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-ink-mute">
        {match.status === 'live'
          ? 'Live · updates from referee console'
          : match.status === 'final'
            ? 'Final · scores shown above'
            : 'Scheduled · arena lights up when the ref starts the clock'}
      </p>

      {canEndMatch && (
        <div className="mx-5 mt-4 flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={endMatch.isPending}
            onClick={() => {
              const a = match.state.scoreA;
              const b = match.state.scoreB;
              const winner =
                a > b
                  ? teamA?.name ?? match.teamAId
                  : b > a
                    ? teamB?.name ?? match.teamBId
                    : 'a draw';
              const msg =
                `End this match now?\n\n` +
                `Final score: ${teamA?.name ?? match.teamAId} ${a} — ${b} ${teamB?.name ?? match.teamBId}\n` +
                `Result: ${winner === 'a draw' ? 'Draw' : `${winner} wins`}\n\n` +
                `This locks the score, stops the clock, and awards points. ` +
                `It cannot be undone from the app.`;
              if (window.confirm(msg)) endMatch.mutate();
            }}
            className="!w-full"
            style={{
              borderColor: 'color-mix(in oklab, var(--accent) 60%, transparent)',
              color: 'var(--accent)',
            }}
          >
            {endMatch.isPending ? 'Ending…' : 'End Match'}
          </Button>
          {endMatch.error && (
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-accent">
              {endMatch.error instanceof Error
                ? endMatch.error.message
                : String(endMatch.error)}
            </p>
          )}
          <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
            {isAdmin ? 'Admin' : 'Referee'} action · sets status to FINAL and freezes the score.
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Inline squad sheet — read-only list of the team's pitch lineup for the
 * current match. Opened by tapping the team name in the score strip.
 * Gold "C" for Group Captain, cyan "C" for Sport Captain.
 */
function SquadSheet({
  side,
  teamName,
  teamColor,
  pitchEmails,
  captainEmail,
  groupCaptainEmail,
  peopleByEmail,
  onClose,
}: {
  side: 'A' | 'B';
  teamName: string;
  teamColor: string;
  pitchEmails: string[];
  captainEmail: string | null;
  groupCaptainEmail: string | null;
  peopleByEmail: Map<string, { name: string; email: string }>;
  onClose: () => void;
}) {
  return (
    <section
      className="mx-5 mb-3 rounded-2xl border bg-bg-card p-3"
      style={{ borderColor: 'var(--line)' }}
    >
      <header className="mb-2 flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ background: teamColor || 'var(--ink-dim)' }}
          aria-hidden="true"
        />
        <p className="flex-1 truncate font-display text-sm uppercase">
          {teamName} · Squad
        </p>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
          {pitchEmails.length} on pitch · Side {side}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim hover:text-accent"
        >
          Close
        </button>
      </header>

      {pitchEmails.length === 0 ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
          Sport captain hasn't picked a lineup yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {pitchEmails.map((email) => {
            const person = peopleByEmail.get(email);
            const name = person?.name ?? email.split('@')[0]!;
            const isSc = !!captainEmail && captainEmail === email;
            const isGc = !!groupCaptainEmail && groupCaptainEmail === email;
            return (
              <li
                key={email}
                className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2 py-1.5"
              >
                <Avatar name={name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                    {displayEmail(email)}
                  </p>
                </div>
                {isSc && (
                  <span
                    className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                    style={{
                      color: 'var(--accent-3)',
                      borderColor: 'color-mix(in oklab, var(--accent-3) 40%, transparent)',
                    }}
                  >
                    SC
                  </span>
                )}
                {isGc && (
                  <span
                    className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                    style={{
                      color: 'var(--gold)',
                      borderColor: 'color-mix(in oklab, var(--gold) 40%, transparent)',
                    }}
                  >
                    GC
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Avatar size choices — board games get a bigger face, crowded arenas
 *  shrink slightly so labels don't clip neighbours. */
function avatarSizeFor(arena: ArenaType, count: number): number {
  if (arena === 'board') return 64;
  if (count >= 6) return 32;
  return 38;
}

/** Use 2-letter initials + smaller label when arenas are tight. */
function shouldCompact(arena: ArenaType, count: number): boolean {
  if (arena === 'table' || arena === 'rope' || arena === 'track') return true;
  if (arena === 'court' && count >= 2) return true;
  return false;
}
