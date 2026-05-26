import { TopBar } from '@/components/shared/TopBar';
import { EventBar } from '@/components/shared/EventBar';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * Live arena view. Currently empty-stated — the live data binding to
 * `events/{eventId}/matches` lands once admins create + finalize their
 * first match. Until then this screen explicitly shows nothing rather
 * than seeded demo content (which used to leak deleted team names).
 */
export default function ArenaScreen() {
  return (
    <>
      <TopBar title="Live Arena" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />
        <EmptyState
          title="No live matches"
          hint="The arena lights up once an admin schedules a match and the referee starts the clock."
        />
      </main>
    </>
  );
}
