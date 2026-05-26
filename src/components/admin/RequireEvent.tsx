import { useActiveEvent } from '@/lib/activeEvent';
import type { EventWithId } from '@/lib/activeEvent';

type Props = {
  /** Rendered when an event is active. Receives the event + its ID. */
  children: (event: EventWithId, eventId: string) => React.ReactNode;
};

/**
 * Gate for admin tabs that depend on an active event. Until one exists +
 * is selected, render a clear empty state pointing the admin back to the
 * Event tab. Avoids every tab re-implementing the same null-check.
 */
export function RequireEvent({ children }: Props) {
  const { event, activeEventId, loading } = useActiveEvent();

  if (loading) {
    return <p className="px-5 text-ink-dim">Loading events…</p>;
  }
  if (!event || !activeEventId) {
    return (
      <div className="mx-5 rounded-2xl border border-dashed border-accent/40 bg-accent/5 px-4 py-6 text-center">
        <p className="font-display text-base uppercase tracking-[0.08em] text-accent">
          No active event
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-dim">
          Create an event in the <span className="text-ink">Event</span> tab first.
          Players, teams, sports, matches, and the rulebook all belong to an event.
        </p>
      </div>
    );
  }
  return <>{children(event, activeEventId)}</>;
}
