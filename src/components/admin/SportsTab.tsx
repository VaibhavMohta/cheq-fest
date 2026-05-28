import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Timestamp,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { matchesCol, sportRef, sportsCol, teamsCol } from '@/lib/db';
import {
  ARENA_TYPES,
  SPORT_CATEGORIES,
  defaultSport,
  type ArenaType,
  type GenderRequirement,
  type SportCategory,
  type SportDoc,
  type TournamentConfig,
  type TournamentGroup,
} from '@/types/sport';
import type { TeamDoc } from '@/types/player';
import { emptyMatchState, type MatchStatus } from '@/types/match';
import { STANDARD_SPORTS } from '@/data/standardSports';
import { pairKey, pairsForRoundRobin } from '@/lib/tournament';
import { colorVarFor } from '@/types/team';
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
            eventId={eventId}
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
  eventId,
  onSave,
  onRemove,
  saving,
  removing,
}: {
  id: string;
  data: SportDoc;
  eventId: string;
  onSave: (data: SportDoc) => void;
  onRemove: () => void;
  saving: boolean;
  removing: boolean;
}) {
  const [draft, setDraft] = useState<SportDoc>(data);
  const [open, setOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showTournament, setShowTournament] = useState(false);

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

          {/* Tournament structure — opt-in. Hidden until expanded so
              admins not running a bracket aren't surprised by it. */}
          <button
            type="button"
            onClick={() => setShowTournament((s) => !s)}
            className="mt-3 w-full rounded-xl border border-line bg-bg-elev px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink"
          >
            {showTournament
              ? '↑ Hide tournament setup'
              : '↓ Tournament — groups, rounds, round-robin generator'}
          </button>

          {showTournament && (
            <div className="mt-2">
              <TournamentEditor
                eventId={eventId}
                sportId={id}
                sportName={draft.name}
                value={draft.tournament ?? null}
                onChange={(next) => setDraft({ ...draft, tournament: next })}
              />
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

const DEFAULT_ROUNDS: readonly string[] = ['Group', 'QF', 'SF', 'F'];

function emptyTournament(): TournamentConfig {
  return { groups: [], rounds: [...DEFAULT_ROUNDS] };
}

/**
 * Per-sport tournament structure editor. Pure UI — the parent holds the
 * draft state and persists via the existing Save button. The
 * "Generate round-robin" button writes match docs directly (those are
 * a separate concern from the sport doc and need no extra save click).
 */
function TournamentEditor({
  eventId,
  sportId,
  sportName,
  value,
  onChange,
}: {
  eventId: string;
  sportId: string;
  sportName: string;
  value: TournamentConfig | null;
  onChange: (next: TournamentConfig | null) => void;
}) {
  const qc = useQueryClient();
  const teams = useQuery({
    queryKey: ['admin', 'teams', eventId],
    queryFn: async () => {
      const snap = await getDocs(teamsCol(eventId));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const tc = value ?? emptyTournament();
  const setGroups = (next: TournamentGroup[]) => onChange({ ...tc, groups: next });
  const setRounds = (next: string[]) => onChange({ ...tc, rounds: next });

  const teamMap = useMemo(() => {
    const m = new Map<string, TeamDoc>();
    for (const t of teams.data ?? []) m.set(t.id, t);
    return m;
  }, [teams.data]);

  // Round-robin generator. Reads existing matches in this sport+group so
  // re-runs don't create duplicates.
  const generate = useMutation({
    mutationFn: async (group: TournamentGroup) => {
      const existing = await getDocs(
        query(
          matchesCol(eventId),
          where('sportId', '==', sportId),
          where('group', '==', group.id),
        ),
      );
      const taken = new Set<string>();
      for (const d of existing.docs) {
        const m = d.data();
        taken.add(pairKey(m.teamAId, m.teamBId));
      }
      const pairs = pairsForRoundRobin(group.teamIds);
      const toCreate = pairs.filter(([a, b]) => !taken.has(pairKey(a, b)));
      await Promise.all(
        toCreate.map(([a, b]) =>
          addDoc(matchesCol(eventId), {
            sportId,
            teamAId: a,
            teamBId: b,
            scheduledStart: null,
            venue: '',
            refereeUids: [],
            state: emptyMatchState(),
            status: 'scheduled' satisfies MatchStatus,
            winnerTeamId: null,
            pointsAwardedAt: null,
            createdAt: serverTimestamp() as unknown as Timestamp,
            group: group.id,
            round: 'Group',
          }),
        ),
      );
      return { created: toCreate.length, skipped: pairs.length - toCreate.length };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'matches', eventId] });
    },
  });

  const allTeamIdsAssigned = new Set<string>(tc.groups.flatMap((g) => g.teamIds));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line bg-bg-elev/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
        {tc.groups.length === 0 && tc.rounds.length === 0
          ? `Configure ${sportName} tournament structure (optional)`
          : `${sportName} · ${tc.groups.length} group${tc.groups.length === 1 ? '' : 's'} · ${tc.rounds.length} round${tc.rounds.length === 1 ? '' : 's'}`}
      </p>

      {/* Rounds */}
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute">
          Rounds (purely cosmetic labels on match docs)
        </p>
        <RoundsEditor value={tc.rounds} onChange={setRounds} />
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute">
          Groups
        </p>
        {tc.groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            No groups · add one below
          </p>
        ) : (
          tc.groups.map((g, idx) => (
            <GroupEditor
              key={g.id}
              group={g}
              allTeams={teams.data ?? []}
              teamMap={teamMap}
              alreadyAssigned={allTeamIdsAssigned}
              onChange={(next) => {
                const copy = [...tc.groups];
                copy[idx] = next;
                setGroups(copy);
              }}
              onDelete={() => {
                if (
                  window.confirm(
                    `Delete group "${g.name}"? Existing matches keep their group="${g.id}" tag but the group disappears from the dropdowns.`,
                  )
                ) {
                  setGroups(tc.groups.filter((_, i) => i !== idx));
                }
              }}
              onGenerate={async () => {
                if (g.teamIds.length < 2) {
                  window.alert('Need at least 2 teams in the group to generate a round-robin.');
                  return;
                }
                const result = await generate.mutateAsync(g);
                window.alert(
                  `Created ${result.created} match${result.created === 1 ? '' : 'es'}` +
                    (result.skipped > 0
                      ? `. Skipped ${result.skipped} that already exist.`
                      : '.'),
                );
              }}
              generating={generate.isPending && generate.variables?.id === g.id}
            />
          ))
        )}
        <Button
          variant="ghost"
          type="button"
          className="!w-auto !self-start !px-3 !py-1.5"
          onClick={() => {
            const usedIds = new Set(tc.groups.map((g) => g.id));
            const fresh = nextGroupId(usedIds);
            setGroups([
              ...tc.groups,
              { id: fresh, name: `Group ${fresh}`, teamIds: [] },
            ]);
          }}
        >
          + Add group
        </Button>
      </div>

      {value !== null && (
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'Remove the tournament structure for this sport? Existing matches keep their group/round tags but the dropdowns and generator disappear.',
              )
            ) {
              onChange(null);
            }
          }}
          className="self-start font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute hover:text-accent"
        >
          Clear tournament setup
        </button>
      )}
    </div>
  );
}

function nextGroupId(used: Set<string>): string {
  // A → Z; falls back to a uuid suffix if somehow all are taken.
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(65 + i);
    if (!used.has(ch)) return ch;
  }
  return `G${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function RoundsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [pending, setPending] = useState('');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {value.length === 0 && (
          <span className="font-mono text-[10px] text-ink-mute">
            No rounds · add labels like "Group", "QF", "F"
          </span>
        )}
        {value.map((r, idx) => (
          <span
            key={`${r}-${idx}`}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink"
          >
            {r}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
              className="text-ink-mute hover:text-accent"
              aria-label={`Remove ${r}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <TextInput
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          placeholder="Add round (e.g. QF, R1, Final)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = pending.trim();
              if (v && !value.includes(v)) onChange([...value, v]);
              setPending('');
            }
          }}
        />
        <Button
          variant="ghost"
          type="button"
          className="!w-auto !px-3 !py-1.5"
          onClick={() => {
            const v = pending.trim();
            if (!v) return;
            if (value.includes(v)) return;
            onChange([...value, v]);
            setPending('');
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function GroupEditor({
  group,
  allTeams,
  teamMap,
  alreadyAssigned,
  onChange,
  onDelete,
  onGenerate,
  generating,
}: {
  group: TournamentGroup;
  allTeams: Array<TeamDoc & { id: string }>;
  teamMap: Map<string, TeamDoc>;
  alreadyAssigned: Set<string>;
  onChange: (next: TournamentGroup) => void;
  onDelete: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const memberSet = new Set(group.teamIds);
  // Unassigned = teams not in this group AND not in any other group.
  // We still show "in another group" teams as disabled chips so the
  // admin can see why they can't pick them.
  const available = allTeams.filter((t) => !memberSet.has(t.id));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg-card p-2.5">
      <div className="flex items-center gap-2">
        <TextInput
          value={group.name}
          onChange={(e) => onChange({ ...group, name: e.target.value })}
          className="!flex-1"
          placeholder="Group A"
        />
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
          id · {group.id}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-line bg-bg px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute hover:text-accent"
        >
          delete
        </button>
      </div>

      {/* Current members */}
      <div className="flex flex-wrap gap-1">
        {group.teamIds.length === 0 ? (
          <span className="font-mono text-[10px] text-ink-mute">
            No teams in this group yet
          </span>
        ) : (
          group.teamIds.map((tid) => {
            const t = teamMap.get(tid);
            const color = t ? colorVarFor(t.color) : 'var(--ink-mute)';
            return (
              <span
                key={tid}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]"
                style={{
                  color,
                  borderColor: 'color-mix(in oklab, currentColor 40%, transparent)',
                }}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
                {t?.name ?? tid}
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...group,
                      teamIds: group.teamIds.filter((x) => x !== tid),
                    })
                  }
                  className="text-ink-mute hover:text-accent"
                  aria-label={`Remove ${t?.name ?? tid}`}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>

      {/* Add team dropdown */}
      <div className="flex gap-2">
        <select
          value=""
          onChange={(e) => {
            const tid = e.target.value;
            if (!tid) return;
            onChange({ ...group, teamIds: [...group.teamIds, tid] });
          }}
          className="flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">+ Add team to this group…</option>
          {available.map((t) => {
            const inOther = alreadyAssigned.has(t.id) && !memberSet.has(t.id);
            return (
              <option key={t.id} value={t.id}>
                {t.name}
                {inOther ? ' · (in another group)' : ''}
              </option>
            );
          })}
        </select>
        <Button
          type="button"
          disabled={generating}
          onClick={onGenerate}
          className="!w-auto !px-3 !py-2"
        >
          {generating ? 'Generating…' : 'Generate round-robin'}
        </Button>
      </div>
    </div>
  );
}
