import { useEffect, useMemo, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { onSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { EmptyState } from '@/components/shared/EmptyState';
import { IconButton } from '@/components/shared/IconButton';
import { InstallPrompt } from '@/components/shared/InstallPrompt';
import { MenuIcon } from '@/components/shared/icons';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers } from '@/lib/playerDirectory';
import { matchesCol, sportsCol, teamsCol } from '@/lib/db';
import type { Timestamp } from 'firebase/firestore';
import type { MatchDoc } from '@/types/match';
import { colorVarFor } from '@/types/team';
export const Route = createFileRoute('/')({
  component: HomeScreen,
});

type TeamLite = { id: string; name: string; color: string; totalPoints: number };
type MatchWithId = MatchDoc & { id: string };

function HomeScreen() {
  const { activeEventId } = useActiveEvent();
  const { matches, sports, teams } = useHomeData(activeEventId);
  const { people } = useAllEventPlayers();

  // uid → name lookup so MatchCard can render assigned-referee names
  // ("Ref: Joe, Sam") on every card it shows.
  const peopleByUid = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) {
      if (p.uid) m.set(p.uid, p.name);
    }
    return m;
  }, [people]);

  // Live = status 'live'. Today = scheduled to start within today's
  // calendar window (00:00 → 23:59 local) AND not yet final. Recent =
  // finished matches, sorted by endedAt desc (fallback to
  // pointsAwardedAt or scheduledStart), capped at 5 so the home screen
  // stays scannable. The three sets are disjoint by status.
  const { live, today, recent } = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    const live: MatchWithId[] = [];
    const today: MatchWithId[] = [];
    const finals: MatchWithId[] = [];
    for (const m of matches) {
      if (m.status === 'live') {
        live.push(m);
        continue;
      }
      if (m.status === 'final') {
        finals.push(m);
        continue;
      }
      const start = m.scheduledStart?.toMillis();
      if (start != null && start >= startOfDay && start < endOfDay) {
        today.push(m);
      }
    }
    today.sort(
      (a, b) =>
        (a.scheduledStart?.toMillis() ?? 0) - (b.scheduledStart?.toMillis() ?? 0),
    );
    // Sort finals newest first using whichever timestamp is available.
    const endTime = (m: MatchWithId): number =>
      m.endedAt?.toMillis?.() ??
      m.pointsAwardedAt?.toMillis?.() ??
      m.scheduledStart?.toMillis?.() ??
      0;
    finals.sort((a, b) => endTime(b) - endTime(a));
    return { live, today, recent: finals.slice(0, 5) };
  }, [matches]);

  return (
    <>
      <TopBar
        title="CHEQ Fest"
        actions={
          <IconButton aria-label="Menu">
            <MenuIcon />
          </IconButton>
        }
      />
      <main className="mx-auto max-w-[420px] pb-28">
        <InstallPrompt />

        {/* Hero stays on top so the active event identity is the
            first thing every visitor sees. Standings sits directly
            beneath. */}
        <Hero />

        <SectionTitle trailing={<Link to="/leaderboard">FULL BOARD →</Link>}>
          Standings
        </SectionTitle>
        <Standings teams={teams} limit={null} />

        <SectionTitle>Live Now</SectionTitle>
        {live.length === 0 ? (
          <EmptyState
            title="No live matches"
            hint="Live cards appear here the moment a referee starts a match."
          />
        ) : (
          <ul className="mx-5 flex flex-col gap-2">
            {live.map((m) => (
              <li key={m.id}>
                <MatchCard
                  match={m}
                  sports={sports}
                  teams={teams}
                  peopleByUid={peopleByUid}
                  live
                />
              </li>
            ))}
          </ul>
        )}

        <SectionTitle>Today</SectionTitle>
        {today.length === 0 ? (
          <EmptyState
            title="Schedule not posted"
            hint="Admin will publish the match schedule once teams are confirmed."
          />
        ) : (
          <ul className="mx-5 flex flex-col gap-2">
            {today.map((m) => (
              <li key={m.id}>
                <MatchCard
                  match={m}
                  sports={sports}
                  teams={teams}
                  peopleByUid={peopleByUid}
                />
              </li>
            ))}
          </ul>
        )}

        <SectionTitle
          trailing={
            recent.length > 0 ? <Link to="/leaderboard">FULL BOARD →</Link> : undefined
          }
        >
          Recent Results
        </SectionTitle>
        {recent.length === 0 ? (
          <EmptyState
            title="No results yet"
            hint="Finished matches show their final scores here as soon as a referee or admin ends them."
          />
        ) : (
          <ul className="mx-5 flex flex-col gap-2">
            {recent.map((m) => (
              <li key={m.id}>
                <MatchCard
                  match={m}
                  sports={sports}
                  teams={teams}
                  peopleByUid={peopleByUid}
                  final
                />
              </li>
            ))}
          </ul>
        )}

        <SectionTitle trailing={<Link to="/rulebook">OPEN →</Link>}>The Rulebook</SectionTitle>
        <Link
          to="/rulebook"
          className="mx-5 flex items-center gap-4 rounded-2xl border border-line bg-bg-card px-4 py-4 active:scale-[0.99]"
        >
          <span
            aria-hidden
            className="grid h-12 w-14 place-items-center rounded-lg bg-accent font-display text-xs text-bg"
          >
            PDF
          </span>
          <span className="flex-1">
            <span className="block text-sm font-bold">Rules & Points</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              Sport configs + scoring · always up to date
            </span>
          </span>
          <span aria-hidden className="text-ink-mute">
            →
          </span>
        </Link>
      </main>
    </>
  );
}

function Hero() {
  const { event, activeEventId, loading } = useActiveEvent();

  // Live counts for the active event. Subscribed to so the numbers
  // flip up the moment an admin imports sports or assigns players to
  // teams — no hard refresh needed.
  const [sportCount, setSportCount] = useState<number | null>(null);
  const [teams, setTeams] = useState<{ members: string[] }[]>([]);

  useEffect(() => {
    if (!activeEventId) {
      setSportCount(null);
      setTeams([]);
      return;
    }
    const unsubS = onSnapshot(
      sportsCol(activeEventId),
      (snap) => setSportCount(snap.size),
      () => setSportCount(null),
    );
    const unsubT = onSnapshot(
      teamsCol(activeEventId),
      (snap) =>
        setTeams(snap.docs.map((d) => ({ members: d.data().members ?? [] }))),
      () => setTeams([]),
    );
    return () => {
      unsubS();
      unsubT();
    };
  }, [activeEventId]);

  // Distinct player count = union of every team's members[]. Avoids
  // double-counting if the same email somehow ends up on two teams
  // (shouldn't happen — guarded by the picker — but cheap to be safe).
  const playerCount = (() => {
    const seen = new Set<string>();
    for (const t of teams) {
      for (const m of t.members) seen.add(m.toLowerCase());
    }
    return seen.size;
  })();
  const teamCount = teams.length;

  // Dates label — render real date range when both are set, else "Dates TBA".
  const dateLine = formatEventDates(
    event?.startDate ?? null,
    event?.endDate ?? null,
  );

  // Status label drives the small chip above the title.
  const statusLabel = loading
    ? 'Loading…'
    : !event
      ? 'No active event'
      : event.status === 'live'
        ? 'Live · in progress'
        : event.status === 'ended'
          ? 'Ended · scores final'
          : 'Pre-event · setup in progress';

  // Event name display. The accent-coloured year suffix (e.g. " '26")
  // is split off so it tints separately like the prototype.
  const { primary: nameMain, accent: nameAccent } = splitEventName(
    event?.name ?? 'CHEQ Sports',
    event?.year ?? null,
  );

  return (
    <section
      className="mx-5 mt-2 flex flex-col items-center overflow-hidden rounded-[28px] border border-line p-6 text-center"
      style={{
        background:
          'radial-gradient(ellipse at top right, color-mix(in oklab, var(--accent-2) 15%, transparent), transparent 50%), linear-gradient(135deg, #1a1815, #0f0e0c)',
      }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
        {statusLabel}
      </p>
      <h2 className="mt-3 font-display text-[52px] leading-none uppercase">
        {nameMain}
        {nameAccent && (
          <>
            {' '}
            <span className="text-accent">{nameAccent}</span>
          </>
        )}
      </h2>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
        {dateLine} · {event?.venue || 'Venue TBA'}
      </p>
      <div className="mt-5 flex justify-center gap-6">
        <Stat
          value={sportCount === null ? '—' : String(sportCount)}
          label="Sports"
        />
        <Stat value={String(teamCount)} label="Teams" />
        <Stat value={String(playerCount)} label="Players" />
      </div>
    </section>
  );
}

function formatEventDates(
  start: Timestamp | null,
  end: Timestamp | null,
): string {
  if (!start || !end) return 'Dates TBA';
  const s = start.toDate();
  const e = end.toDate();
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric' });
  const fmtMonth = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  const fmtYear = (d: Date) => d.getFullYear().toString();
  if (sameMonth) {
    return `${fmtDay(s)}–${fmtDay(e)} ${fmtMonth(s)} ${fmtYear(s)}`;
  }
  if (sameYear) {
    return `${fmtDay(s)} ${fmtMonth(s)} – ${fmtDay(e)} ${fmtMonth(e)} ${fmtYear(s)}`;
  }
  return `${fmtDay(s)} ${fmtMonth(s)} ${fmtYear(s)} – ${fmtDay(e)} ${fmtMonth(e)} ${fmtYear(e)}`;
}

/**
 * Split "CHEQ Sports 2026" → main "CHEQ Sports", accent " '26" so the
 * year displays in accent-orange. If the event name already includes a
 * year-like suffix, keep it intact and don't double-up.
 */
function splitEventName(
  name: string,
  year: number | null,
): { primary: string; accent: string } {
  const m = name.match(/^(.*?)\s+(\d{2,4}|'?\d{2})\s*$/);
  if (m && m[1] && m[2]) {
    const yr = m[2].startsWith("'") ? m[2] : `'${m[2].slice(-2)}`;
    return { primary: m[1].trim(), accent: yr };
  }
  if (year) {
    return { primary: name, accent: `'${String(year).slice(-2)}` };
  }
  return { primary: name, accent: '' };
}

/**
 * Subscribe to the three collections the home screen needs (matches,
 * sports, teams) for the active event. Returns plain arrays; refs are
 * cleaned up on event-id change.
 */
function useHomeData(activeEventId: string | null): {
  matches: MatchWithId[];
  sports: Map<string, string>;
  teams: Map<string, TeamLite>;
} {
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [sports, setSports] = useState<Map<string, string>>(new Map());
  const [teams, setTeams] = useState<Map<string, TeamLite>>(new Map());

  useEffect(() => {
    if (!activeEventId) {
      setMatches([]);
      setSports(new Map());
      setTeams(new Map());
      return;
    }
    const unsubM = onSnapshot(
      matchesCol(activeEventId),
      (snap) =>
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setMatches([]),
    );
    const unsubS = onSnapshot(
      sportsCol(activeEventId),
      (snap) => {
        const next = new Map<string, string>();
        for (const d of snap.docs) next.set(d.id, d.data().name ?? d.id);
        setSports(next);
      },
      () => setSports(new Map()),
    );
    const unsubT = onSnapshot(
      teamsCol(activeEventId),
      (snap) => {
        const next = new Map<string, TeamLite>();
        for (const d of snap.docs) {
          const data = d.data();
          next.set(d.id, {
            id: d.id,
            name: data.name ?? d.id,
            color: data.color ?? '',
            totalPoints: data.totalPoints ?? 0,
          });
        }
        setTeams(next);
      },
      () => setTeams(new Map()),
    );
    return () => {
      unsubM();
      unsubS();
      unsubT();
    };
  }, [activeEventId]);

  return { matches, sports, teams };
}

function Standings({
  teams,
  limit = 3,
}: {
  teams: Map<string, TeamLite>;
  /** Max rows to show. `null` renders every team. Default 3 = original
   *  podium-style snippet (still used elsewhere if reintroduced). */
  limit?: number | null;
}) {
  // Sort by totalPoints. Zero-point teams still render so users see
  // "everyone's on 0" instead of an empty state on day 1.
  const ranked = useMemo(() => {
    const sorted = [...teams.values()].sort(
      (a, b) => b.totalPoints - a.totalPoints,
    );
    return limit == null ? sorted : sorted.slice(0, limit);
  }, [teams, limit]);
  if (ranked.length === 0) {
    return (
      <EmptyState
        title="No teams yet"
        hint="Standings update automatically as matches finish."
      />
    );
  }
  return (
    <ol className="mx-5 flex flex-col gap-2">
      {ranked.map((t, i) => {
        const rank = i + 1;
        const isTop = rank === 1;
        return (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-4 py-2.5"
          >
            <span
              className="font-display text-xl leading-none"
              style={{ color: isTop ? 'var(--gold)' : 'var(--ink-dim)' }}
            >
              {rank}
            </span>
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: colorVarFor(t.color) }}
            />
            <span className="flex-1 truncate font-display text-sm uppercase">
              {t.name}
            </span>
            <span className="font-display text-lg leading-none text-accent-2">
              {t.totalPoints}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
              pts
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MatchCard({
  match,
  sports,
  teams,
  peopleByUid,
  live = false,
  final = false,
}: {
  match: MatchWithId;
  sports: Map<string, string>;
  teams: Map<string, TeamLite>;
  /** uid → display name lookup. Used to render the assigned-referee
   *  line under each match card. Pass an empty map to suppress. */
  peopleByUid: Map<string, string>;
  live?: boolean;
  final?: boolean;
}) {
  const sportName = sports.get(match.sportId) ?? match.sportId;
  const a = teams.get(match.teamAId);
  const b = teams.get(match.teamBId);

  // Resolve referee uids to display names. Unknown uids (deleted user
  // or staged-only ref) render as a generic "Referee" placeholder so
  // a missing entry doesn't break the line.
  const refereeNames = (match.refereeUids ?? [])
    .map((uid) => peopleByUid.get(uid) ?? null)
    .filter((n): n is string => !!n);
  const refereeLabel =
    refereeNames.length === 0
      ? (match.refereeUids?.length ?? 0) > 0
        ? `Ref · ${match.refereeUids!.length} assigned`
        : null
      : `Ref · ${refereeNames.join(', ')}`;
  const showScore = live || final;
  // Status pill copy / color. Live in lava-orange, Final in lime, else
  // the scheduled start time in muted ink.
  const startLabel = match.scheduledStart
    ? match.scheduledStart.toDate().toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'TBD';
  const statusLabel = live ? '● Live' : final ? 'Ended' : startLabel;
  const statusColor = live
    ? 'var(--accent)'
    : final
      ? 'var(--accent-2)'
      : 'var(--ink-dim)';

  // Winner highlighting for final matches. null winnerTeamId = draw —
  // no highlight on either side.
  const winnerA = final && match.winnerTeamId === match.teamAId;
  const winnerB = final && match.winnerTeamId === match.teamBId;
  const isDraw =
    final &&
    match.winnerTeamId == null &&
    match.state.scoreA === match.state.scoreB;

  return (
    <div className="rounded-2xl border border-line bg-bg-card px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          {sportName}
          {match.matchNumber != null && (
            <span className="ml-2 text-ink-mute">#{match.matchNumber}</span>
          )}
        </p>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <TeamLine
          team={a}
          score={showScore ? match.state.scoreA : null}
          isWinner={winnerA}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
          vs
        </span>
        <TeamLine
          team={b}
          score={showScore ? match.state.scoreB : null}
          align="right"
          isWinner={winnerB}
        />
      </div>
      {/* Result line under finals: winner's team name or "Draw". */}
      {final && (
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
          {isDraw
            ? 'Draw'
            : winnerA
              ? `${a?.name ?? match.teamAId} wins`
              : winnerB
                ? `${b?.name ?? match.teamBId} wins`
                : 'Ended'}
          {match.venue && ` · ${match.venue}`}
        </p>
      )}
      {!final && match.venue && (
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
          {match.venue}
        </p>
      )}
      {/* Referee line — always shown when any ref is assigned. Kept
          on its own line so the venue line above stays compact. */}
      {refereeLabel && (
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
          {refereeLabel}
        </p>
      )}
    </div>
  );
}

function TeamLine({
  team,
  score,
  align = 'left',
  isWinner = false,
}: {
  team: TeamLite | undefined;
  score: number | null;
  align?: 'left' | 'right';
  isWinner?: boolean;
}) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: colorVarFor(team?.color) }}
      />
      <span
        className="truncate font-display text-sm uppercase"
        style={isWinner ? { color: 'var(--accent-2)', fontWeight: 700 } : undefined}
      >
        {team?.name ?? '—'}
      </span>
      {score != null && (
        <span
          className="font-display text-base"
          style={{
            color: isWinner ? 'var(--accent-2)' : 'var(--ink)',
            fontWeight: isWinner ? 700 : 400,
          }}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="font-display text-3xl leading-none text-ink">{value}</span>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </span>
    </div>
  );
}
