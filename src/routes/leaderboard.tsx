import { useState } from 'react';
import clsx from 'clsx';
import { createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';

export const Route = createFileRoute('/leaderboard')({
  component: LeaderboardScreen,
});

// Sport pills are static for now. Once sports/{sportId} exists in Firestore,
// derive this list from a useSports() query.
const SPORTS = ['Overall', 'Football', 'Cricket', 'Badminton', 'Chess'] as const;
type SportFilter = (typeof SPORTS)[number];

function LeaderboardScreen() {
  const [filter, setFilter] = useState<SportFilter>('Overall');

  return (
    <>
      <TopBar title="The Board" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-5 pb-2">
          {SPORTS.map((sport) => {
            const active = filter === sport;
            return (
              <button
                key={sport}
                type="button"
                onClick={() => setFilter(sport)}
                className={clsx(
                  'shrink-0 rounded-full border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition',
                  active
                    ? 'border-accent-2 bg-accent-2 text-bg'
                    : 'border-line bg-bg-card text-ink-dim',
                )}
              >
                {sport}
              </button>
            );
          })}
        </div>

        <EmptyState
          title={
            filter === 'Overall'
              ? 'No standings yet'
              : `No ${filter} standings yet`
          }
          hint="Rows appear automatically once the first match is finalized."
        />
      </main>
    </>
  );
}
