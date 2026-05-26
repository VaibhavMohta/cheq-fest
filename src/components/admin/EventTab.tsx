import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Timestamp, addDoc, deleteDoc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import clsx from 'clsx';
import { Button } from '@/components/shared/Button';
import { DatePicker } from '@/components/shared/DatePicker';
import { eventRef, eventsCol } from '@/lib/db';
import { useActiveEvent, type EventWithId } from '@/lib/activeEvent';
import { useRole } from '@/lib/roles';
import { EVENT_STATUSES, defaultEvent, type EventDoc, type EventStatus } from '@/types/event';
import { FormField, TextInput } from './FormField';

export function EventTab() {
  const qc = useQueryClient();
  const role = useRole();
  const { events, event: activeEvent, activeEventId, setActiveEventId, loading } = useActiveEvent();
  const [draft, setDraft] = useState<EventDoc | null>(null);

  // Hydrate the editor whenever the active event changes (or when the user
  // clicks a different event in the list).
  useEffect(() => {
    if (activeEvent) setDraft(activeEvent);
    else setDraft(null);
  }, [activeEvent]);

  const create = useMutation({
    mutationFn: async (data: EventDoc) => {
      const docRef = await addDoc(eventsCol, {
        ...data,
        createdAt: serverTimestamp() as unknown as Timestamp,
      });
      return docRef.id;
    },
    onSuccess: (newId) => {
      setActiveEventId(newId);
    },
  });

  const save = useMutation({
    mutationFn: async (args: { id: string; data: EventDoc }) => {
      await setDoc(eventRef(args.id), args.data, { merge: true });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // NOTE: this leaves nested teams/sports/matches docs orphaned. That's
      // intentional — a real cleanup is its own dedicated flow. For now,
      // deleting an event simply hides it from the list.
      const snap = await getDoc(eventRef(id));
      if (snap.exists()) await deleteDoc(eventRef(id));
    },
  });

  if (loading) return <p className="px-5 text-ink-dim">Loading events…</p>;

  return (
    <div className="mx-5 flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            {events.length} event{events.length === 1 ? '' : 's'}
          </h2>
          <Button
            variant="ghost"
            type="button"
            className="!w-auto !px-3 !py-1.5"
            onClick={() => {
              const fresh = defaultEvent(new Date().getFullYear());
              setDraft(fresh);
              setActiveEventId('');
              create.mutate(fresh);
            }}
            disabled={create.isPending}
          >
            {create.isPending ? 'Creating…' : '+ New event'}
          </Button>
        </div>

        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
            No events yet · create one to unlock the other tabs
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                active={e.id === activeEventId}
                canDelete={role.is('super-admin')}
                onSelect={() => setActiveEventId(e.id)}
                onDelete={() => {
                  if (window.confirm(`Delete "${e.name}"? (teams/sports/matches under it remain orphaned)`)) {
                    remove.mutate(e.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {draft && activeEventId && (
        <section className="flex flex-col gap-3 border-t border-line pt-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Edit · {activeEvent?.name ?? 'New event'}
          </h2>

          <FormField label="Event Name">
            <TextInput
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="CHEQ Fest 2026"
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Year">
              <TextInput
                type="number"
                value={draft.year}
                onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) || draft.year })}
                min={2024}
                max={2099}
              />
            </FormField>
            <FormField label="Status">
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as EventStatus })}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase text-ink focus:border-accent focus:outline-none"
              >
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Date">
              <DatePicker
                value={draft.startDate ? draft.startDate.toDate() : null}
                onChange={(d) => {
                  const startTs = d ? Timestamp.fromDate(d) : null;
                  // If the previously-saved end date is now before the new
                  // start, drop it so the admin re-picks instead of leaving
                  // an inverted range.
                  const next: EventDoc = { ...draft, startDate: startTs };
                  if (
                    startTs &&
                    draft.endDate &&
                    draft.endDate.toMillis() < startTs.toMillis()
                  ) {
                    next.endDate = null;
                  }
                  setDraft(next);
                }}
                placeholder="Pick start"
              />
            </FormField>
            <FormField
              label="End Date"
              hint={
                draft.startDate ? undefined : 'Pick the start date first.'
              }
            >
              <DatePicker
                value={draft.endDate ? draft.endDate.toDate() : null}
                onChange={(d) =>
                  setDraft({ ...draft, endDate: d ? Timestamp.fromDate(d) : null })
                }
                placeholder="Pick end"
                disabled={!draft.startDate}
                minDate={draft.startDate ? draft.startDate.toDate() : null}
              />
            </FormField>
          </div>

          {(!draft.startDate || !draft.endDate) && (
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
              Start and end dates are required — matches can only be
              scheduled inside this range.
            </p>
          )}

          <FormField label="Venue">
            <TextInput
              value={draft.venue}
              onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
              placeholder="Bengaluru HQ"
            />
          </FormField>

          <FormField label="Logo URL" hint="Storage upload UI lands later.">
            <TextInput
              value={draft.logoUrl ?? ''}
              onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value || null })}
              placeholder="https://…"
              type="url"
            />
          </FormField>

          {save.error && (
            <ErrorBox detail={save.error instanceof Error ? save.error.message : String(save.error)} />
          )}

          <Button
            type="button"
            disabled={
              save.isPending ||
              !draft.startDate ||
              !draft.endDate ||
              draft.endDate.toMillis() < draft.startDate.toMillis()
            }
            onClick={() => save.mutate({ id: activeEventId, data: draft })}
          >
            {save.isPending
              ? 'Saving…'
              : !draft.startDate || !draft.endDate
                ? 'Set start & end dates'
                : save.isSuccess
                  ? 'Saved ✓'
                  : 'Save Event'}
          </Button>
        </section>
      )}
    </div>
  );
}

function EventRow({
  event,
  active,
  canDelete,
  onSelect,
  onDelete,
}: {
  event: EventWithId;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-xl border bg-bg-card px-3 py-2.5',
        active ? 'border-accent' : 'border-line',
      )}
    >
      <button type="button" onClick={onSelect} className="flex-1 text-left">
        <p className="font-display text-base uppercase">{event.name}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          {event.year} · {event.status} · {event.venue || 'no venue'}
        </p>
      </button>
      {active && (
        <span className="rounded-md border border-accent bg-accent/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent">
          Active
        </span>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim hover:text-accent"
        >
          Delete
        </button>
      )}
    </div>
  );
}

function ErrorBox({ detail }: { detail: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] text-accent"
    >
      <p className="font-bold uppercase tracking-[0.06em]">Save failed</p>
      <p className="mt-1 normal-case opacity-80">{detail}</p>
    </div>
  );
}
