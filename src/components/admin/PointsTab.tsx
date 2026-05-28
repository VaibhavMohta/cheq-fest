/**
 * Points tab — two sections:
 *
 *  1. Per-sport scheme    — edit win / draw / loss values on
 *                           events/{e}/sports/{s}.points. Mirrors the
 *                           AI-parsed defaults; admin override is
 *                           authoritative.
 *  2. Bonus awards        — admin-granted discretionary points stored at
 *                           events/{e}/bonusAwards. Surfaces on the
 *                           leaderboard alongside match-derived points.
 *
 * Server gating: sport.points writes require admin (event rule); bonus
 * writes require admin (dedicated rule). Reads are public on both.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { Button } from '@/components/shared/Button';
import { useAuth } from '@/lib/auth';
import { useRole } from '@/lib/roles';
import {
  bonusAwardRef,
  bonusAwardsCol,
  sportRef,
  sportsCol,
  teamsCol,
} from '@/lib/db';
import type { SportDoc, SportPoints } from '@/types/sport';
import type { BonusAwardDoc } from '@/types/bonus';
import type { TeamDoc } from '@/types/player';
import type { TeamId } from '@/types/team';
import { FormField, TextInput } from './FormField';
import { RequireEvent } from './RequireEvent';

export function PointsTab() {
  return (
    <RequireEvent>
      {(_event, eventId) => <PointsTabInner eventId={eventId} />}
    </RequireEvent>
  );
}

type SportRow = SportDoc & { id: string };
type TeamRow = TeamDoc & { id: TeamId };
type AwardRow = BonusAwardDoc & { id: string };

function PointsTabInner({ eventId }: { eventId: string }) {
  const role = useRole();
  const canEdit = role.is('admin'); // includes super-admin via implication
  const auth = useAuth();
  const myUid = auth.status === 'signedIn' ? auth.user.uid : null;
  const myEmail = auth.status === 'signedIn' ? auth.user.email?.toLowerCase() ?? null : null;
  const qc = useQueryClient();

  const [sports, setSports] = useState<SportRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [awards, setAwards] = useState<AwardRow[]>([]);

  useEffect(() => {
    return onSnapshot(sportsCol(eventId), (snap) => {
      setSports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as SportDoc) })));
    });
  }, [eventId]);
  useEffect(() => {
    return onSnapshot(teamsCol(eventId), (snap) => {
      setTeams(
        snap.docs.map((d) => ({ id: d.id as TeamId, ...(d.data() as TeamDoc) })),
      );
    });
  }, [eventId]);
  useEffect(() => {
    return onSnapshot(bonusAwardsCol(eventId), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as BonusAwardDoc) }));
      // Newest first.
      rows.sort((a, b) => (b.awardedAt?.toMillis() ?? 0) - (a.awardedAt?.toMillis() ?? 0));
      setAwards(rows);
    });
  }, [eventId]);

  const sortedSports = useMemo(
    () => [...sports].sort((a, b) => a.name.localeCompare(b.name)),
    [sports],
  );
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );
  const teamById = useMemo(() => {
    const m = new Map<TeamId, TeamRow>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const updateSportPoints = useMutation({
    mutationFn: async (args: { sportId: string; points: SportPoints }) => {
      await setDoc(
        sportRef(eventId, args.sportId),
        { points: args.points },
        { merge: true },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sports', eventId] });
    },
  });

  const addAward = useMutation({
    mutationFn: async (args: {
      teamId: TeamId;
      points: number;
      reason: string;
      category: string | null;
    }) => {
      if (!myUid || !myEmail) throw new Error('Not signed in.');
      await addDoc(bonusAwardsCol(eventId), {
        teamId: args.teamId,
        points: args.points,
        reason: args.reason,
        category: args.category,
        awardedAt: serverTimestamp() as unknown as Timestamp,
        awardedByUid: myUid,
        awardedByEmail: myEmail,
      });
    },
  });

  const removeAward = useMutation({
    mutationFn: async (awardId: string) => {
      await deleteDoc(bonusAwardRef(eventId, awardId));
    },
  });

  return (
    <div className="mx-5 flex flex-col gap-6">
      {!canEdit && (
        <div className="rounded-xl border border-line bg-bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          Read-only · Only Admin or Super Admin can edit the point system.
        </div>
      )}

      <section className="flex flex-col gap-3">
        <header>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Per-sport scheme
          </h2>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
            Points awarded to the winning side of a match per sport. Draw applies
            only to sports that can draw.
          </p>
        </header>
        {sortedSports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            No sports yet — import standard sports or add one on the Sports tab first.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedSports.map((sp) => (
              <SportPointsRow
                key={sp.id}
                sport={sp}
                canEdit={canEdit}
                pending={updateSportPoints.isPending}
                onSave={(points) => updateSportPoints.mutate({ sportId: sp.id, points })}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <header>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Bonus awards
          </h2>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
            Discretionary points (sportsmanship, penalties, attendance, etc.).
            Adds to the team's leaderboard total. Negative values allowed.
          </p>
        </header>

        {canEdit && sortedTeams.length > 0 && (
          <AddAwardForm
            teams={sortedTeams}
            pending={addAward.isPending}
            error={addAward.error ? String(addAward.error) : null}
            onAdd={(args) => addAward.mutate(args)}
          />
        )}

        {awards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            No awards yet — bonus points show here as soon as you grant one.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {awards.map((aw) => {
              const team = teamById.get(aw.teamId);
              const isPending =
                removeAward.isPending && removeAward.variables === aw.id;
              return (
                <li
                  key={aw.id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm uppercase">
                      {team?.name ?? aw.teamId}
                      {aw.category && (
                        <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
                          · {aw.category}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-dim">
                      {aw.reason}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
                      {aw.awardedAt?.toDate().toLocaleString() ?? '—'} · by{' '}
                      {aw.awardedByEmail}
                    </p>
                  </div>
                  <span
                    className="shrink-0 self-center font-display text-2xl leading-none tabular-nums"
                    style={{
                      color:
                        aw.points >= 0 ? 'var(--accent-2)' : 'var(--accent)',
                    }}
                  >
                    {aw.points > 0 ? `+${aw.points}` : aw.points}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete this ${aw.points >= 0 ? 'award' : 'penalty'} for ${team?.name ?? aw.teamId}?`,
                          )
                        ) {
                          removeAward.mutate(aw.id);
                        }
                      }}
                      disabled={isPending}
                      className="self-center rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim hover:text-accent disabled:opacity-50"
                    >
                      {isPending ? '…' : 'Delete'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SportPointsRow({
  sport,
  canEdit,
  pending,
  onSave,
}: {
  sport: SportRow;
  canEdit: boolean;
  pending: boolean;
  onSave: (next: SportPoints) => void;
}) {
  const initial: SportPoints = sport.points ?? { win: 3, draw: 1, loss: 0 };
  const [win, setWin] = useState(String(initial.win ?? 0));
  const [draw, setDraw] = useState(String(initial.draw ?? 0));
  const [loss, setLoss] = useState(String(initial.loss ?? 0));

  // Sync local state when the underlying doc changes (e.g. someone else
  // edits in another tab).
  useEffect(() => {
    setWin(String(initial.win ?? 0));
    setDraw(String(initial.draw ?? 0));
    setLoss(String(initial.loss ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.win, initial.draw, initial.loss]);

  const dirty =
    Number(win) !== (initial.win ?? 0) ||
    Number(draw) !== (initial.draw ?? 0) ||
    Number(loss) !== (initial.loss ?? 0);

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-bg-card px-3 py-2.5">
      <p className="font-display text-sm uppercase">{sport.name}</p>
      <div className="grid grid-cols-3 gap-2">
        <FormField label="Win">
          <TextInput
            type="number"
            value={win}
            onChange={(e) => setWin(e.target.value)}
            disabled={!canEdit}
          />
        </FormField>
        <FormField label="Draw">
          <TextInput
            type="number"
            value={draw}
            onChange={(e) => setDraw(e.target.value)}
            disabled={!canEdit}
          />
        </FormField>
        <FormField label="Loss">
          <TextInput
            type="number"
            value={loss}
            onChange={(e) => setLoss(e.target.value)}
            disabled={!canEdit}
          />
        </FormField>
      </div>
      {canEdit && dirty && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            onSave({
              win: Number(win) || 0,
              draw: Number(draw) || 0,
              loss: Number(loss) || 0,
            })
          }
          className="self-end !w-auto !px-3 !py-1.5"
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      )}
    </li>
  );
}

function AddAwardForm({
  teams,
  pending,
  error,
  onAdd,
}: {
  teams: TeamRow[];
  pending: boolean;
  error: string | null;
  onAdd: (args: {
    teamId: TeamId;
    points: number;
    reason: string;
    category: string | null;
  }) => void;
}) {
  const [teamId, setTeamId] = useState<TeamId>(teams[0]!.id);
  const [points, setPoints] = useState('5');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg-card p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        Grant points
      </p>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Team">
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value as TeamId)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase text-ink focus:border-accent focus:outline-none"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Points (±)">
          <TextInput
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="5"
          />
        </FormField>
      </div>
      <FormField label="Category (optional)">
        <TextInput
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Sportsmanship · Discipline · Bonus · …"
        />
      </FormField>
      <FormField label="Reason">
        <TextInput
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why these points?"
        />
      </FormField>
      {(localError || error) && (
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-accent">
          {localError ?? error}
        </p>
      )}
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          const n = Number(points);
          if (!Number.isFinite(n) || n === 0) {
            setLocalError('Enter a non-zero number.');
            return;
          }
          if (!reason.trim()) {
            setLocalError('A reason is required.');
            return;
          }
          setLocalError(null);
          onAdd({
            teamId,
            points: Math.trunc(n),
            reason: reason.trim(),
            category: category.trim() || null,
          });
          setReason('');
          setCategory('');
        }}
        className="!w-auto self-end !px-3 !py-1.5"
      >
        {pending ? 'Saving…' : `Grant ${points || 0} pts`}
      </Button>
    </div>
  );
}
