import { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';
import { useActiveEvent } from '@/lib/activeEvent';
import { matchesCol, sportsCol, teamsCol } from '@/lib/db';
import type { BracketStage, SportDoc } from '@/types/sport';
import type { MatchDoc } from '@/types/match';
import type { TeamDoc } from '@/types/player';
import { colorVarFor, inkOnTeamColor, teamTextOnPage } from '@/types/team';
import { SportIcon } from '@/components/shared/SportIcon';

type MatchWithId = MatchDoc & { id: string };

/**
 * Public match-tree view. Renders each sport's bracket as a sequence
 * of stage columns. Within each stage, groups are cards listing their
 * matches; unresolved placeholders show "Winner of Group A" until
 * resolveBracket fills them in. Updates live as matches finalise.
 *
 * Sports without a `tournament.bracket` show their legacy flat group
 * matches grouped by Stage 1 only — same data, simpler tree.
 */
export default function BracketScreen() {
  const { activeEventId } = useActiveEvent();
  const [sports, setSports] = useState<(SportDoc & { id: string })[]>([]);
  const [teams, setTeams] = useState<Map<string, TeamDoc>>(new Map());
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [sportFilter, setSportFilter] = useState<string>(''); // '' = first sport

  useEffect(() => {
    if (!activeEventId) {
      setSports([]);
      setTeams(new Map());
      setMatches([]);
      return;
    }
    const unsubS = onSnapshot(sportsCol(activeEventId), (snap) =>
      setSports(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      ),
    );
    const unsubT = onSnapshot(teamsCol(activeEventId), (snap) => {
      const m = new Map<string, TeamDoc>();
      for (const d of snap.docs) m.set(d.id, d.data());
      setTeams(m);
    });
    const unsubM = onSnapshot(matchesCol(activeEventId), (snap) =>
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => {
      unsubS();
      unsubT();
      unsubM();
    };
  }, [activeEventId]);

  // Default to the first sport when none picked yet.
  const activeSportId = sportFilter || sports[0]?.id || '';
  const activeSport = sports.find((s) => s.id === activeSportId) ?? null;

  // Stages to render = bracket if present, else synthesise Stage 1
  // from the legacy flat groups so every sport shows *something*.
  const stages: BracketStage[] = useMemo(() => {
    if (!activeSport) return [];
    const stage0: BracketStage = {
      id: 'group',
      label: 'Group Stage',
      order: 0,
      groups: (activeSport.tournament?.groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        format: g.format ?? 'round-robin',
        advances: 1,
        source: { kind: 'seeded' as const, teamIds: g.teamIds },
      })),
    };
    return [stage0, ...(activeSport.tournament?.bracket ?? [])];
  }, [activeSport]);

  const matchesByGroup = useMemo(() => {
    const m = new Map<string, MatchWithId[]>();
    for (const match of matches) {
      if (match.sportId !== activeSportId) continue;
      const stageId = match.stageId ?? 'group';
      const groupId = match.groupId ?? match.group ?? null;
      if (!groupId) continue;
      const key = `${stageId}/${groupId}`;
      const arr = m.get(key) ?? [];
      arr.push(match);
      m.set(key, arr);
    }
    // Sort each group's matches by matchNumber (or creation order).
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.matchNumber ?? 0) - (b.matchNumber ?? 0));
    }
    return m;
  }, [matches, activeSportId]);

  if (!activeEventId) {
    return (
      <>
        <TopBar title="Bracket" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="No active event"
            hint="Pick an event from the top bar to see the bracket."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Bracket" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />

        {sports.length === 0 ? (
          <EmptyState
            title="No sports yet"
            hint="Admin will add sports from the admin tab."
          />
        ) : (
          <>
            <div className="mx-5 mb-3 flex gap-1.5 overflow-x-auto">
              {sports.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSportFilter(s.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] transition"
                  style={
                    s.id === activeSportId
                      ? {
                          borderColor: 'var(--accent)',
                          background: 'var(--accent)',
                          color: 'var(--bg)',
                        }
                      : {
                          borderColor: 'var(--line)',
                          background: 'var(--bg-card)',
                          color: 'var(--ink-dim)',
                        }
                  }
                >
                  <SportIcon sportName={s.name} arenaType={s.arenaType} size={18} />
                  {s.name}
                </button>
              ))}
            </div>

            {stages.length === 0 || stages.every((s) => s.groups.length === 0) ? (
              <EmptyState
                title="No bracket configured"
                hint="Admin can compose this sport's bracket in Admin → Sports → Match tree."
              />
            ) : (
              <ol className="flex gap-3 overflow-x-auto px-5">
                {stages.map((stage) => (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    matchesByGroup={matchesByGroup}
                    teams={teams}
                  />
                ))}
              </ol>
            )}
          </>
        )}
      </main>
    </>
  );
}

function StageColumn({
  stage,
  matchesByGroup,
  teams,
}: {
  stage: BracketStage;
  matchesByGroup: Map<string, MatchWithId[]>;
  teams: Map<string, TeamDoc>;
}) {
  return (
    <li className="flex w-[260px] shrink-0 flex-col gap-2">
      <header className="rounded-lg border border-line bg-bg-card px-3 py-1.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim">
          {stage.label}
        </p>
      </header>
      {stage.groups.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-2 py-2 text-center font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
          No groups in this stage
        </p>
      ) : (
        stage.groups.map((group) => {
          const groupMatches = matchesByGroup.get(`${stage.id}/${group.id}`) ?? [];
          return (
            <article
              key={group.id}
              className="rounded-xl border border-line bg-bg-card p-2"
            >
              <header className="mb-1 flex items-baseline justify-between gap-2">
                <h3 className="font-display text-xs uppercase">{group.name}</h3>
                <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
                  {group.format} · top {group.advances}
                </span>
              </header>
              {groupMatches.length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-2 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
                  No matches yet
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {groupMatches.map((m) => (
                    <MatchTile key={m.id} match={m} teams={teams} />
                  ))}
                </ul>
              )}
            </article>
          );
        })
      )}
    </li>
  );
}

function MatchTile({
  match,
  teams,
}: {
  match: MatchWithId;
  teams: Map<string, TeamDoc>;
}) {
  const a = match.teamAId ? teams.get(match.teamAId) : null;
  const b = match.teamBId ? teams.get(match.teamBId) : null;
  const isLive = match.status === 'live';
  const isFinal = match.status === 'final';
  const winner = match.winnerTeamId;

  return (
    <li
      className="rounded-md border bg-bg px-2 py-1"
      style={{
        borderColor: isLive
          ? 'color-mix(in oklab, var(--accent) 60%, transparent)'
          : 'var(--line)',
      }}
    >
      <Side
        teamId={match.teamAId}
        team={a}
        slot={match.teamASlot}
        score={isFinal || isLive ? match.state.scoreA : null}
        isWinner={isFinal && winner === match.teamAId}
      />
      <div className="my-0.5 border-t border-line" />
      <Side
        teamId={match.teamBId}
        team={b}
        slot={match.teamBSlot}
        score={isFinal || isLive ? match.state.scoreB : null}
        isWinner={isFinal && winner === match.teamBId}
      />
      {(match.matchNumber != null || isLive || match.manuallyResolved) && (
        <p className="mt-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-ink-mute">
          {match.matchNumber != null && <span>#{match.matchNumber}</span>}
          {isLive && <span className="text-accent">● Live</span>}
          {match.manuallyResolved && <span className="text-gold">manually set</span>}
        </p>
      )}
    </li>
  );
}

function Side({
  teamId,
  team,
  slot,
  score,
  isWinner,
}: {
  teamId: string | null | undefined;
  team: TeamDoc | null | undefined;
  slot: { fromStageId: string; fromGroupId: string; rank: number } | null | undefined;
  score: number | null;
  isWinner: boolean;
}) {
  const placeholder = !teamId;
  const label = placeholder
    ? slot
      ? slotText(slot)
      : 'TBD'
    : team?.name ?? teamId;
  return (
    <div
      className="flex items-center gap-1.5"
      style={{ opacity: placeholder ? 0.65 : 1 }}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: team ? colorVarFor(team.color) : 'var(--ink-mute)' }}
      />
      <span
        className="flex-1 truncate font-display text-[11px] uppercase"
        style={{
          color: team ? teamTextOnPage(team.color) : 'var(--ink-dim)',
          fontWeight: isWinner ? 800 : 400,
        }}
      >
        {label}
      </span>
      {score != null && (
        <span
          className="ml-auto font-display text-[12px] tabular-nums"
          style={{
            color: isWinner
              ? team
                ? inkOnTeamColor(team.color) === '#0a0a0a'
                  ? 'var(--accent-2)'
                  : 'var(--accent-2)'
                : 'var(--accent-2)'
              : 'var(--ink-dim)',
          }}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function slotText(slot: {
  fromStageId: string;
  fromGroupId: string;
  rank: number;
}): string {
  const rankWord =
    slot.rank === 1 ? 'Winner' : slot.rank === 2 ? 'Runner-up' : `Rank ${slot.rank}`;
  return `${rankWord} of ${slot.fromGroupId}`;
}
