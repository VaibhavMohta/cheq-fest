import { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { SportIcon } from '@/components/shared/SportIcon';
import { useActiveEvent } from '@/lib/activeEvent';
import { matchesCol, sportsCol, teamsCol } from '@/lib/db';
import { colorVarFor, teamTextOnPage } from '@/types/team';
import type { MatchDoc } from '@/types/match';
import type { SportDoc } from '@/types/sport';
import type { TeamDoc } from '@/types/player';

type MatchWithId = MatchDoc & { id: string };
type SportWithId = SportDoc & { id: string };
type TeamWithId = TeamDoc & { id: string };

/**
 * Public, single-screen list of every match in the active event,
 * grouped by status: Live first, then Scheduled (newest start time
 * first), then Ended (most-recently-ended first). Two dropdown
 * filters — sport and team — compose with AND. Live-driven via
 * Firestore listeners so status pills flip the moment a referee
 * starts or ends a match.
 */
export default function MatchesScreen() {
  const { activeEventId } = useActiveEvent();
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [sports, setSports] = useState<SportWithId[]>([]);
  const [teams, setTeams] = useState<TeamWithId[]>([]);
  const [sportFilter, setSportFilter] = useState<string>(''); // '' = all
  const [teamFilter, setTeamFilter] = useState<string>(''); // '' = all

  useEffect(() => {
    if (!activeEventId) {
      setMatches([]);
      setSports([]);
      setTeams([]);
      return;
    }
    const unsubM = onSnapshot(matchesCol(activeEventId), (snap) =>
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsubS = onSnapshot(sportsCol(activeEventId), (snap) =>
      setSports(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      ),
    );
    const unsubT = onSnapshot(teamsCol(activeEventId), (snap) =>
      setTeams(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      ),
    );
    return () => {
      unsubM();
      unsubS();
      unsubT();
    };
  }, [activeEventId]);

  const sportsById = useMemo(() => {
    const m = new Map<string, SportWithId>();
    for (const s of sports) m.set(s.id, s);
    return m;
  }, [sports]);
  const teamsById = useMemo(() => {
    const m = new Map<string, TeamWithId>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  // Filter + bucket + sort.
  // - Live  → grouped at top, internally sorted by most-recent start.
  // - Scheduled → DESCENDING by scheduledStart (latest first per spec).
  //   Unscheduled rows go to the tail.
  // - Ended → DESCENDING by endedAt (fallback pointsAwardedAt /
  //   scheduledStart) so the most recently finished match is first.
  const { live, scheduled, ended } = useMemo(() => {
    const filtered = matches.filter((m) => {
      if (sportFilter && m.sportId !== sportFilter) return false;
      if (teamFilter && m.teamAId !== teamFilter && m.teamBId !== teamFilter) {
        return false;
      }
      return true;
    });
    const live: MatchWithId[] = [];
    const scheduled: MatchWithId[] = [];
    const ended: MatchWithId[] = [];
    for (const m of filtered) {
      if (m.status === 'live') live.push(m);
      else if (m.status === 'final') ended.push(m);
      else scheduled.push(m);
    }
    const startMs = (m: MatchWithId): number =>
      m.scheduledStart?.toMillis?.() ?? 0;
    const endMs = (m: MatchWithId): number =>
      m.endedAt?.toMillis?.() ??
      m.pointsAwardedAt?.toMillis?.() ??
      m.scheduledStart?.toMillis?.() ??
      0;
    live.sort((a, b) => startMs(b) - startMs(a));
    scheduled.sort((a, b) => {
      // Unscheduled (start = 0) sinks to bottom of the descending list.
      const at = startMs(a) || -Infinity;
      const bt = startMs(b) || -Infinity;
      return bt - at;
    });
    ended.sort((a, b) => endMs(b) - endMs(a));
    return { live, scheduled, ended };
  }, [matches, sportFilter, teamFilter]);

  if (!activeEventId) {
    return (
      <>
        <TopBar title="Matches" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="No active event"
            hint="Pick an event from the top bar to see matches."
          />
        </main>
      </>
    );
  }

  const totalFiltered = live.length + scheduled.length + ended.length;

  return (
    <>
      <TopBar title="Matches" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />

        <div className="mx-5 mb-3 grid grid-cols-2 gap-2">
          <FilterDropdown
            label="Sport"
            value={sportFilter}
            options={[
              { value: '', label: 'All sports' },
              ...sports.map((s) => ({ value: s.id, label: s.name })),
            ]}
            onChange={setSportFilter}
          />
          <FilterDropdown
            label="Team"
            value={teamFilter}
            options={[
              { value: '', label: 'All teams' },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
            onChange={setTeamFilter}
          />
        </div>

        {totalFiltered === 0 ? (
          <EmptyState
            title={sportFilter || teamFilter ? 'No matches match' : 'No matches yet'}
            hint={
              sportFilter || teamFilter
                ? 'Try clearing the filters above.'
                : 'Admin will publish the schedule once teams are confirmed.'
            }
          />
        ) : (
          <>
            <Section
              title="Live now"
              count={live.length}
              matches={live}
              sportsById={sportsById}
              teamsById={teamsById}
              variant="live"
            />
            <Section
              title="Scheduled"
              count={scheduled.length}
              matches={scheduled}
              sportsById={sportsById}
              teamsById={teamsById}
              variant="scheduled"
            />
            <Section
              title="Ended"
              count={ended.length}
              matches={ended}
              sportsById={sportsById}
              teamsById={teamsById}
              variant="ended"
            />
          </>
        )}
      </main>
    </>
  );
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase text-ink focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({
  title,
  count,
  matches,
  sportsById,
  teamsById,
  variant,
}: {
  title: string;
  count: number;
  matches: MatchWithId[];
  sportsById: Map<string, SportWithId>;
  teamsById: Map<string, TeamWithId>;
  variant: 'live' | 'scheduled' | 'ended';
}) {
  if (count === 0) return null;
  return (
    <>
      <SectionTitle>
        {title} <span className="text-ink-mute">· {count}</span>
      </SectionTitle>
      <ul className="mx-5 mb-2 flex flex-col gap-2">
        {matches.map((m) => (
          <li key={m.id}>
            <MatchRow
              match={m}
              sport={sportsById.get(m.sportId) ?? null}
              teamA={m.teamAId ? teamsById.get(m.teamAId) ?? null : null}
              teamB={m.teamBId ? teamsById.get(m.teamBId) ?? null : null}
              variant={variant}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function MatchRow({
  match,
  sport,
  teamA,
  teamB,
  variant,
}: {
  match: MatchWithId;
  sport: SportWithId | null;
  teamA: TeamWithId | null;
  teamB: TeamWithId | null;
  variant: 'live' | 'scheduled' | 'ended';
}) {
  const sportName = sport?.name ?? match.sportId;
  const aLabel = teamA?.name ?? match.teamAId ?? 'TBD';
  const bLabel = teamB?.name ?? match.teamBId ?? 'TBD';
  const startLabel = match.scheduledStart
    ? match.scheduledStart.toDate().toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Unscheduled';
  const showScore = variant === 'live' || variant === 'ended';
  const winnerA = variant === 'ended' && match.winnerTeamId === match.teamAId;
  const winnerB = variant === 'ended' && match.winnerTeamId === match.teamBId;
  const isDraw = variant === 'ended' && match.winnerTeamId === null;

  // Right-hand tag varies by variant.
  const tag =
    variant === 'live'
      ? { text: '● Live', color: 'var(--accent)' }
      : variant === 'ended'
        ? { text: 'Ended', color: 'var(--accent-2)' }
        : { text: startLabel, color: 'var(--ink-dim)' };

  return (
    <article className="rounded-2xl border border-line bg-bg-card px-4 py-3">
      <header className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          <SportIcon sportName={sportName} arenaType={sport?.arenaType} size={22} />
          {sportName}
          {match.matchNumber != null && (
            <span className="ml-1 text-ink-mute">#{match.matchNumber}</span>
          )}
        </p>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: tag.color }}
        >
          {tag.text}
        </p>
      </header>

      <div className="mt-2 flex items-center gap-3">
        <TeamLine
          name={aLabel}
          color={teamA?.color}
          score={showScore ? match.state.scoreA : null}
          isWinner={winnerA}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
          vs
        </span>
        <TeamLine
          name={bLabel}
          color={teamB?.color}
          score={showScore ? match.state.scoreB : null}
          isWinner={winnerB}
          align="right"
        />
      </div>

      {(match.venue || variant !== 'live') && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-mute">
          {variant === 'live' && match.scheduledStart && (
            <span>Started {startLabel}</span>
          )}
          {variant === 'ended' && (
            <span>
              {isDraw
                ? 'Draw'
                : winnerA
                  ? `${aLabel} wins`
                  : winnerB
                    ? `${bLabel} wins`
                    : ''}
            </span>
          )}
          {variant === 'scheduled' && match.venue && <span>{match.venue}</span>}
          {variant !== 'scheduled' && match.venue && (
            <>
              <span aria-hidden>·</span>
              <span>{match.venue}</span>
            </>
          )}
        </p>
      )}
    </article>
  );
}

function TeamLine({
  name,
  color,
  score,
  isWinner,
  align = 'left',
}: {
  name: string;
  color: string | undefined;
  score: number | null;
  isWinner: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={`flex flex-1 items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: colorVarFor(color) }}
      />
      <span
        className="truncate font-display text-sm uppercase"
        style={{
          color: color ? teamTextOnPage(color) : 'var(--ink-dim)',
          fontWeight: isWinner ? 800 : 500,
        }}
      >
        {name}
      </span>
      {score != null && (
        <span className="font-display text-base text-accent-2">{score}</span>
      )}
    </div>
  );
}
