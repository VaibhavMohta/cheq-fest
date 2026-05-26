import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocs, onSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { EventBar } from '@/components/shared/EventBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Field } from '@/components/arena/Field';
import { ArenaPlayer, ArenaEmptySlot } from '@/components/arena/ArenaPlayer';
import { Ball } from '@/components/arena/Ball';
import { ArenaScoreStrip } from '@/components/arena/ArenaScoreStrip';
import { MatchSwitcher, type SwitcherMatch } from '@/components/referee/MatchSwitcher';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers } from '@/lib/playerDirectory';
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
    queryKey: ['arena', 'matches', activeEventId, teams.data?.size ?? 0],
    enabled: !!activeEventId && !!teams.data,
    queryFn: async (): Promise<SwitcherMatch[]> => {
      if (!activeEventId || !teams.data) return [];
      const snap = await getDocs(matchesCol(activeEventId));
      const rows: (SwitcherMatch & { _sortKey: number })[] = snap.docs.map(
        (d) => {
          const data = d.data();
          const a = teams.data!.get(data.teamAId);
          const b = teams.data!.get(data.teamBId);
          // Sort: live (0) → upcoming/scheduled (1) → final (2)
          const sortKey = data.status === 'live' ? 0 : data.status === 'scheduled' ? 1 : 2;
          return {
            id: d.id,
            teamAId: data.teamAId,
            teamBId: data.teamBId,
            teamAName: a?.name ?? data.teamAId,
            teamBName: b?.name ?? data.teamBId,
            teamAColor: a?.color ?? '',
            teamBColor: b?.color ?? '',
            sportId: data.sportId,
            status: data.status,
            _sortKey: sortKey,
          };
        },
      );
      rows.sort((x, y) => x._sortKey - y._sortKey);
      return rows.map(({ _sortKey, ...rest }) => rest);
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
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [rosterA, setRosterA] = useState<RosterDoc | null>(null);
  const [rosterB, setRosterB] = useState<RosterDoc | null>(null);
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

  if (!match) {
    return <p className="mx-5 text-ink-dim">Loading match…</p>;
  }

  const sport = sports.get(match.sportId);
  const teamA = teams.get(match.teamAId);
  const teamB = teams.get(match.teamBId);
  const arena: ArenaType = sport?.arenaType ?? 'pitch';

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
      />

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
    </>
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
