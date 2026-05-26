import { useActiveEvent } from '@/lib/activeEvent';

/**
 * Persistent strip on public screens (Arena, Leaderboard, Rulebook) showing
 * which event the user is viewing and letting them switch. Defaults to the
 * most-recent event via useActiveEvent. Hidden entirely if no events exist
 * (the underlying screen renders its own empty state).
 */
export function EventBar({ label }: { label?: string }) {
  const { events, event, activeEventId, setActiveEventId, loading } = useActiveEvent();

  if (loading) return null;
  if (events.length === 0) return null;

  return (
    <section className="mx-5 mb-3 flex items-center gap-2 rounded-2xl border border-line bg-bg-card px-3 py-2">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full bg-accent-2"
      />
      <span className="flex-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
        {label ?? 'Event'}
      </span>
      {events.length === 1 ? (
        <span className="truncate font-display text-sm uppercase">{event?.name}</span>
      ) : (
        <select
          value={activeEventId ?? ''}
          onChange={(e) => setActiveEventId(e.target.value)}
          className="rounded-lg border border-line bg-bg px-2 py-1 font-display text-sm uppercase text-ink focus:border-accent focus:outline-none"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
