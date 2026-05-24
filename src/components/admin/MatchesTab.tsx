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
import { TEAM_LABEL, type TeamId } from '@/types/team';
import { Button } from '@/components/shared/Button';
import { Chip, type ChipVariant } from '@/components/shared/Chip';
import { FormField, TextInput } from './FormField';

const MATCHES_QK = ['admin', 'matches'] as const;
const SPORTS_QK = ['admin', 'sports'] as const;
const TEAMS_QK = ['admin', 'teams'] as const;
const USERS_QK = ['admin', 'claimedPlayers'] as const;

export function MatchesTab() {
  const qc = useQueryClient();

  const sports = useQuery({
    queryKey: SPORTS_QK,
    queryFn: async () => {
      const snap = await getDocs(sportsCol);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });
  const teams = useQuery({
    queryKey: TEAMS_QK,
    queryFn: async () => {
      const snap = await getDocs(teamsCol);
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
    queryKey: MATCHES_QK,
    queryFn: async () => {
      const snap = await getDocs(query(matchesCol, orderBy('createdAt', 'desc')));
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
      await addDoc(matchesCol, {
        ...args,
        refereeUids: [],
        state: emptyMatchState(),
        status: 'scheduled' satisfies MatchStatus,
        winnerTeamId: null,
        pointsAwardedAt: null,
        createdAt: serverTimestamp() as unknown as Timestamp,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: MATCHES_QK }),
  });

  const updateMatch = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<MatchDoc> }) => {
      await setDoc(matchRef(args.id), args.patch, { merge: true });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: MATCHES_QK }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(matchesCol, id));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: MATCHES_QK }),
  });

  if (sports.isLoading || teams.isLoading || users.isLoading) {
    return <p className="px-5 text-ink-dim">Loading…</p>;
  }

  const availableTeams = (teams.data ?? []).map((t) => t.id);
  const availableSports = sports.data ?? [];

  return (
    <div className="mx-5 flex flex-col gap-5">
      <CreateMatchForm
        sports={availableSports}
        teamIds={availableTeams}
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
  teamIds,
  pending,
  onCreate,
}: {
  sports: { id: string; name: string }[];
  teamIds: TeamId[];
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
  const [scheduled, setScheduled] = useState<string>('');
  const [venue, setVenue] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const canCreate =
    sports.length > 0 && teamIds.length >= 2 && sportId && teamAId && teamBId && teamAId !== teamBId;

  if (sports.length === 0 || teamIds.length < 2) {
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
        <FormField label="Scheduled">
          <TextInput
            type="datetime-local"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
        </FormField>
        <FormField label="Team A">
          <select
            value={teamAId}
            onChange={(e) => setTeamAId(e.target.value as TeamId)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase focus:border-accent focus:outline-none"
          >
            <option value="">Pick…</option>
            {teamIds.map((id) => (
              <option key={id} value={id}>
                {TEAM_LABEL[id]}
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
            {teamIds
              .filter((id) => id !== teamAId)
              .map((id) => (
                <option key={id} value={id}>
                  {TEAM_LABEL[id]}
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
          setError(null);
          const startTs = scheduled ? Timestamp.fromDate(new Date(scheduled)) : null;
          onCreate({
            sportId,
            teamAId: teamAId as TeamId,
            teamBId: teamBId as TeamId,
            scheduledStart: startTs,
            venue,
          });
          // Reset only the variable bits.
          setScheduled('');
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
  usersByEmail,
  onPatch,
  onRemove,
}: {
  id: string;
  data: MatchDoc;
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
            {TEAM_LABEL[data.teamAId]} <span className="text-ink-dim">vs</span> {TEAM_LABEL[data.teamBId]}
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
              <> · Winner: <span className="text-accent-2">{TEAM_LABEL[data.winnerTeamId]}</span></>
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
  onFinalize,
}: {
  state: MatchDoc['state'];
  teamAId: TeamId;
  teamBId: TeamId;
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
        const label = auto ? TEAM_LABEL[auto] : 'a draw';
        if (window.confirm(`Finalize with ${label}?`)) onFinalize(auto);
      }}
      className="!w-auto !px-4 !py-2"
    >
      Finalize → {auto ? TEAM_LABEL[auto] : 'Draw'}
    </Button>
  );
}

function statusToChip(s: MatchStatus): ChipVariant {
  if (s === 'live') return 'live';
  if (s === 'final') return 'done';
  return 'upcoming';
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
