import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { eventRef } from '@/lib/db';
import { defaultEvent, EVENT_STATUSES, type EventDoc, type EventStatus } from '@/types/event';
import { Button } from '@/components/shared/Button';
import { FormField, TextInput } from './FormField';

const EVENT_QK = ['event', 'current'] as const;

export function EventTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: EVENT_QK,
    queryFn: async () => {
      const snap = await getDoc(eventRef);
      return snap.exists() ? snap.data() : null;
    },
  });

  const [draft, setDraft] = useState<EventDoc | null>(null);

  useEffect(() => {
    if (data !== undefined && draft === null) {
      setDraft(data ?? defaultEvent(new Date().getFullYear()));
    }
  }, [data, draft]);

  const save = useMutation({
    mutationFn: async (next: EventDoc) => {
      await setDoc(eventRef, next, { merge: true });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: EVENT_QK });
    },
  });

  if (isLoading || !draft) {
    return <p className="px-5 text-ink-dim">Loading event…</p>;
  }

  if (error) {
    return (
      <ErrorBox
        title="Could not load event"
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  return (
    <form
      className="mx-5 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(draft);
      }}
    >
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
          <TextInput
            type="date"
            value={timestampToDateInput(draft.startDate)}
            onChange={(e) => setDraft({ ...draft, startDate: dateInputToTimestamp(e.target.value) })}
          />
        </FormField>
        <FormField label="End Date">
          <TextInput
            type="date"
            value={timestampToDateInput(draft.endDate)}
            onChange={(e) => setDraft({ ...draft, endDate: dateInputToTimestamp(e.target.value) })}
          />
        </FormField>
      </div>

      <FormField label="Venue">
        <TextInput
          value={draft.venue}
          onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
          placeholder="Bengaluru HQ"
        />
      </FormField>

      <FormField label="Logo URL" hint="Paste a public image URL. Storage upload lands later.">
        <TextInput
          value={draft.logoUrl ?? ''}
          onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value || null })}
          placeholder="https://…"
          type="url"
        />
      </FormField>

      {save.error && (
        <ErrorBox
          title="Save failed"
          detail={save.error instanceof Error ? save.error.message : String(save.error)}
        />
      )}

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved ✓' : 'Save Event'}
      </Button>
    </form>
  );
}

function timestampToDateInput(ts: Timestamp | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInputToTimestamp(value: string): Timestamp | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Timestamp.fromDate(new Date(y, m - 1, d));
}

function ErrorBox({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] text-accent"
    >
      <p className="font-bold uppercase tracking-[0.06em]">{title}</p>
      <p className="mt-1 normal-case opacity-80">{detail}</p>
    </div>
  );
}
