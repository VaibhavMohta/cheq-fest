import { useEffect, useMemo, useState } from 'react';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import clsx from 'clsx';
import { Link, createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';
import { LeaderboardRow } from '@/components/leaderboard/LeaderboardRow';
import { useActiveEvent } from '@/lib/activeEvent';
import { useLeaderboardTrend } from '@/lib/leaderboardTrend';
import { bonusAwardsCol, matchesCol, sportsCol, teamsCol } from '@/lib/db';
import type { TeamDoc } from '@/types/player';
import type { MatchDoc } from '@/types/match';
import type { SportDoc } from '@/types/sport';
import type { BonusAwardDoc } from '@/types/bonus';
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
  const [awards, setAwards] = useState<(BonusAwardDoc & { id: string })[]>([]);
  // Which team's bonus breakdown is currently expanded (null = none).
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

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

  // Subscribe to bonus awards (event-scoped). Always-on so the overall
  // view can fold them into totals and the breakdown panel can render.
  useEffect(() => {
    if (!activeEventId) {
      setAwards([]);
      return;
    }
    return onSnapshot(
      bonusAwardsCol(activeEventId),
      (snap) => {
        setAwards(snap.docs.map((d) => ({ id: d.id, ...(d.data() as BonusAwardDoc) })));
      },
      () => setAwards([]),
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

  // Per-team bonus totals + raw award list, derived from the subscription.
  const bonusByTeam = useMemo(() => {
    const m = new Map<string, { total: number; awards: (BonusAwardDoc & { id: string })[] }>();
    for (const a of awards) {
      const prev = m.get(a.teamId) ?? { total: 0, awards: [] };
      prev.total += a.points;
      prev.awards.push(a);
      m.set(a.teamId, prev);
    }
    // Sort each team's awards newest-first for the breakdown panel.
    for (const v of m.values()) {
      v.awards.sort(
        (x, y) => (y.awardedAt?.toMillis() ?? 0) - (x.awardedAt?.toMillis() ?? 0),
      );
    }
    return m;
  }, [awards]);

  // Overall view rows: re-sort teams by (match points + bonus) so the
  // leaderboard reflects the same total it shows.
  const overallRows = useMemo(() => {
    return [...teams]
      .map((t) => {
        const bonus = bonusByTeam.get(t.id)?.total ?? 0;
        const matchPts = t.totalPoints ?? 0;
        return {
          team: t,
          matchPts,
          bonus,
          total: matchPts + bonus,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [teams, bonusByTeam]);

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

  // Live current ranking (1-indexed) for the trend tracker. Overall view
  // uses the bonus-aware ordering so trends reflect the actual leaderboard.
  const rankedForTrend = sportFilter
    ? filteredStandings.map((s, i) => ({ id: s.teamId, rank: i + 1 }))
    : overallRows.map((r, i) => ({ id: r.team.id, rank: i + 1 }));
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

        {/* Quick link to the player participation directory. Lives here
            because anyone scanning standings often wants to know which
            players are playing how many sports. */}
        <Link
          to="/players"
          className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-card px-3 py-2.5 transition active:scale-[0.99] hover:border-ink-dim"
        >
          <span className="flex flex-col">
            <span className="font-display text-sm uppercase tracking-[0.04em]">
              Player participation
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              See how many sports each player is in · tap for breakdown
            </span>
          </span>
          <span aria-hidden className="font-mono text-[14px] text-ink-mute">
            →
          </span>
        </Link>

        <Link
          to="/bracket"
          className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-card px-3 py-2.5 transition active:scale-[0.99] hover:border-ink-dim"
        >
          <span className="flex flex-col">
            <span className="font-display text-sm uppercase tracking-[0.04em]">
              Match tree
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              See the bracket per sport · auto-advances on result
            </span>
          </span>
          <span aria-hidden className="font-mono text-[14px] text-ink-mute">→</span>
        </Link>

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
            {overallRows.map((row, i) => {
              const isExpanded = expandedTeamId === row.team.id;
              const breakdown = bonusByTeam.get(row.team.id);
              return (
                <div key={row.team.id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTeamId((cur) =>
                        cur === row.team.id ? null : row.team.id,
                      )
                    }
                    className="text-left"
                    aria-expanded={isExpanded}
                  >
                    <LeaderboardRow
                      rank={i + 1}
                      teamId={row.team.id}
                      teamName={row.team.name}
                      teamColor={row.team.color}
                      wins={0}
                      draws={0}
                      losses={0}
                      points={row.total}
                      trend={trendFor(row.team.id)}
                    />
                  </button>
                  {/* Compact split line under each row — always visible so
                      viewers see the match-vs-bonus split at a glance. */}
                  <div className="mx-5 -mt-2 mb-2 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.08em]">
                    <span className="text-ink-dim">
                      Match · <span className="tabular-nums text-ink">{row.matchPts}</span>
                    </span>
                    <span className="text-ink-mute">+</span>
                    <span
                      style={{
                        color:
                          row.bonus > 0
                            ? 'var(--accent-2)'
                            : row.bonus < 0
                              ? 'var(--accent)'
                              : 'var(--ink-dim)',
                      }}
                    >
                      Bonus ·{' '}
                      <span className="tabular-nums">
                        {row.bonus > 0 ? `+${row.bonus}` : row.bonus}
                      </span>
                    </span>
                    <span className="ml-auto text-ink-mute">
                      {isExpanded ? 'tap to hide' : 'tap for breakdown'}
                    </span>
                  </div>
                  {isExpanded && (
                    <BonusBreakdown
                      teamName={row.team.name}
                      awards={breakdown?.awards ?? []}
                    />
                  )}
                </div>
              );
            })}
            <p className="mx-5 mt-3 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
              Total = match points + bonus awards. Bonuses are granted by
              admins on the Points tab. Tap a row for the bonus breakdown.
            </p>
          </>
        )}
      </main>
    </>
  );
}

function BonusBreakdown({
  teamName,
  awards,
}: {
  teamName: string;
  awards: BonusAwardDoc[];
}) {
  if (awards.length === 0) {
    return (
      <div className="mx-5 mb-3 rounded-xl border border-dashed border-line bg-bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
        No bonus awards yet for {teamName}.
      </div>
    );
  }
  return (
    <div className="mx-5 mb-3 rounded-xl border border-line bg-bg-card px-3 py-2">
      <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim">
        {teamName} · Bonus history
      </p>
      <ul className="flex flex-col gap-1">
        {awards.map((aw, i) => (
          <li
            key={`${aw.awardedAt?.toMillis() ?? i}-${i}`}
            className="flex items-start gap-2 border-t border-line pt-1.5 first:border-t-0 first:pt-0"
          >
            <span
              className="shrink-0 self-center font-display text-base leading-none tabular-nums"
              style={{
                color: aw.points >= 0 ? 'var(--accent-2)' : 'var(--accent)',
              }}
            >
              {aw.points > 0 ? `+${aw.points}` : aw.points}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px]">
                {aw.reason}
                {aw.category && (
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
                    · {aw.category}
                  </span>
                )}
              </p>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
                {aw.awardedAt?.toDate().toLocaleString() ?? '—'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
