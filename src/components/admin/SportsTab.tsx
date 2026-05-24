import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { sportRef, sportsCol } from '@/lib/db';
import {
  ARENA_TYPES,
  defaultSport,
  type ArenaType,
  type SportDoc,
} from '@/types/sport';
import { Button } from '@/components/shared/Button';
import { FormField, TextInput } from './FormField';

const SPORTS_QK = ['admin', 'sports'] as const;

export function SportsTab() {
  const qc = useQueryClient();
  const sports = useQuery({
    queryKey: SPORTS_QK,
    queryFn: async () => {
      const snap = await getDocs(sportsCol);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const upsert = useMutation({
    mutationFn: async (args: { id: string; data: SportDoc }) => {
      await setDoc(sportRef(args.id), args.data, { merge: true });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: SPORTS_QK }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(sportsCol, id));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: SPORTS_QK }),
  });

  if (sports.isLoading) return <p className="px-5 text-ink-dim">Loading sports…</p>;

  return (
    <div className="mx-5 flex flex-col gap-5">
      <p className="rounded-xl border border-dashed border-accent-3/40 bg-accent-3/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-accent-3">
        Step 12 will parse the rulebook PDF and pre-fill this list. Today: manual entry.
      </p>

      <AddSportForm
        onAdd={(id, data) => upsert.mutate({ id, data })}
        pending={upsert.isPending}
        existingIds={(sports.data ?? []).map((s) => s.id)}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          {(sports.data ?? []).length} sport{(sports.data ?? []).length === 1 ? '' : 's'}
        </h2>
        {(sports.data ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
            No sports yet
          </p>
        )}
        {(sports.data ?? []).map((s) => (
          <SportRow
            key={s.id}
            id={s.id}
            data={s}
            onSave={(data) => upsert.mutate({ id: s.id, data })}
            onRemove={() => remove.mutate(s.id)}
            saving={upsert.isPending && upsert.variables?.id === s.id}
            removing={remove.isPending && remove.variables === s.id}
          />
        ))}
      </section>
    </div>
  );
}

function AddSportForm({
  onAdd,
  pending,
  existingIds,
}: {
  onAdd: (id: string, data: SportDoc) => void;
  pending: boolean;
  existingIds: string[];
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">Add sport</h2>
      <div className="flex gap-2">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Football"
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const trimmed = name.trim();
            if (!trimmed) {
              setError('Enter a name.');
              return;
            }
            const id = slugify(trimmed);
            if (existingIds.includes(id)) {
              setError(`"${trimmed}" already exists.`);
              return;
            }
            setError(null);
            onAdd(id, defaultSport(trimmed));
            setName('');
          }}
          className="!w-auto !px-4 !py-2"
        >
          Add
        </Button>
      </div>
      {error && (
        <p className="font-mono text-[10px] text-accent">{error}</p>
      )}
    </section>
  );
}

function SportRow({
  id,
  data,
  onSave,
  onRemove,
  saving,
  removing,
}: {
  id: string;
  data: SportDoc;
  onSave: (data: SportDoc) => void;
  onRemove: () => void;
  saving: boolean;
  removing: boolean;
}) {
  const [draft, setDraft] = useState<SportDoc>(data);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-line bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base uppercase">{draft.name}</span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
            {draft.playersOnField}-a-side · {draft.points.win}/{draft.points.draw}/{draft.points.loss}
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
          {id}
        </span>
      </button>

      {open && (
        <div className="border-t border-line p-3">
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Arena">
              <select
                value={draft.arenaType}
                onChange={(e) => setDraft({ ...draft, arenaType: e.target.value as ArenaType })}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm uppercase focus:border-accent focus:outline-none"
              >
                {ARENA_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Players on field">
              <TextInput
                type="number"
                min={1}
                max={15}
                value={draft.playersOnField}
                onChange={(e) =>
                  setDraft({ ...draft, playersOnField: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </FormField>
            <FormField label="Substitutes">
              <TextInput
                type="number"
                min={0}
                max={20}
                value={draft.substitutes}
                onChange={(e) =>
                  setDraft({ ...draft, substitutes: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </FormField>
            <FormField label="Duration">
              <TextInput
                value={draft.duration}
                onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
                placeholder="2 × 15 min"
              />
            </FormField>
          </div>

          <FormField label="Format">
            <TextInput
              value={draft.format}
              onChange={(e) => setDraft({ ...draft, format: e.target.value })}
              placeholder="5-a-side · roll subs"
            />
          </FormField>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <FormField label="Win">
              <TextInput
                type="number"
                min={0}
                value={draft.points.win}
                onChange={(e) =>
                  setDraft({ ...draft, points: { ...draft.points, win: Number(e.target.value) || 0 } })
                }
              />
            </FormField>
            <FormField label="Draw">
              <TextInput
                type="number"
                min={0}
                value={draft.points.draw}
                onChange={(e) =>
                  setDraft({ ...draft, points: { ...draft.points, draw: Number(e.target.value) || 0 } })
                }
              />
            </FormField>
            <FormField label="Loss">
              <TextInput
                type="number"
                min={0}
                value={draft.points.loss}
                onChange={(e) =>
                  setDraft({ ...draft, points: { ...draft.points, loss: Number(e.target.value) || 0 } })
                }
              />
            </FormField>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              disabled={saving}
              onClick={() => onSave(draft)}
              className="!flex-1"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={removing}
              onClick={() => {
                if (window.confirm(`Delete "${draft.name}"?`)) onRemove();
              }}
              className="!w-auto !px-4"
            >
              {removing ? '…' : 'Delete'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
