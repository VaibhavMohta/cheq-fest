import { useEffect, useState } from 'react';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import clsx from 'clsx';
import { createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';
import { LeaderboardRow } from '@/components/leaderboard/LeaderboardRow';
import { useActiveEvent } from '@/lib/activeEvent';
import { useLeaderboardTrend } from '@/lib/leaderboardTrend';
import { teamsCol } from '@/lib/db';
import type { TeamDoc } from '@/types/player';

export const Route = createFileRoute('/leaderboard')({
  component: LeaderboardScreen,
});

// Sport pills stay static for now. The "Overall" filter is the only one
// with real data — per-sport points denorm is a follow-up. The others
// render as disabled "Coming soon" instead of pretending they work.
const SPORTS = ['Overall', 'Football', 'Cricket', 'Badminton', 'Chess'] as const;
type SportFilter = (typeof SPORTS)[number];

type TeamRow = TeamDoc & { id: string };

function LeaderboardScreen() {
  const [filter, setFilter] = useState<SportFilter>('Overall');
  const { activeEventId } = useActiveEvent();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!activeEventId) {
      setTeams([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const q = query(teamsCol(activeEventId), orderBy('totalPoints', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoaded(true);
      },
      () => {
        setTeams([]);
        setLoaded(true);
      },
    );
  }, [activeEventId]);

  // Live current ranking (1-indexed). Ties carry the same rank — purely
  // cosmetic since we sort by totalPoints desc; not changing the row
  // order, just labelling.
  const ranked = teams.map((t, i) => ({ id: t.id, rank: i + 1 }));
  const { trendFor, resetBaseline, hasBaseline } = useLeaderboardTrend(
    activeEventId,
    ranked,
  );

  return (
    <>
      <TopBar title="The Board" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-5 pb-2">
          {SPORTS.map((sport) => {
            const active = filter === sport;
            const disabled = sport !== 'Overall';
            return (
              <button
                key={sport}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setFilter(sport)}
                title={disabled ? 'Per-sport leaderboard — coming soon' : undefined}
                className={clsx(
                  'shrink-0 rounded-full border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition',
                  active
                    ? 'border-accent-2 bg-accent-2 text-bg'
                    : disabled
                      ? 'cursor-not-allowed border-line bg-bg-card/40 text-ink-mute'
                      : 'border-line bg-bg-card text-ink-dim',
                )}
              >
                {sport}
                {disabled && <span className="ml-1 opacity-60">·soon</span>}
              </button>
            );
          })}
        </div>

        {!loaded ? (
          <p className="px-5 text-ink-dim">Loading standings…</p>
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
                {teams.length} team{teams.length === 1 ? '' : 's'}
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
              W/L/D counts will appear once per-match outcomes are
              denormalized onto the team doc.
            </p>
          </>
        )}
      </main>
    </>
  );
}
