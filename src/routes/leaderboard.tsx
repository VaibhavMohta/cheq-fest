import { useEffect, useMemo, useState } from 'react';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import clsx from 'clsx';
import { createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';
import { LeaderboardRow } from '@/components/leaderboard/LeaderboardRow';
import { useActiveEvent } from '@/lib/activeEvent';
import { useLeaderboardTrend } from '@/lib/leaderboardTrend';
import { matchesCol, sportsCol, teamsCol } from '@/lib/db';
import type { TeamDoc } from '@/types/player';
import type { MatchDoc } from '@/types/match';
import type { SportDoc } from '@/types/sport';
import { aggregateStandings, tiedTeamIds, type TeamStanding } from '@/lib/tournament';

export const Route = createFileRoute('/leaderboard')({
  component: LeaderboardScreen,
});

type TeamRow = TeamDoc & { id: string };
type SportRow = SportDoc & { id: string };
type MatchRow = MatchDoc & { id: string };

function LeaderboardScreen() {
  const { activeEventId } = useActiveEvent();

  // "" = Overall (across all sports). Any other value is a sportId.
  const [sportFilter, setSportFilter] = useState<string>('');
  // "" = All teams. Any other value is a group id within the picked sport.
  const [groupFilter, setGroupFilter] = useState<string>('');

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [sports, setSports] = useState<SportRow[]>([]);
  const [sportsLoaded, setSportsLoaded] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);

  // Subscribe to teams (for overall totalPoints view + name/color
  // lookup in every view).
  useEffect(() => {
    if (!activeEventId) {
      setTeams([]);
      setTeamsLoaded(true);
      return;
    }
    setTeamsLoaded(false);
    const q = query(teamsCol(activeEventId), orderBy('totalPoints', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTeamsLoaded(true);
      },
      () => {
        setTeams([]);
        setTeamsLoaded(true);
      },
    );
  }, [activeEventId]);

  // Subscribe to sports (for the per-sport pill labels + group toggles
  // + points table when aggregating).
  useEffect(() => {
    if (!activeEventId) {
      setSports([]);
      setSportsLoaded(true);
      return;
    }
    setSportsLoaded(false);
    return onSnapshot(
      sportsCol(activeEventId),
      (snap) => {
        setSports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setSportsLoaded(true);
      },
      () => {
        setSports([]);
        setSportsLoaded(true);
      },
    );
  }, [activeEventId]);

  // Subscribe to matches — only needed when a sport filter is active
  // (overall view uses team.totalPoints directly).
  useEffect(() => {
    if (!activeEventId || !sportFilter) {
      setMatches([]);
      setMatchesLoaded(true);
      return;
    }
    setMatchesLoaded(false);
    return onSnapshot(
      matchesCol(activeEventId),
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setMatchesLoaded(true);
      },
      () => {
        setMatches([]);
        setMatchesLoaded(true);
      },
    );
  }, [activeEventId, sportFilter]);

  // Per-sport standings derived live. Overall view uses the existing
  // teams query (sorted by totalPoints) so we don't have to re-aggregate
  // there.
  const sport = useMemo(
    () => sports.find((s) => s.id === sportFilter) ?? null,
    [sports, sportFilter],
  );
  const teamMap = useMemo(() => {
    const m = new Map<string, TeamRow>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const filteredStandings = useMemo<TeamStanding[]>(() => {
    if (!sportFilter) return [];
    const filtered = matches.filter(
      (m) =>
        m.sportId === sportFilter &&
        m.status === 'final' &&
        (!groupFilter || m.group === groupFilter),
    );
    return aggregateStandings(filtered, sport);
  }, [matches, sportFilter, groupFilter, sport]);

  const tied = useMemo(
    () => (sportFilter ? tiedTeamIds(filteredStandings) : new Set<string>()),
    [filteredStandings, sportFilter],
  );

  // Live current ranking (1-indexed) for the trend tracker.
  const rankedForTrend = sportFilter
    ? filteredStandings.map((s, i) => ({ id: s.teamId, rank: i + 1 }))
    : teams.map((t, i) => ({ id: t.id, rank: i + 1 }));
  const { trendFor, resetBaseline, hasBaseline } = useLeaderboardTrend(
    activeEventId ? `${activeEventId}|${sportFilter}|${groupFilter}` : null,
    rankedForTrend,
  );

  const loaded = teamsLoaded && sportsLoaded && (!sportFilter || matchesLoaded);
  const availableGroups = sport?.tournament?.groups ?? [];

  return (
    <>
      <TopBar title="The Board" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />

        {/* Sport pill row. Overall is always the first. */}
        <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-5 pb-2">
          <FilterPill active={sportFilter === ''} onClick={() => {
            setSportFilter('');
            setGroupFilter('');
          }}>
            Overall
          </FilterPill>
          {sports.map((s) => (
            <FilterPill
              key={s.id}
              active={sportFilter === s.id}
              onClick={() => {
                setSportFilter(s.id);
                setGroupFilter('');
              }}
            >
              {s.name}
            </FilterPill>
          ))}
        </div>

        {/* Group toggle row — only appears for sports with configured groups. */}
        {sportFilter && availableGroups.length > 0 && (
          <div className="mx-5 mb-3 flex flex-wrap gap-1.5">
            <FilterPill active={groupFilter === ''} onClick={() => setGroupFilter('')}>
              All teams
            </FilterPill>
            {availableGroups.map((g) => (
              <FilterPill
                key={g.id}
                active={groupFilter === g.id}
                onClick={() => setGroupFilter(g.id)}
              >
                {g.name}
              </FilterPill>
            ))}
          </div>
        )}

        {!loaded ? (
          <p className="px-5 text-ink-dim">Loading standings…</p>
        ) : sportFilter ? (
          /* Sport-specific (and optionally group-specific) view —
             standings derived live from finalized matches. */
          filteredStandings.length === 0 ? (
            <EmptyState
              title={`No ${sport?.name ?? 'sport'} results yet`}
              hint={
                groupFilter
                  ? 'No matches in this group have been finalized.'
                  : 'Standings populate once matches for this sport are finalized.'
              }
            />
          ) : (
            <>
              <div className="mx-5 mb-2 flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                  {filteredStandings.length} team{filteredStandings.length === 1 ? '' : 's'}
                  {tied.size > 0 ? ` · ${tied.size} tied · admin breaks` : ''}
                </p>
                {hasBaseline && (
                  <button
                    type="button"
                    onClick={resetBaseline}
                    className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim hover:text-accent"
                  >
                    Reset trend
                  </button>
                )}
              </div>
              {filteredStandings.map((row, i) => {
                const team = teamMap.get(row.teamId);
                return (
                  <div key={row.teamId} className="relative">
                    {tied.has(row.teamId) && (
                      <span
                        aria-hidden
                        className="absolute -left-1 top-1/2 z-10 -translate-y-1/2 rounded-md border border-ink-mute/60 bg-bg-card px-1 font-mono text-[9px] uppercase text-ink-mute"
                        title="Tied — admin decides advancement"
                      >
                        =
                      </span>
                    )}
                    <LeaderboardRow
                      rank={i + 1}
                      teamId={row.teamId}
                      teamName={team?.name ?? row.teamId}
                      teamColor={team?.color ?? ''}
                      wins={row.wins}
                      draws={row.draws}
                      losses={row.losses}
                      points={row.points}
                      trend={trendFor(row.teamId)}
                    />
                  </div>
                );
              })}
            </>
          )
        ) : teams.length === 0 ? (
          <EmptyState
            title={activeEventId ? 'No standings yet' : 'No active event'}
            hint={
              activeEventId
                ? 'Rows appear automatically once the first match is finalized.'
                : 'Pick an event from the top bar to see standings.'
            }
          />
        ) : (
          <>
            <div className="mx-5 mb-2 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                {teams.length} team{teams.length === 1 ? '' : 's'} · overall
              </p>
              {hasBaseline && (
                <button
                  type="button"
                  onClick={resetBaseline}
                  className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim hover:text-accent"
                >
                  Reset trend
                </button>
              )}
            </div>
            {teams.map((t, i) => (
              <LeaderboardRow
                key={t.id}
                rank={i + 1}
                teamId={t.id}
                teamName={t.name}
                teamColor={t.color}
                wins={0}
                draws={0}
                losses={0}
                points={t.totalPoints ?? 0}
                trend={trendFor(t.id)}
              />
            ))}
            <p className="mx-5 mt-3 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
              Overall = sum of all finalized matches. Tap a sport pill above
              for per-sport W/L/D and group standings.
            </p>
          </>
        )}
      </main>
    </>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'shrink-0 rounded-full border px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition',
        active
          ? 'border-accent-2 bg-accent-2 text-bg'
          : 'border-line bg-bg-card text-ink-dim hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
