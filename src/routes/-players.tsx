import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocs, onSnapshot } from 'firebase/firestore';
import clsx from 'clsx';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';
import { Avatar } from '@/components/shared/Avatar';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers } from '@/lib/playerDirectory';
import { displayEmail } from '@/lib/syntheticEmail';
import { rostersCol, sportsCol, teamsCol, type RosterDoc } from '@/lib/db';
import { colorVarFor } from '@/types/team';
import type { SportDoc } from '@/types/sport';
import type { TeamDoc } from '@/types/player';

type Bucket = 'pitch' | 'tentative' | 'substitutes' | 'notPlaying';

type SportSlot = {
  bucket: Bucket;
  teamId: string;
  /** True when this player is the sport captain for this (team, sport). */
  isSportCap: boolean;
};

type PlayerRow = {
  email: string;
  name: string;
  teamId: string | null;
  teamColor: string | null;
  teamName: string | null;
  isClaimed: boolean;
  /** True when the player is the Group Captain of their team. */
  isGroupCap: boolean;
  /** True when GC OR captain of any sport (drives the avatar star). */
  isAnyCaptain: boolean;
  sports: Map<string, SportSlot>;
};

/**
 * Public directory of every event player annotated with the number of
 * sports they're playing, sorted A → Z by display name. Filter by team
 * with the pill row at the top; tap a row to expand and see which
 * sports + buckets they're in. Gold-star avatars + GROUP CAP / SPORT CAP
 * chips surface captaincy at a glance.
 */
export default function PlayersScreen() {
  const { activeEventId } = useActiveEvent();
  const { people, isLoading: peopleLoading } = useAllEventPlayers();
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [query, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>(''); // '' = All teams

  const [teams, setTeams] = useState<(TeamDoc & { id: string })[]>([]);
  useEffect(() => {
    if (!activeEventId) {
      setTeams([]);
      return;
    }
    return onSnapshot(teamsCol(activeEventId), (snap) => {
      setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [activeEventId]);

  const [sports, setSports] = useState<(SportDoc & { id: string })[]>([]);
  useEffect(() => {
    if (!activeEventId) {
      setSports([]);
      return;
    }
    return onSnapshot(sportsCol(activeEventId), (snap) => {
      setSports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [activeEventId]);

  // Rosters under each team. One-shot fetch via TanStack Query — N
  // simultaneous subs across teams would re-render this whole list on
  // every minor edit and roster changes are infrequent enough that
  // an explicit "Refresh" beats live updates.
  const rosters = useQuery({
    queryKey: ['players-screen', 'rosters', activeEventId, teams.map((t) => t.id).join(',')],
    enabled: !!activeEventId && teams.length > 0,
    queryFn: async () => {
      if (!activeEventId)
        return new Map<string, (RosterDoc & { sportId: string; teamId: string })[]>();
      const m = new Map<string, (RosterDoc & { sportId: string; teamId: string })[]>();
      await Promise.all(
        teams.map(async (t) => {
          const snap = await getDocs(rostersCol(activeEventId, t.id));
          m.set(
            t.id,
            snap.docs.map((d) => ({ ...d.data(), sportId: d.id, teamId: t.id })),
          );
        }),
      );
      return m;
    },
  });

  // Aggregate by lowercased email so synthetic + claimed both fold cleanly.
  const rows = useMemo<PlayerRow[]>(() => {
    const byEmail = new Map<string, PlayerRow>();
    // Seed every known player so 0-sport players still appear.
    for (const p of people) {
      byEmail.set(p.email.toLowerCase(), {
        email: p.email,
        name: p.name,
        teamId: null,
        teamColor: null,
        teamName: null,
        isClaimed: p.isClaimed,
        isGroupCap: false,
        isAnyCaptain: false,
        sports: new Map(),
      });
    }
    // Attach team colour / name + Group Captain flag from team docs.
    for (const t of teams) {
      const gcLower = t.groupCaptainEmail?.toLowerCase() ?? null;
      for (const memberEmail of t.members) {
        const lower = memberEmail.toLowerCase();
        const row = byEmail.get(lower);
        if (!row) continue;
        if (!row.teamColor) {
          row.teamId = t.id;
          row.teamColor = t.color;
          row.teamName = t.name;
        }
        if (gcLower === lower) {
          row.isGroupCap = true;
          row.isAnyCaptain = true;
        }
      }
    }
    // Walk rosters and fill the sport map (+ SC flag per slot).
    if (rosters.data) {
      for (const [, rosterList] of rosters.data.entries()) {
        for (const r of rosterList) {
          const scLower = r.sportCaptainEmail?.toLowerCase() ?? null;
          for (const bucketName of ['pitch', 'tentative', 'substitutes'] as const) {
            const list = (r as RosterDoc)[bucketName] ?? [];
            for (const email of list) {
              const lower = email.toLowerCase();
              const row = byEmail.get(lower);
              if (!row) continue;
              const isSC = scLower === lower;
              if (isSC) row.isAnyCaptain = true;
              // Highest-priority bucket wins if a player appears in
              // more than one (pitch > tentative > substitutes).
              const existing = row.sports.get(r.sportId);
              if (existing && rank(existing.bucket) <= rank(bucketName)) {
                // Preserve any SC tag from this pass even if the
                // bucket stays put — e.g. roster has player in pitch
                // and tentative simultaneously; pitch wins, but SC
                // tag should fold in either way.
                if (isSC) existing.isSportCap = true;
                continue;
              }
              row.sports.set(r.sportId, {
                bucket: bucketName,
                teamId: r.teamId,
                isSportCap: isSC,
              });
            }
          }
        }
      }
    }
    // Sort alphabetically by display name (case-insensitive).
    return Array.from(byEmail.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [people, teams, rosters.data]);

  // Apply search + team filter (compose AND-style).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (teamFilter && r.teamId !== teamFilter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    });
  }, [rows, query, teamFilter]);

  const sportMap = useMemo(() => {
    const m = new Map<string, SportDoc & { id: string }>();
    for (const s of sports) m.set(s.id, s);
    return m;
  }, [sports]);

  if (!activeEventId) {
    return (
      <>
        <TopBar title="Players" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EventBar />
          <EmptyState
            title="No active event"
            hint="Pick an event from the top bar to see player participation."
          />
        </main>
      </>
    );
  }

  const loading = peopleLoading || rosters.isLoading;

  return (
    <>
      <TopBar title="Players" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />

        <div className="mx-5 mb-3">
          <input
            value={query}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search players by name or email…"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </div>

        {/* Team filter pill row. Always renders even with one team so
            the affordance is consistent. */}
        {teams.length > 0 && (
          <div className="-mx-1 mb-3 flex items-center gap-2 overflow-x-auto px-5 pb-1">
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute">
              Team
            </span>
            <TeamPill active={teamFilter === ''} color={null} onClick={() => setTeamFilter('')}>
              All teams
            </TeamPill>
            {teams.map((t) => (
              <TeamPill
                key={t.id}
                active={teamFilter === t.id}
                color={t.color}
                onClick={() => setTeamFilter(t.id)}
              >
                {t.name}
              </TeamPill>
            ))}
          </div>
        )}

        <div className="mx-5 mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            {loading
              ? 'Loading…'
              : `${filtered.length} ${filtered.length === 1 ? 'player' : 'players'}`}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
            Sorted A → Z
          </p>
        </div>

        {loading ? (
          <p className="px-5 text-ink-dim">Loading players…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={query || teamFilter ? 'No players match' : 'No players yet'}
            hint={
              query || teamFilter
                ? 'Try a different name, email, or team filter.'
                : 'Admin imports players in the Players tab — they appear here once added.'
            }
          />
        ) : (
          <ul className="mx-5 flex flex-col gap-1.5">
            {filtered.map((row) => {
              const isOpen = expandedEmail === row.email.toLowerCase();
              return (
                <li key={row.email}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedEmail(isOpen ? null : row.email.toLowerCase())
                    }
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg-card px-3 py-2.5 text-left transition active:scale-[0.99] hover:border-ink-dim"
                  >
                    <span className="relative shrink-0">
                      <Avatar
                        name={row.name}
                        teamId={row.teamColor ?? undefined}
                        size={36}
                        surfaceColor="var(--bg-card)"
                      />
                      {row.isAnyCaptain && (
                        <span
                          aria-label="Captain"
                          title={row.isGroupCap ? 'Group Captain' : 'Sport Captain'}
                          className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full border border-bg-card bg-bg font-mono text-[10px] leading-none"
                          style={{ color: 'var(--gold)' }}
                        >
                          ★
                        </span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{row.name}</p>
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                        <span className="truncate">{displayEmail(row.email)}</span>
                        {row.teamName && (
                          <>
                            <span className="text-ink-mute">·</span>
                            <span style={{ color: colorVarFor(row.teamColor) }}>
                              {row.teamName}
                            </span>
                          </>
                        )}
                        {row.isGroupCap && (
                          <span
                            className="rounded-md border px-1 py-0.5 text-[9px]"
                            style={{
                              color: 'var(--gold)',
                              borderColor: 'color-mix(in oklab, var(--gold) 40%, transparent)',
                            }}
                          >
                            Group Cap
                          </span>
                        )}
                      </p>
                    </div>
                    <SportCountBadge count={row.sports.size} />
                    <span
                      aria-hidden
                      className={clsx(
                        'ml-1 font-mono text-[14px] text-ink-mute transition-transform',
                        isOpen && 'rotate-180',
                      )}
                    >
                      ▾
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mx-2 mt-1 rounded-xl border border-dashed border-line bg-bg-card/50 p-3">
                      {row.sports.size === 0 ? (
                        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
                          Not playing any sport yet.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {Array.from(row.sports.entries())
                            .map(([sportId, info]) => ({
                              sportId,
                              bucket: info.bucket,
                              isSportCap: info.isSportCap,
                              sportName: sportMap.get(sportId)?.name ?? sportId,
                            }))
                            .sort((a, b) => a.sportName.localeCompare(b.sportName))
                            .map((s) => (
                              <li
                                key={s.sportId}
                                className="flex items-center justify-between gap-2 rounded-md border border-line bg-bg px-2.5 py-1.5"
                              >
                                <span className="font-display text-sm uppercase tracking-[0.04em]">
                                  {s.sportName}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <BucketChip bucket={s.bucket} />
                                  {s.isSportCap && (
                                    <span
                                      className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]"
                                      style={{
                                        color: 'var(--accent-3)',
                                        borderColor:
                                          'color-mix(in oklab, var(--accent-3) 40%, transparent)',
                                      }}
                                    >
                                      ★ Sport Cap
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}

function rank(b: Bucket): number {
  switch (b) {
    case 'pitch':
      return 0;
    case 'tentative':
      return 1;
    case 'substitutes':
      return 2;
    case 'notPlaying':
      return 3;
  }
}

function SportCountBadge({ count }: { count: number }) {
  const color =
    count >= 3 ? 'var(--accent-2)' : count >= 1 ? 'var(--accent-3)' : 'var(--ink-mute)';
  return (
    <span
      className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]"
      style={{
        color,
        borderColor: 'color-mix(in oklab, currentColor 40%, transparent)',
      }}
    >
      {count} sport{count === 1 ? '' : 's'}
    </span>
  );
}

function BucketChip({ bucket }: { bucket: Bucket }) {
  const label =
    bucket === 'pitch'
      ? 'On the pitch'
      : bucket === 'tentative'
        ? 'Tentative'
        : bucket === 'substitutes'
          ? 'Substitute'
          : 'Not playing';
  const color =
    bucket === 'pitch'
      ? 'var(--accent)'
      : bucket === 'tentative'
        ? 'var(--accent-2)'
        : bucket === 'substitutes'
          ? 'var(--accent-3)'
          : 'var(--ink-mute)';
  return (
    <span
      className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]"
      style={{
        color,
        borderColor: 'color-mix(in oklab, currentColor 40%, transparent)',
      }}
    >
      {label}
    </span>
  );
}

function TeamPill({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string | null;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // When a team colour is set, tint the active pill with it; otherwise
  // the default "All teams" pill uses the standard accent.
  const tint = color ? colorVarFor(color) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition',
        active
          ? tint
            ? ''
            : 'border-accent bg-accent text-bg'
          : 'border-line bg-bg-card text-ink-dim hover:text-ink',
      )}
      style={
        active && tint
          ? {
              borderColor: tint,
              background: 'color-mix(in oklab, currentColor 18%, transparent)',
              color: tint,
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}
