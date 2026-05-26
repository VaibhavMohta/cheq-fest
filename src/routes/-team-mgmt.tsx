import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * Group Captain team management. The live data binding to the captain's
 * team (`events/{eventId}/teams/{teamId}`) and its roster comes once an
 * admin assigns this user as Group Captain. Until then this is an empty
 * state — previously seeded demo data with deleted-team-name ghosts.
 */
export default function TeamMgmtScreen() {
  return (
    <>
      <TopBar title="Manage Team" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EmptyState
          title="Not a Group Captain yet"
          hint="Once an admin assigns you as Group Captain for a team, your roster, vice-captain picker, and sport-captain assignments will appear here."
        />
      </main>
    </>
  );
}
