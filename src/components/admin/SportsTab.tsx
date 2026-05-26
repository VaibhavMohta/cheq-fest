import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { sportRef, sportsCol } from '@/lib/db';
import {
  ARENA_TYPES,
  SPORT_CATEGORIES,
  defaultSport,
  type ArenaType,
  type GenderRequirement,
  type SportCategory,
  type SportDoc,
} from '@/types/sport';
import { STANDARD_SPORTS } from '@/data/standardSports';
import { Button } from '@/components/shared/Button';
import { FormField, TextArea, TextInput } from './FormField';
import { RequireEvent } from './RequireEvent';

const sportsQk = (eventId: string) => ['admin', 'sports', eventId] as const;

export function SportsTab() {
  return <RequireEvent>{(_event, eventId) => <SportsTabInner eventId={eventId} />}</RequireEvent>;
}

function SportsTabInner({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const sports = useQuery({
    queryKey: sportsQk(eventId),
    queryFn: async () => {
      const snap = await getDocs(sportsCol(eventId));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const upsert = useMutation({
    mutationFn: async (args: { id: string; data: SportDoc }) => {
      await setDoc(sportRef(eventId, args.id), args.data, { merge: true });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sportsQk(eventId) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(sportsCol(eventId), id));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sportsQk(eventId) }),
  });

  const importStandard = useMutation({
    mutationFn: async () => {
      // Write each standard sport. setDoc with merge: false to fully replace
      // any existing doc at that id (so re-import gives you a clean slate).
      // Anything not in the standard list (custom sport admin added) is left
      // alone.
      const existingIds = new Set((sports.data ?? []).map((s) => s.id));
      const toWrite = STANDARD_SPORTS.filter((s) => !existingIds.has(s.id));
      await Promise.all(
        toWrite.map(({ id, ...rest }) => setDoc(sportRef(eventId, id), rest as SportDoc)),
      );
      return toWrite.length;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sportsQk(eventId) }),
  });

  if (sports.isLoading) return <p className="px-5 text-ink-dim">Loading sports…</p>;

  const existingIds = (sports.data ?? []).map((s) => s.id);
  const standardMissing = STANDARD_SPORTS.filter((s) => !existingIds.includes(s.id)).length;

  return (
    <div className="mx-5 flex flex-col gap-5">
      <p className="rounded-xl border border-dashed border-accent-3/40 bg-accent-3/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-accent-3">
        Each sport is editable. Use the AI Rulebook parser to seed sports from a PDF,
        or import the 16 standard CHEQ Fest sports below.
      </p>

      {standardMissing > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            CHEQ Fest standard sports
          </h2>
          <Button
            variant="ghost"
            type="button"
            disabled={importStandard.isPending}
            onClick={() => importStandard.mutate()}
          >
            {importStandard.isPending
              ? 'Importing…'
              : `Import ${standardMissing} standard sport${standardMissing === 1 ? '' : 's'}`}
          </Button>
          <p className="font-mono text-[10px] tracking-[0.06em] text-ink-mute">
            Cricket · Football · Tug of War · Relay · Badminton (×4) · TT (×4) · Pool (×2) · Pickleball (×2)
          </p>
          {importStandard.error && (
            <p className="font-mono text-[10px] text-accent">
              {importStandard.error instanceof Error
                ? importStandard.error.message
                : String(importStandard.error)}
            </p>
          )}
        </section>
      )}

      <AddSportForm
        onAdd={(id, data) => upsert.mutate({ id, data })}
        pending={upsert.isPending}
        existingIds={existingIds}
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
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">Add a custom sport</h2>
      <div className="flex gap-2">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chess"
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
      {error && <p className="font-mono text-[10px] text-accent">{error}</p>}
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
  const [showRules, setShowRules] = useState(false);

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
            {draft.parentCategory ? `${draft.parentCategory} · ` : ''}
            {draft.playersOnField}-a-side · {draft.points.win}/{draft.points.draw}/{draft.points.loss}
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">{id}</span>
      </button>

      {open && (
        <div className="border-t border-line p-3">
          {/* Basics */}
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Name">
              <TextInput
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </FormField>
            <FormField label="Category">
              <select
                value={draft.category ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, category: (e.target.value || undefined) as SportCategory | undefined })
                }
                className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm uppercase focus:border-accent focus:outline-none"
              >
                <option value="">— none —</option>
                {SPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
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
            <FormField label="Parent group" hint="e.g. Badminton (for variants)">
              <TextInput
                value={draft.parentCategory ?? ''}
                onChange={(e) => setDraft({ ...draft, parentCategory: e.target.value || undefined })}
              />
            </FormField>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <FormField label="On field">
              <TextInput
                type="number"
                min={1}
                value={draft.playersOnField}
                onChange={(e) =>
                  setDraft({ ...draft, playersOnField: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </FormField>
            <FormField label="To register">
              <TextInput
                type="number"
                min={1}
                value={draft.playersToRegister ?? draft.playersOnField + draft.substitutes}
                onChange={(e) =>
                  setDraft({ ...draft, playersToRegister: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </FormField>
            <FormField label="Subs">
              <TextInput
                type="number"
                min={0}
                value={draft.substitutes}
                onChange={(e) =>
                  setDraft({ ...draft, substitutes: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </FormField>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <FormField label="Duration">
              <TextInput
                value={draft.duration}
                onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
              />
            </FormField>
            <FormField label="Format">
              <TextInput
                value={draft.format}
                onChange={(e) => setDraft({ ...draft, format: e.target.value })}
              />
            </FormField>
          </div>

          {/* Points */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['win', 'draw', 'loss'] as const).map((k) => (
              <FormField label={k} key={k}>
                <TextInput
                  type="number"
                  min={0}
                  value={draft.points[k]}
                  onChange={(e) =>
                    setDraft({ ...draft, points: { ...draft.points, [k]: Number(e.target.value) || 0 } })
                  }
                />
              </FormField>
            ))}
          </div>

          {/* Gender / squad */}
          <GenderEditor
            value={draft.genderRequirement ?? null}
            onChange={(g) => setDraft({ ...draft, genderRequirement: g })}
          />

          {/* Show / hide the rule lists */}
          <button
            type="button"
            onClick={() => setShowRules((s) => !s)}
            className="mt-3 w-full rounded-xl border border-line bg-bg-elev px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink"
          >
            {showRules ? '↑ Hide rules' : '↓ Edit rules, faults, tiebreakers'}
          </button>

          {showRules && (
            <div className="mt-2 flex flex-col gap-2">
              <FormField label="Substitution rules">
                <TextInput
                  value={draft.substitutionRules ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, substitutionRules: e.target.value || undefined })
                  }
                />
              </FormField>
              <FormField label="Officials">
                <TextInput
                  value={draft.officials ?? ''}
                  onChange={(e) => setDraft({ ...draft, officials: e.target.value || undefined })}
                />
              </FormField>
              <FormField label="Over schedule" hint="Cricket only">
                <TextInput
                  value={draft.overSchedule ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, overSchedule: e.target.value || undefined })
                  }
                />
              </FormField>

              <ListField
                label="Scoring rules"
                hint="One rule per line"
                value={draft.scoringRules}
                onChange={(v) => setDraft({ ...draft, scoringRules: v })}
              />
              <ListField
                label="Bowling rules"
                hint="Cricket only"
                value={draft.bowlingRules}
                onChange={(v) => setDraft({ ...draft, bowlingRules: v })}
              />
              <ListField
                label="Fielding rules"
                hint="Cricket only"
                value={draft.fieldingRules}
                onChange={(v) => setDraft({ ...draft, fieldingRules: v })}
              />
              <ListField
                label="Gameplay rules"
                value={draft.gameplayRules}
                onChange={(v) => setDraft({ ...draft, gameplayRules: v })}
              />
              <ListField
                label="Faults"
                value={draft.faultsList}
                onChange={(v) => setDraft({ ...draft, faultsList: v })}
              />
              <ListField
                label="Tiebreakers"
                value={draft.tieBreakerRules}
                onChange={(v) => setDraft({ ...draft, tieBreakerRules: v })}
              />
              <FormField label="House rules">
                <TextArea
                  value={draft.houseRules ?? ''}
                  onChange={(e) => setDraft({ ...draft, houseRules: e.target.value || undefined })}
                />
              </FormField>

              <FormField label="Trackable events" hint="Comma-separated. Drives the referee console buttons.">
                <TextInput
                  value={(draft.trackableEvents ?? []).join(', ')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      trackableEvents: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </FormField>
              <FormField label="State fields" hint="Comma-separated. Live-match counters this sport tracks.">
                <TextInput
                  value={(draft.stateFields ?? []).join(', ')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stateFields: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </FormField>
            </div>
          )}

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

function GenderEditor({
  value,
  onChange,
}: {
  value: GenderRequirement | null;
  onChange: (next: GenderRequirement | null) => void;
}) {
  const enabled = value !== null;
  return (
    <div className="mt-2 rounded-xl border border-line bg-bg-elev/40 p-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? value ?? {} : null)}
          className="h-4 w-4 cursor-pointer accent-accent"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          Gender requirement
        </span>
      </label>
      {enabled && value && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <FormField label="Males required">
            <TextInput
              type="number"
              min={0}
              value={value.mandatoryMales ?? 0}
              onChange={(e) =>
                onChange({ ...value, mandatoryMales: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </FormField>
          <FormField label="Females required">
            <TextInput
              type="number"
              min={0}
              value={value.mandatoryFemales ?? 0}
              onChange={(e) =>
                onChange({ ...value, mandatoryFemales: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </FormField>
          <div className="col-span-2">
            <FormField label="Notes">
              <TextInput
                value={value.notes ?? ''}
                onChange={(e) => onChange({ ...value, notes: e.target.value || undefined })}
                placeholder="e.g. At least 1 female on the field at all times"
              />
            </FormField>
          </div>
        </div>
      )}
    </div>
  );
}

function ListField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}) {
  const text = (value ?? []).join('\n');
  return (
    <FormField label={label} hint={hint ?? 'One per line. Leave blank to omit.'}>
      <TextArea
        value={text}
        onChange={(e) => {
          const lines = e.target.value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(lines.length ? lines : undefined);
        }}
        className="min-h-[80px]"
      />
    </FormField>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
