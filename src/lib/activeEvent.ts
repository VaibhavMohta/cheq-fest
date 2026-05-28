import { useEffect, useMemo, useState } from 'react';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { eventsCol } from './db';
import type { EventDoc } from '@/types/event';

export type EventWithId = EventDoc & { id: string };

const LS_KEY = 'cheq-fest:activeEventId';

/**
 * Subscribes to every event doc, sorted newest-first. Cheap (<10 docs ever).
 */
export function useEvents(): { events: EventWithId[]; loading: boolean } {
  const [events, setEvents] = useState<EventWithId[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(eventsCol, orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => {
        // On error (e.g. permission denied for guest) just show no events.
        setEvents([]);
        setLoading(false);
      },
    );
  }, []);

  return { events, loading };
}

/**
 * Tracks which event the user is currently "viewing/editing".
 *
 * Resolution order:
 *  1. localStorage `cheq-fest:activeEventId` (if it points at an existing event)
 *  2. The most recently created event
 *  3. null (no events exist yet — admin needs to create one)
 *
 * `setActiveEventId` persists to localStorage. Returns `null` while events
 * are still loading from Firestore.
 */
export function useActiveEvent(): {
  events: EventWithId[];
  event: EventWithId | null;
  activeEventId: string | null;
  setActiveEventId: (id: string) => void;
  loading: boolean;
} {
  const { events, loading } = useEvents();
  const [storedId, setStoredId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(LS_KEY);
  });

  const activeEventId = useMemo(() => {
    if (events.length === 0) return null;
    if (storedId && events.some((e) => e.id === storedId)) return storedId;
    return events[0]!.id; // most recent
  }, [events, storedId]);

  const event = useMemo(
    () => events.find((e) => e.id === activeEventId) ?? null,
    [events, activeEventId],
  );

  const setActiveEventId = (id: string) => {
    setStoredId(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY, id);
    }
  };

  return { events, event, activeEventId, setActiveEventId, loading };
}

/**
 * Mirror of the `isEventLocked` Firestore rule. Returns true once the
 * event's start date has arrived — at which point captains can no
 * longer shuffle rosters; only admins / super-admins can. A missing
 * startDate is treated as unlocked (draft event).
 */
export function isEventLocked(event: { startDate: { toMillis(): number } | null } | null): boolean {
  if (!event?.startDate) return false;
  return event.startDate.toMillis() <= Date.now();
}
