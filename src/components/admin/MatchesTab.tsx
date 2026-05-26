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
import { matchesCol, matchRef, sportsCol, teamsCol, usersCol } from '@/lib/db';
import { emptyMatchState, type MatchDoc, type MatchStatus } from '@/types/match';
import { teamLabelFor, type TeamId } from '@/types/team';

type TeamOption = { id: TeamId; name: string };

/** Resolve a team id to a display name from the loaded team list, falling
 *  back to the legacy `teamLabelFor()` helper for the hardcoded demo ids
 *  and finally to the raw id. NEVER returns an empty string. */
function teamNameFor(teamId: TeamId, teams: TeamOption[]): string {
  const team = teams.find((t) => t.id === teamId);
  if (team && team.name.trim()) return team.name;
  const legacy = teamLabelFor(teamId);
  if (legacy && legacy.trim()) return legacy;
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
const USERS_QK = ['admin', 'claimedPlayers'] as const;

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
  const users = useQuery({
    queryKey: USERS_QK,
    queryFn: async () => {
      const snap = await getDocs(usersCol);
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },
  });
  const matches = useQuery({
    queryKey: matchesQk(eventId),
    queryFn: async () => {
      const snap = await getDocs(query(matchesCol(eventId), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const usersByEmail = useMemo(() => {
    const m = new Map<string, string>(); // email → uid
    for (const u of users.data ?? []) m.set(u.email.toLowerCase(), u.uid);
    return m;
  }, [users.data]);

  const create = useMutation({
    mutationFn: async (args: {
      sportId: string;
      teamAId: TeamId;
      teamBId: TeamId;
      scheduledStart: Timestamp | null;
      venue: string;
    }) => {
      await addDoc(matchesCol(eventId), {
        ...args,
        refereeUids: [],
        state: emptyMatchState(),
        status: 'scheduled' satisfies MatchStatus,
        winnerTeamId: null,
        pointsAwardedAt: null,
        createdAt: serverTimestamp() as unknown as Timestamp,
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

  if (sports.isLoading || teams.isLoading || users.isLoading) {
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

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          {(matches.data ?? []).length} match{(matches.data ?? []).length === 1 ? '' : 'es'}
        </h2>
        {(matches.data ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
            No matches yet · create one above
          </p>
        )}
        {(matches.data ?? []).map((m) => (
          <MatchRow
            key={m.id}
            id={m.id}
            data={m}
            teams={availableTeams}
            usersByEmail={usersByEmail}
            onPatch={(patch) => updateMatch.mutate({ id: m.id, patch })}
            onRemove={() => remove.mutate(m.id)}
          />
        ))}
      </section>
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
  sports: { id: string; name: string }[];
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
  }) => void;
}) {
  const [sportId, setSportId] = useState<string>('');
  const [teamAId, setTeamAId] = useState<TeamId | ''>('');
  const [teamBId, setTeamBId] = useState<TeamId | ''>('');
  const [scheduled, setScheduled] = useState<Date | null>(null);
  const [venue, setVenue] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

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
            onChange={(e) => setSportId(e.target.value)}
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
          });
          // Reset only the variable bits.
          setScheduled(null);
          setVenue('');
        }}
      >
        {pending ? 'Creating…' : 'Create Match'}
      </Button>
    </section>
  );
}

function MatchRow({
  id,
  data,
  teams,
  usersByEmail,
  onPatch,
  onRemove,
}: {
  id: string;
  data: MatchDoc;
  teams: TeamOption[];
  usersByEmail: Map<string, string>;
  onPatch: (patch: Partial<MatchDoc>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [refsText, setRefsText] = useState('');

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
            label="Referee emails"
            hint="Comma-separated @cheq.one addresses. Each must already have signed in."
          >
            <TextInput
              value={refsText}
              onChange={(e) => setRefsText(e.target.value)}
              placeholder="amit@cheq.one, nia@cheq.one"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {data.refereeUids.map((uid) => (
                <span
                  key={uid}
                  className="rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-ink-dim"
                >
                  {uid.slice(0, 6)}…
                </span>
              ))}
              {data.refereeUids.length === 0 && (
                <span className="font-mono text-[10px] text-ink-mute">No refs assigned</span>
              )}
            </div>
          </FormField>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              const emails = refsText
                .split(',')
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean);
              const uids: string[] = [];
              const missing: string[] = [];
              for (const e of emails) {
                const uid = usersByEmail.get(e);
                if (uid) uids.push(uid);
                else missing.push(e);
              }
              if (missing.length > 0) {
                alert(`These emails haven't signed in yet:\n${missing.join('\n')}`);
              }
              if (uids.length > 0) {
                onPatch({ refereeUids: Array.from(new Set([...data.refereeUids, ...uids])) });
                setRefsText('');
              }
            }}
            className="!w-auto !px-4 !py-2"
          >
            Add referees
          </Button>

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
