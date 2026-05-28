import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Timestamp,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { matchesCol, matchRef, sportsCol, teamsCol } from '@/lib/db';
import { emptyMatchState, type MatchDoc, type MatchStatus } from '@/types/match';
import type { TeamId } from '@/types/team';
import type { TournamentConfig } from '@/types/sport';
import { useAllEventPlayers, type PersonRow } from '@/lib/playerDirectory';
import { PlayerPicker } from '@/components/shared/PlayerPicker';

type TeamOption = { id: TeamId; name: string };

/** Resolve a team id to a display name from the loaded team list. Falls
 *  back to the raw id (never an empty string) when the team is missing —
 *  e.g. for stale match docs that point at a deleted team. */
function teamNameFor(teamId: TeamId, teams: TeamOption[]): string {
  const team = teams.find((t) => t.id === teamId);
  if (team && team.name.trim()) return team.name;
  return teamId;
}
import { Button } from '@/components/shared/Button';
import { Chip, type ChipVariant } from '@/components/shared/Chip';
import { DateTimePicker } from '@/components/shared/DateTimePicker';
import { FormField, TextInput } from './FormField';
import { RequireEvent } from './RequireEvent';

const matchesQk = (eventId: string) => ['admin', 'matches', eventId] as const;
const sportsQk = (eventId: string) => ['admin', 'sports', eventId] as const;
const teamsQk = (eventId: string) => ['admin', 'teams', eventId] as const;

export function MatchesTab() {
  return (
    <RequireEvent>
      {(event, eventId) => {
        const eventStart = event.startDate?.toDate() ?? null;
        const eventEnd = event.endDate?.toDate() ?? null;
        if (!eventStart || !eventEnd) {
          return (
            <div className="mx-5 rounded-2xl border border-dashed border-accent/40 bg-accent/5 px-4 py-6 text-center">
              <p className="font-display text-base uppercase tracking-[0.08em] text-accent">
                Set event dates first
              </p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-dim">
                Matches must be scheduled inside the event's date range.
                Open the <span className="text-ink">Event</span> tab and
                pick a start + end date before creating matches.
              </p>
            </div>
          );
        }
        return (
          <MatchesTabInner
            eventId={eventId}
            eventStart={eventStart}
            eventEnd={eventEnd}
          />
        );
      }}
    </RequireEvent>
  );
}

function MatchesTabInner({
  eventId,
  eventStart,
  eventEnd,
}: {
  eventId: string;
  eventStart: Date;
  eventEnd: Date;
}) {
  const qc = useQueryClient();

  const sports = useQuery({
    queryKey: sportsQk(eventId),
    queryFn: async () => {
      const snap = await getDocs(sportsCol(eventId));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });
  const teams = useQuery({
    queryKey: teamsQk(eventId),
    queryFn: async () => {
      const snap = await getDocs(teamsCol(eventId));
      return snap.docs.map((d) => ({ id: d.id as TeamId, ...d.data() }));
    },
  });
  const { people, isLoading: peopleLoading } = useAllEventPlayers();
  const matches = useQuery({
    queryKey: matchesQk(eventId),
    queryFn: async () => {
      const snap = await getDocs(query(matchesCol(eventId), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const peopleByUid = useMemo(() => {
    const m = new Map<string, PersonRow>();
    for (const p of people) if (p.uid) m.set(p.uid, p);
    return m;
  }, [people]);

  const create = useMutation({
    mutationFn: async (args: {
      sportId: string;
      teamAId: TeamId;
      teamBId: TeamId;
      scheduledStart: Timestamp | null;
      venue: string;
      group?: string | null;
      round?: string | null;
    }) => {
      await addDoc(matchesCol(eventId), {
        ...args,
        refereeUids: [],
        state: emptyMatchState(),
        status: 'scheduled' satisfies MatchStatus,
        winnerTeamId: null,
        pointsAwardedAt: null,
        createdAt: serverTimestamp() as unknown as Timestamp,
        group: args.group ?? null,
        round: args.round ?? null,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: matchesQk(eventId) }),
  });

  const updateMatch = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<MatchDoc> }) => {
      await setDoc(matchRef(eventId, args.id), args.patch, { merge: true });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: matchesQk(eventId) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(matchesCol(eventId), id));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: matchesQk(eventId) }),
  });

  if (sports.isLoading || teams.isLoading || peopleLoading) {
    return <p className="px-5 text-ink-dim">Loading…</p>;
  }

  // Only keep teams that have a non-empty name. A team doc with a blank
  // name has nothing meaningful to render in a picker — silently exclude
  // it so the dropdown never shows a blank option.
  const availableTeams: TeamOption[] = (teams.data ?? [])
    .filter((t) => typeof t.name === 'string' && t.name.trim().length > 0)
    .map((t) => ({ id: t.id, name: t.name }));
  const availableSports = (sports.data ?? []).filter(
    (s) => typeof s.name === 'string' && s.name.trim().length > 0,
  );

  return (
    <div className="mx-5 flex flex-col gap-5">
      <CreateMatchForm
        sports={availableSports}
        teams={availableTeams}
        eventStart={eventStart}
        eventEnd={eventEnd}
        pending={create.isPending}
        onCreate={(args) => create.mutate(args)}
      />

      <MatchList
        matches={matches.data ?? []}
        sports={availableSports}
        teams={availableTeams}
        people={people}
        peopleByUid={peopleByUid}
        onPatch={(id, patch) => updateMatch.mutate({ id, patch })}
        onRemove={(id) => remove.mutate(id)}
      />
    </div>
  );
}

function CreateMatchForm({
  sports,
  teams,
  eventStart,
  eventEnd,
  pending,
  onCreate,
}: {
  sports: { id: string; name: string; tournament?: TournamentConfig | null }[];
  teams: TeamOption[];
  eventStart: Date;
  eventEnd: Date;
  pending: boolean;
  onCreate: (args: {
    sportId: string;
    teamAId: TeamId;
    teamBId: TeamId;
    scheduledStart: Timestamp | null;
    venue: string;
    group: string | null;
    round: string | null;
  }) => void;
}) {
  const [sportId, setSportId] = useState<string>('');
  const [teamAId, setTeamAId] = useState<TeamId | ''>('');
  const [teamBId, setTeamBId] = useState<TeamId | ''>('');
  const [scheduled, setScheduled] = useState<Date | null>(null);
  const [venue, setVenue] = useState<string>('');
  const [group, setGroup] = useState<string>(''); // '' = None
  const [round, setRound] = useState<string>(''); // '' = None
  const [error, setError] = useState<string | null>(null);
  // Reset group/round if the picked sport has no tournament config for
  // them — otherwise stale state from a previous pick would persist.
  const tournament = sports.find((s) => s.id === sportId)?.tournament ?? null;
  const availableGroups = tournament?.groups ?? [];
  const availableRounds = tournament?.rounds ?? [];

  const canCreate =
    sports.length > 0 && teams.length >= 2 && sportId && teamAId && teamBId && teamAId !== teamBId;

  if (sports.length === 0 || teams.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-4 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
        Add at least 2 teams and 1 sport before creating matches.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        New Match
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Sport">
          <select
            value={sportId}
            onChange={(e) => {
              setSportId(e.target.value);
              // Drop any group/round picked for a different sport's
              // tournament — those keys may be undefined for the new
              // sport and would silently misroute.
              setGroup('');
              setRound('');
            }}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase focus:border-accent focus:outline-none"
          >
            <option value="">Pick…</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label="Scheduled"
          hint={`Within event window: ${formatRange(eventStart, eventEnd)}`}
        >
          <DateTimePicker
            value={scheduled}
            onChange={(d) => setScheduled(d)}
            placeholder="dd-mm-yyyy --:--"
            minDate={eventStart}
            maxDate={eventEnd}
          />
        </FormField>
        <FormField label="Team A">
          <select
            value={teamAId}
            onChange={(e) => setTeamAId(e.target.value as TeamId)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase focus:border-accent focus:outline-none"
          >
            <option value="">Pick…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Team B">
          <select
            value={teamBId}
            onChange={(e) => setTeamBId(e.target.value as TeamId)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase focus:border-accent focus:outline-none"
          >
            <option value="">Pick…</option>
            {teams
              .filter((t) => t.id !== teamAId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </FormField>
      </div>
      {(availableGroups.length > 0 || availableRounds.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <FormField
            label="Group"
            hint={availableGroups.length === 0 ? 'None defined for this sport.' : undefined}
          >
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              disabled={availableGroups.length === 0}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase focus:border-accent focus:outline-none disabled:opacity-50"
            >
              <option value="">None</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Round"
            hint={availableRounds.length === 0 ? 'None defined for this sport.' : undefined}
          >
            <select
              value={round}
              onChange={(e) => setRound(e.target.value)}
              disabled={availableRounds.length === 0}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase focus:border-accent focus:outline-none disabled:opacity-50"
            >
              <option value="">None</option>
              {availableRounds.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      )}
      <FormField label="Venue">
        <TextInput value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ground A" />
      </FormField>
      {error && <p className="font-mono text-[10px] text-accent">{error}</p>}
      <Button
        type="button"
        disabled={!canCreate || pending}
        onClick={() => {
          if (!canCreate) {
            setError('Pick a sport and two different teams.');
            return;
          }
          if (scheduled) {
            const t = scheduled.getTime();
            const lo = new Date(eventStart);
            lo.setHours(0, 0, 0, 0);
            const hi = new Date(eventEnd);
            hi.setHours(23, 59, 59, 999);
            if (t < lo.getTime() || t > hi.getTime()) {
              setError(
                `Match must be scheduled inside the event window (${formatRange(
                  eventStart,
                  eventEnd,
                )}).`,
              );
              return;
            }
          }
          setError(null);
          const startTs = scheduled ? Timestamp.fromDate(scheduled) : null;
          onCreate({
            sportId,
            teamAId: teamAId as TeamId,
            teamBId: teamBId as TeamId,
            scheduledStart: startTs,
            venue,
            group: group || null,
            round: round || null,
          });
          // Reset only the variable bits.
          setScheduled(null);
          setVenue('');
          setGroup('');
          setRound('');
        }}
      >
        {pending ? 'Creating…' : 'Create Match'}
      </Button>
    </section>
  );
}

function MatchList({
  matches,
  sports,
  teams,
  people,
  peopleByUid,
  onPatch,
  onRemove,
}: {
  matches: (MatchDoc & { id: string })[];
  sports: { id: string; name: string; tournament?: TournamentConfig | null }[];
  teams: TeamOption[];
  people: PersonRow[];
  peopleByUid: Map<string, PersonRow>;
  onPatch: (id: string, patch: Partial<MatchDoc>) => void;
  onRemove: (id: string) => void;
}) {
  const [sportFilter, setSportFilter] = useState<string>(''); // '' = All
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [roundFilter, setRoundFilter] = useState<string>('');

  // Reset secondary filters when sport changes — group/round labels are
  // sport-scoped and stale values would silently filter to nothing.
  const setSport = (next: string) => {
    setSportFilter(next);
    setGroupFilter('');
    setRoundFilter('');
  };

  const tournament = sportFilter
    ? sports.find((s) => s.id === sportFilter)?.tournament ?? null
    : null;
  const availableGroups = tournament?.groups ?? [];
  const availableRounds = tournament?.rounds ?? [];

  const filtered = matches.filter((m) => {
    if (sportFilter && m.sportId !== sportFilter) return false;
    if (groupFilter && m.group !== groupFilter) return false;
    if (roundFilter && m.round !== roundFilter) return false;
    return true;
  });

  return (
    <section className="flex flex-col gap-2">
      {/* Sport pill row — All + each sport. */}
      {sports.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <FilterPill active={sportFilter === ''} onClick={() => setSport('')}>
            All
          </FilterPill>
          {sports.map((s) => (
            <FilterPill
              key={s.id}
              active={sportFilter === s.id}
              onClick={() => setSport(s.id)}
            >
              {s.name}
            </FilterPill>
          ))}
        </div>
      )}

      {/* Group + round chips appear only when the picked sport has them. */}
      {sportFilter && (availableGroups.length > 0 || availableRounds.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {availableGroups.length > 0 && (
            <>
              <FilterPill active={groupFilter === ''} onClick={() => setGroupFilter('')}>
                All groups
              </FilterPill>
              {availableGroups.map((g) => (
                <FilterPill
                  key={g.id}
                  active={groupFilter === g.id}
                  onClick={() => setGroupFilter(g.id)}
                >
                  {g.name}
                </FilterPill>
              ))}
            </>
          )}
          {availableRounds.length > 0 && (
            <>
              <FilterPill active={roundFilter === ''} onClick={() => setRoundFilter('')}>
                All rounds
              </FilterPill>
              {availableRounds.map((r) => (
                <FilterPill
                  key={r}
                  active={roundFilter === r}
                  onClick={() => setRoundFilter(r)}
                >
                  {r}
                </FilterPill>
              ))}
            </>
          )}
        </div>
      )}

      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        {filtered.length} of {matches.length} match{matches.length === 1 ? '' : 'es'}
      </h2>
      {matches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
          No matches yet · create one above
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
          No matches match the current filters
        </p>
      ) : (
        filtered.map((m) => (
          <MatchRow
            key={m.id}
            id={m.id}
            data={m}
            teams={teams}
            people={people}
            peopleByUid={peopleByUid}
            onPatch={(patch) => onPatch(m.id, patch)}
            onRemove={() => onRemove(m.id)}
          />
        ))
      )}
    </section>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition ${
        active
          ? 'border-accent bg-accent text-bg'
          : 'border-line bg-bg-card text-ink-dim hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function MatchRow({
  id,
  data,
  teams,
  people,
  peopleByUid,
  onPatch,
  onRemove,
}: {
  id: string;
  data: MatchDoc;
  teams: TeamOption[];
  people: PersonRow[];
  peopleByUid: Map<string, PersonRow>;
  onPatch: (patch: Partial<MatchDoc>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  // Hydrate the picker's "selected" list from the persisted refereeUids.
  // Refs without a matching uid in the directory have probably been deleted
  // — drop them silently so the picker stays consistent.
  const selectedRefs = useMemo<PersonRow[]>(() => {
    const out: PersonRow[] = [];
    for (const uid of data.refereeUids) {
      const p = peopleByUid.get(uid);
      if (p) out.push(p);
    }
    return out;
  }, [data.refereeUids, peopleByUid]);

  function persistRefs(next: PersonRow[]) {
    // Security rule for refereeEvents requires real uids. Staged players
    // are allowed in the picker as placeholders but stripped at write.
    const uids = Array.from(
      new Set(next.filter((p) => p.uid).map((p) => p.uid as string)),
    );
    onPatch({ refereeUids: uids });
  }

  return (
    <div className="rounded-2xl border border-line bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base uppercase">
            {teamNameFor(data.teamAId, teams)} <span className="text-ink-dim">vs</span> {teamNameFor(data.teamBId, teams)}
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
            {data.sportId} · {data.scheduledStart ? formatDateTime(data.scheduledStart) : 'unscheduled'} · {data.venue || 'no venue'}
          </span>
          {(data.group || data.round) && (
            <span className="mt-1 flex flex-wrap gap-1">
              {data.group && (
                <span className="rounded-md border border-accent-3/40 bg-accent-3/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-accent-3">
                  Group {data.group}
                </span>
              )}
              {data.round && (
                <span className="rounded-md border border-accent-2/40 bg-accent-2/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-accent-2">
                  {data.round}
                </span>
              )}
            </span>
          )}
        </span>
        <Chip variant={statusToChip(data.status)}>
          {data.status === 'live' ? 'Live' : data.status === 'final' ? 'Final' : 'Sched'}
        </Chip>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
            Score: {data.state.scoreA} – {data.state.scoreB}
            {data.winnerTeamId && (
              <> · Winner: <span className="text-accent-2">{teamNameFor(data.winnerTeamId, teams)}</span></>
            )}
          </p>

          <FormField
            label="Referees"
            hint="Tap to add or remove. Long-press a tile to drag. Search by name or email."
          >
            <PlayerPicker
              available={people}
              selected={selectedRefs}
              onChange={persistRefs}
              rowWarning={(p) => (p.uid ? null : 'Needs sign-in')}
              emptySelectedLabel="No referees assigned yet."
              emptyAvailableLabel="No matching players."
              searchPlaceholder="Search referees…"
            />
          </FormField>

          <div className="flex flex-wrap gap-2">
            {data.status === 'scheduled' && (
              <Button
                type="button"
                onClick={() => onPatch({ status: 'live' })}
                className="!w-auto !px-4 !py-2"
              >
                Start (→ Live)
              </Button>
            )}
            {data.status === 'live' && (
              <FinalizeButton
                state={data.state}
                teamAId={data.teamAId}
                teamBId={data.teamBId}
                teams={teams}
                onFinalize={(winnerTeamId) => onPatch({ status: 'final', winnerTeamId })}
              />
            )}
            {data.status === 'final' && data.pointsAwardedAt === null && (
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                Awaiting points engine…
              </p>
            )}
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                if (window.confirm('Delete this match? (Audit log entry will be lost.)')) onRemove();
              }}
              className="!w-auto !px-4 !py-2"
            >
              Delete
            </Button>
            <a
              href={`/referee?matchId=${id}`}
              className="rounded-2xl border border-line px-4 py-2 font-display text-sm uppercase tracking-[0.06em] text-ink-dim hover:text-ink"
            >
              Open Referee Console →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function FinalizeButton({
  state,
  teamAId,
  teamBId,
  teams,
  onFinalize,
}: {
  state: MatchDoc['state'];
  teamAId: TeamId;
  teamBId: TeamId;
  teams: TeamOption[];
  onFinalize: (winnerTeamId: TeamId | null) => void;
}) {
  const auto =
    state.scoreA > state.scoreB
      ? teamAId
      : state.scoreB > state.scoreA
        ? teamBId
        : null;
  return (
    <Button
      type="button"
      onClick={() => {
        const label = auto ? teamNameFor(auto, teams) : 'a draw';
        if (window.confirm(`Finalize with ${label}?`)) onFinalize(auto);
      }}
      className="!w-auto !px-4 !py-2"
    >
      Finalize → {auto ? teamNameFor(auto, teams) : 'Draw'}
    </Button>
  );
}

function statusToChip(s: MatchStatus): ChipVariant {
  if (s === 'live') return 'live';
  if (s === 'final') return 'done';
  return 'upcoming';
}

function formatRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };
  return `${start.toLocaleDateString(undefined, opts)} → ${end.toLocaleDateString(undefined, opts)}`;
}

function formatDateTime(ts: Timestamp): string {
  const d = ts.toDate();
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
