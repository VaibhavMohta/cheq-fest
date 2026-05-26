import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * Sport Captain lineup editor. The live data binding to
 * `events/{eventId}/teams/{teamId}/rosters/{sportId}` lands when a real
 * team + sport is selected. Until then this is intentionally empty —
 * the previous demo dataset is gone so deleted team ghosts don't leak.
 */
export default function LineupScreen() {
  return (
    <>
      <TopBar title="Edit Lineup" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EmptyState
          title="No roster to edit"
          hint="Once an admin assigns you as Sport Captain for a sport, the four-bucket drag-and-drop will appear here."
        />
      </main>
    </>
  );
}
