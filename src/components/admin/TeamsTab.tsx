import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import clsx from 'clsx';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { teamRef, teamsCol } from '@/lib/db';
import { storage } from '@/lib/firebase';
import { TEAM_PALETTE, colorVarFor, colorLabelFor, flagInitials } from '@/types/team';
import { suggestTeamColor, type ColorSuggestion } from '@/lib/suggestTeamColor';
import type { TeamDoc } from '@/types/player';
import { FormField, TextInput } from './FormField';
import { RequireEvent } from './RequireEvent';
import { TeamDetail } from './TeamDetail';

const teamsQk = (eventId: string) => ['admin', 'teams', eventId] as const;

export function TeamsTab() {
  return <RequireEvent>{(_event, eventId) => <TeamsTabInner eventId={eventId} />}</RequireEvent>;
}

type TeamWithId = TeamDoc & { id: string };

function TeamsTabInner({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  const teams = useQuery({
    queryKey: teamsQk(eventId),
    queryFn: async (): Promise<TeamWithId[]> => {
      const snap = await getDocs(teamsCol(eventId));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const create = useMutation({
    mutationFn: async (args: {
      name: string;
      color: string;
      jerseyUrl: string | null;
    }) => {
      const id = slugify(args.name);
      if (!id) throw new Error('Empty team name.');
      const existing = teams.data?.some((t) => t.id === id);
      if (existing) throw new Error(`Team "${args.name}" already exists.`);
      await setDoc(teamRef(eventId, id), {
        name: args.name.trim(),
        color: args.color,
        logoUrl: null,
        jerseyUrl: args.jerseyUrl,
        members: [],
        groupCaptainEmail: null,
        viceCaptainEmail: null,
        totalPoints: 0,
        createdAt: Timestamp.now(),
      });
      return id;
    },
    onSuccess: (newId) => {
      void qc.invalidateQueries({ queryKey: teamsQk(eventId) });
      setOpenTeamId(newId);
    },
  });

  if (teams.isLoading) {
    return <p className="px-5 text-ink-dim">Loading teams…</p>;
  }

  if (openTeamId) {
    return (
      <TeamDetail
        eventId={eventId}
        teamId={openTeamId}
        onClose={() => setOpenTeamId(null)}
      />
    );
  }

  return (
    <div className="mx-5 flex flex-col gap-5">
      <CreateTeamForm
        eventId={eventId}
        onCreate={(args) => create.mutate(args)}
        pending={create.isPending}
        error={create.error instanceof Error ? create.error.message : null}
        existingColors={(teams.data ?? []).map((t) => t.color)}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          {(teams.data ?? []).length} team{(teams.data ?? []).length === 1 ? '' : 's'}
        </h2>
        {(teams.data ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
            No teams yet · add one above
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {teams.data!.map((t) => (
              <TeamCard key={t.id} team={t} onOpen={() => setOpenTeamId(t.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CreateTeamForm({
  eventId,
  onCreate,
  pending,
  error,
  existingColors,
}: {
  eventId: string;
  onCreate: (args: { name: string; color: string; jerseyUrl: string | null }) => void;
  pending: boolean;
  error: string | null;
  existingColors: string[];
}) {
  const [name, setName] = useState('');
  const [jerseyUrl, setJerseyUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ColorSuggestion[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const takenSet = new Set(existingColors.map((c) => c.toLowerCase()));

  const analyze = useMutation({
    // Accept the path as an argument so we can kick this off from
    // uploadJersey.onSuccess without waiting for jerseyPath state to settle.
    mutationFn: async (storagePath: string) => {
      return suggestTeamColor({ storagePath, excludeColors: existingColors });
    },
    onSuccess: (result) => {
      setSuggestions(result);
      // Auto-pick the top suggestion so the Create button activates
      // immediately if the admin trusts the AI.
      if (!picked) setPicked(result[0]?.color ?? null);
    },
  });

  const uploadJersey = useMutation({
    mutationFn: async (file: File) => {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `events/${eventId}/jersey-temp/${Date.now()}.${ext}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
      const url = await getDownloadURL(r);
      return { path, url };
    },
    onSuccess: (result) => {
      setJerseyUrl(result.url);
      setSuggestions(null);
      setPicked(null);
      // Kick off analysis immediately — no separate button press.
      analyze.mutate(result.path);
    },
  });

  const nameValid = name.trim().length > 0;
  const availablePalette = TEAM_PALETTE.filter((c) => !takenSet.has(c.hex.toLowerCase()));
  const allColorsTaken = availablePalette.length === 0;
  // Rank: AI top suggestions float to the front of the swatch row.
  const aiRank = new Map<string, number>();
  (suggestions ?? []).forEach((s, i) => {
    aiRank.set(s.color.toLowerCase(), i);
  });
  const swatches = [...TEAM_PALETTE].sort((a, b) => {
    const ai = aiRank.get(a.hex.toLowerCase()) ?? 99;
    const bi = aiRank.get(b.hex.toLowerCase()) ?? 99;
    if (ai !== bi) return ai - bi;
    return 0;
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        Create team
      </h2>

      {allColorsTaken && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-accent">
          Every palette color is taken — delete a team before adding another.
        </p>
      )}

      <FormField label="Team name" hint="Step 1 of 3">
        <TextInput
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            // Invalidate suggestions if name changes after analysis.
            if (suggestions) {
              setSuggestions(null);
              setPicked(null);
            }
          }}
          placeholder="Tridents"
          maxLength={32}
        />
      </FormField>

      {nameValid && (
        <FormField
          label="Jersey photo"
          hint="Step 2 of 3 · The AI looks at this to recommend a brand color."
        >
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line bg-bg-card/40 px-3 py-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-bg">
              {jerseyUrl ? (
                <img src={jerseyUrl} alt="" className="h-full w-full object-cover" />
              ) : uploadJersey.isPending ? (
                <span className="font-mono text-[10px] text-ink-mute">…</span>
              ) : (
                <span className="font-display text-2xl text-ink-mute">+</span>
              )}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              {uploadJersey.isPending
                ? 'Uploading…'
                : analyze.isPending
                  ? 'Analyzing colors…'
                  : jerseyUrl
                    ? 'Tap to replace · re-analyze'
                    : 'Tap to upload jersey'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadJersey.mutate(f);
                e.target.value = '';
              }}
              disabled={uploadJersey.isPending || pending || allColorsTaken}
            />
          </label>
        </FormField>
      )}

      {analyze.error && (
        <p className="font-mono text-[10px] text-accent">
          AI analysis failed:{' '}
          {analyze.error instanceof Error ? analyze.error.message : String(analyze.error)}
          {' · You can still pick a color manually below.'}
        </p>
      )}

      {/* Show the palette as soon as a name is entered, even before a jersey
          is uploaded. AI suggestions float to the top of the swatch row + a
          rationale strip appears above once analysis finishes. */}
      {nameValid && (
        <FormField
          label="Pick color"
          hint={
            jerseyUrl
              ? 'Step 3 of 3 · AI matches appear with rationale; tap any swatch to override.'
              : 'Pick any palette color, or upload a jersey above to get AI matches.'
          }
        >
          <div className="flex flex-col gap-2">
            {/* AI status / rationale strip */}
            {analyze.isPending && (
              <p className="rounded-xl border border-dashed border-accent-2/40 bg-accent-2/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-accent-2">
                ✨ Analyzing jersey colors with AI… palette is live below, pick anytime
              </p>
            )}
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {suggestions.map((s, idx) => {
                  const isPicked = picked?.toLowerCase() === s.color.toLowerCase();
                  return (
                    <button
                      key={s.color}
                      type="button"
                      onClick={() => setPicked(s.color)}
                      className="flex items-center gap-3 rounded-xl border bg-bg-card px-3 py-2 text-left transition active:scale-[0.99]"
                      style={{
                        borderColor: isPicked ? colorVarFor(s.color) : 'var(--line)',
                        boxShadow: isPicked ? `inset 0 0 0 1px ${colorVarFor(s.color)}` : undefined,
                      }}
                    >
                      <span
                        aria-hidden
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[10px] text-bg"
                        style={{ background: colorVarFor(s.color) }}
                      >
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="font-display text-sm uppercase tracking-[0.06em]">
                            {colorLabelFor(s.color)}
                          </span>
                          <span className="rounded-md border border-accent-2/40 bg-accent-2/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-accent-2">
                            AI {idx + 1}
                          </span>
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] tracking-[0.04em] text-ink-dim">
                          {s.rationale}
                        </span>
                      </span>
                      {isPicked && (
                        <span
                          className="font-mono text-[10px] font-bold"
                          style={{ color: colorVarFor(s.color) }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Full palette row — always rendered. Taken colors are greyed
                out and disabled (visible so admins see what's claimed).
                AI top picks float to the front with a small rank chip. */}
            <div className="mt-1">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
                Palette · {availablePalette.length}/{TEAM_PALETTE.length} available
              </p>
              <div className="grid grid-cols-7 gap-2">
                {swatches.map((c) => {
                  const taken = takenSet.has(c.hex.toLowerCase());
                  const isPicked = picked?.toLowerCase() === c.hex.toLowerCase();
                  const rank = aiRank.get(c.hex.toLowerCase());
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      disabled={taken}
                      onClick={() => !taken && setPicked(c.hex)}
                      aria-label={`${c.label}${taken ? ' (taken)' : ''}`}
                      title={taken ? `${c.label} — already used` : c.label}
                      className={clsx(
                        'relative grid h-10 w-10 place-items-center rounded-full transition',
                        taken ? 'cursor-not-allowed' : 'active:scale-[0.96]',
                      )}
                      style={{
                        background: c.hex,
                        opacity: taken ? 0.25 : 1,
                        filter: taken ? 'grayscale(0.6)' : undefined,
                        boxShadow: isPicked
                          ? `0 0 0 2px var(--ink), 0 0 0 4px ${c.hex}`
                          : undefined,
                      }}
                    >
                      {taken ? (
                        <span className="font-mono text-[10px] font-bold text-bg">×</span>
                      ) : isPicked ? (
                        <span className="font-mono text-[10px] font-bold text-bg">✓</span>
                      ) : null}
                      {rank !== undefined && !taken && (
                        <span
                          aria-hidden
                          className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-bg bg-accent-2 font-mono text-[8px] font-bold text-bg"
                        >
                          {rank + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </FormField>
      )}

      {(error || localError) && (
        <p className="font-mono text-[10px] text-accent">{error ?? localError}</p>
      )}

      <Button
        type="button"
        disabled={pending || !nameValid || !picked || allColorsTaken}
        onClick={() => {
          if (!nameValid) {
            setLocalError('Enter a team name.');
            return;
          }
          if (!picked) {
            setLocalError('Upload a jersey + analyze, then pick a color.');
            return;
          }
          setLocalError(null);
          onCreate({ name: name.trim(), color: picked, jerseyUrl });
          // Reset wizard.
          setName('');
          setJerseyUrl(null);
          setSuggestions(null);
          setPicked(null);
        }}
      >
        {pending ? 'Creating…' : picked ? `Create ${name.trim() || 'team'} (${colorLabelFor(picked)})` : 'Create team'}
      </Button>
    </section>
  );
}

function TeamCard({ team, onOpen }: { team: TeamWithId; onOpen: () => void }) {
  const color = colorVarFor(team.color);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition active:scale-[0.98]"
      style={{ borderColor: 'color-mix(in oklab, currentColor 40%, transparent)', color }}
    >
      {team.logoUrl ? (
        <Avatar
          name={team.name}
          adminPhotoUrl={team.logoUrl}
          size={40}
          surfaceColor="var(--bg-card)"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-full font-display text-sm text-bg"
          style={{ background: color }}
        >
          {flagInitials(team.name)}
        </span>
      )}
      <span className="mt-1 font-display text-base uppercase text-ink">{team.name}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] opacity-70">
        {team.members.length} player{team.members.length === 1 ? '' : 's'}
        {team.groupCaptainEmail ? ' · GC ✓' : ' · No GC'}
      </span>
    </button>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
