import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Timestamp,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  matchesCol,
  matchRef,
  refereeEventsCol,
  sportRef,
  sportsCol,
  teamRef,
  teamsCol,
} from '@/lib/db';
import { db } from '@/lib/firebase';
import { pointsForMatch } from '@/lib/tournament';
import { emptyMatchState, type MatchDoc, type MatchStatus } from '@/types/match';
import type { TeamId } from '@/types/team';
import type { SportDoc, TournamentConfig } from '@/types/sport';
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

/** Human label for a bracket slot — used while a downstream match is
 *  waiting for its upstream group to finish. e.g. "Winner of Group A",
 *  "Runner-up of QF1". */
function slotLabel(
  slot: { fromStageId: string; fromGroupId: string; rank: number } | null | undefined,
): string {
  if (!slot) return 'TBD';
  const rankWord =
    slot.rank === 1
      ? 'Winner'
      : slot.rank === 2
        ? 'Runner-up'
        : `Rank ${slot.rank}`;
  return `${rankWord} of ${slot.fromGroupId}`;
}

/** Resolve the display label for a match team — either the real team
 *  name (when teamAId/B is set) or the bracket-slot placeholder
 *  (e.g. "Winner of Group A") when the slot is still unresolved. */
function teamOrSlotLabel(
  teamId: TeamId | '' | null | undefined,
  slot: { fromStageId: string; fromGroupId: string; rank: number } | null | undefined,
  teams: TeamOption[],
): string {
  if (teamId) return teamNameFor(teamId as TeamId, teams);
  return slotLabel(slot);
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
      /** Optional per-match W/D/L override set on the form. Null /
       *  undefined = use the per-round override or sport default. */
      points?: { win: number; draw: number; loss: number } | null;
    }) => {
      // Compute the next per-event match number = max(existing) + 1.
      // Falls back to count + 1 if all existing rows lack matchNumber
      // (legacy data). Atomic enough for an admin tool — a write race
      // between two admin tabs would just leave a duplicate number,
      // which the UI tolerates.
      const allSnap = await getDocs(matchesCol(eventId));
      let maxNumber = 0;
      for (const d of allSnap.docs) {
        const n = (d.data() as { matchNumber?: number }).matchNumber;
        if (typeof n === 'number' && n > maxNumber) maxNumber = n;
      }
      const nextNumber = (maxNumber || allSnap.size) + 1;

      await addDoc(matchesCol(eventId), {
        ...args,
        matchNumber: nextNumber,
        refereeUids: [],
        state: emptyMatchState(),
        status: 'scheduled' satisfies MatchStatus,
        winnerTeamId: null,
        pointsAwardedAt: null,
        createdAt: serverTimestamp() as unknown as Timestamp,
        group: args.group ?? null,
        round: args.round ?? null,
        points: args.points ?? null,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: matchesQk(eventId) }),
  });

  // Backfill matchNumber for any legacy match docs that pre-date the
  // field. Runs once when MatchesTab loads and finds gaps; ordered by
  // createdAt so older matches get the lower numbers naturally.
  const backfillMatchNumbers = useMutation({
    mutationFn: async () => {
      const snap = await getDocs(matchesCol(eventId));
      const docs = snap.docs.map((d) => ({
        ref: d.ref,
        data: d.data() as MatchDoc & { createdAt?: Timestamp | null },
      }));
      const missing = docs.filter((d) => typeof d.data.matchNumber !== 'number');
      if (missing.length === 0) return 0;
      // Sort missing by createdAt asc so earliest gets lowest number.
      missing.sort((a, b) => {
        const at = a.data.createdAt?.toMillis?.() ?? 0;
        const bt = b.data.createdAt?.toMillis?.() ?? 0;
        return at - bt;
      });
      let used = docs
        .map((d) => d.data.matchNumber)
        .filter((n): n is number => typeof n === 'number');
      let next = (used.length === 0 ? 0 : Math.max(...used)) + 1;
      const batch = writeBatch(db);
      for (const m of missing) {
        batch.set(m.ref, { matchNumber: next }, { merge: true });
        next += 1;
      }
      await batch.commit();
      return missing.length;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: matchesQk(eventId) }),
  });

  // Kick the backfill once on mount of the tab. Idempotent — no-op if
  // every match already has a number.
  useEffect(() => {
    void backfillMatchNumbers.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const updateMatch = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<MatchDoc> }) => {
      await setDoc(matchRef(eventId, args.id), args.patch, { merge: true });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: matchesQk(eventId) }),
  });

  // Full-cascade delete: rolls back any awarded points, wipes the
  // refereeEvents subcollection, then deletes the match doc. Idempotent
  // on the reversal — uses pointsAwardedAt as the gate so a partial run
  // doesn't double-subtract on retry.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const mRef = matchRef(eventId, id);
      const mSnap = await getDoc(mRef);
      if (!mSnap.exists()) return; // already gone — no-op

      const m = mSnap.data();

      // 1. Reverse awarded points. The points engine sets
      //    `pointsAwardedAt` once it has credited team.totalPoints, so we
      //    only reverse when that field is set. We recompute the exact
      //    values using the same lookup chain (match.points -> round
      //    override -> sport default) the engine used.
      if (m.status === 'final' && m.pointsAwardedAt) {
        const sportSnap = await getDoc(sportRef(eventId, m.sportId));
        const sportData = sportSnap.exists() ? (sportSnap.data() as SportDoc) : null;
        const pts = pointsForMatch(sportData, m.round, m.points ?? null);
        const winner = m.winnerTeamId ?? null;
        const teamAPoints =
          winner === m.teamAId ? pts.win : winner === null ? pts.draw : pts.loss;
        const teamBPoints =
          winner === m.teamBId ? pts.win : winner === null ? pts.draw : pts.loss;

        // Atomic decrement on both team docs. Clear pointsAwardedAt on
        // the match too so a partial failure + retry re-runs cleanly.
        const batch = writeBatch(db);
        batch.set(
          teamRef(eventId, m.teamAId as TeamId),
          { totalPoints: increment(-teamAPoints) },
          { merge: true },
        );
        batch.set(
          teamRef(eventId, m.teamBId as TeamId),
          { totalPoints: increment(-teamBPoints) },
          { merge: true },
        );
        batch.set(mRef, { pointsAwardedAt: null }, { merge: true });
        await batch.commit();
      }

      // 2. Wipe refereeEvents subcollection. Firestore doesn't cascade
      //    delete on its own; walk + batch.
      const refEvents = await getDocs(refereeEventsCol(eventId, id));
      if (!refEvents.empty) {
        const refBatch = writeBatch(db);
        for (const d of refEvents.docs) refBatch.delete(d.ref);
        await refBatch.commit();
      }

      // 3. Delete the match doc itself.
      await deleteDoc(mRef);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchesQk(eventId) });
      // The leaderboard reads team.totalPoints; nudge any cached query.
      void qc.invalidateQueries({ queryKey: ['arena', 'matches', eventId] });
    },
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

  // Detect bracket groups stuck on a tie — heuristic: all matches in
  // the group are final, but downstream matches with teamASlot/B
  // pointing at this group still have empty teamA/B. Surfaced as a
  // banner so admins know to use the inline override on the listed
  // downstream matches.
  const tiedGroups = useMemo(
    () => detectTiedGroups(matches.data ?? [], availableSports),
    [matches.data, availableSports],
  );

  return (
    <div className="mx-5 flex flex-col gap-5">
      {tiedGroups.length > 0 && (
        <div
          className="rounded-xl border px-3 py-2"
          style={{
            borderColor: 'color-mix(in oklab, var(--accent) 50%, transparent)',
            background: 'color-mix(in oklab, var(--accent) 8%, transparent)',
          }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
            Tie-breakers needed
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
            These groups finished but auto-advance couldn't pick a
            ranked team. Use the Teams (admin override) picker on each
            downstream match below to set the team manually.
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5 font-mono text-[10px]">
            {tiedGroups.map((t) => (
              <li key={`${t.sportId}/${t.stageId}/${t.groupId}`} className="text-ink">
                <span className="text-ink-mute">
                  {t.sportName} ·
                </span>{' '}
                Group {t.groupName} → {t.downstream} downstream match
                {t.downstream === 1 ? '' : 'es'} waiting
              </li>
            ))}
          </ul>
        </div>
      )}

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

/** Heuristic tie detector. A group is "stuck" when:
 *   1. all matches in (sport, stage, group) have status 'final', AND
 *   2. at least one downstream match still has an empty teamA/teamB
 *      and a teamASlot/B pointing back at this (stage, group).
 *
 * Phase 1's resolveBracket bails out of round-robin ranking when
 * scores tie at the cutoff; this banner picks up that signal so
 * admins can finish the call manually via the override picker. */
function detectTiedGroups(
  matches: (MatchDoc & { id: string })[],
  sports: { id: string; name: string; tournament?: TournamentConfig | null }[],
): { sportId: string; sportName: string; stageId: string; groupId: string; groupName: string; downstream: number }[] {
  const result: {
    sportId: string;
    sportName: string;
    stageId: string;
    groupId: string;
    groupName: string;
    downstream: number;
  }[] = [];
  // Group by (sport, stage, group) once.
  const byGroup = new Map<string, (MatchDoc & { id: string })[]>();
  for (const m of matches) {
    const stageId = m.stageId ?? null;
    const groupId = m.groupId ?? m.group ?? null;
    if (!stageId || !groupId) continue;
    const key = `${m.sportId}/${stageId}/${groupId}`;
    const arr = byGroup.get(key) ?? [];
    arr.push(m);
    byGroup.set(key, arr);
  }
  for (const [key, groupMatches] of byGroup.entries()) {
    const allFinal = groupMatches.every((m) => m.status === 'final');
    if (!allFinal) continue;
    const [sportId, stageId, groupId] = key.split('/');
    if (!sportId || !stageId || !groupId) continue;
    // Count downstream matches still waiting on this group.
    let downstream = 0;
    for (const m of matches) {
      if (m.sportId !== sportId) continue;
      if (
        !m.teamAId &&
        m.teamASlot?.fromStageId === stageId &&
        m.teamASlot?.fromGroupId === groupId
      ) {
        downstream += 1;
      }
      if (
        !m.teamBId &&
        m.teamBSlot?.fromStageId === stageId &&
        m.teamBSlot?.fromGroupId === groupId
      ) {
        downstream += 1;
      }
    }
    if (downstream === 0) continue;
    const sport = sports.find((s) => s.id === sportId);
    if (!sport) continue;
    const groupName =
      sport.tournament?.bracket?.find((s) => s.id === stageId)?.groups.find((g) => g.id === groupId)
        ?.name ??
      sport.tournament?.groups.find((g) => g.id === groupId)?.name ??
      groupId;
    result.push({
      sportId,
      sportName: sport.name,
      stageId,
      groupId,
      groupName,
      downstream,
    });
  }
  return result;
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
    points: { win: number; draw: number; loss: number } | null;
  }) => void;
}) {
  const [sportId, setSportId] = useState<string>('');
  const [teamAId, setTeamAId] = useState<TeamId | ''>('');
  const [teamBId, setTeamBId] = useState<TeamId | ''>('');
  const [scheduled, setScheduled] = useState<Date | null>(null);
  const [venue, setVenue] = useState<string>('');
  const [group, setGroup] = useState<string>(''); // '' = None
  const [round, setRound] = useState<string>(''); // '' = None
  // Per-match point override. `enableOverride=false` → pass null and let
  // the resolver fall through to per-round / sport defaults.
  const [enableOverride, setEnableOverride] = useState(false);
  const [pointsWin, setPointsWin] = useState('50');
  const [pointsDraw, setPointsDraw] = useState('0');
  const [pointsLoss, setPointsLoss] = useState('30');
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

      {/* Per-match point override. Off by default — admin opts in for
          high-value matches (e.g. finals). When off, the resolver falls
          through to the per-round override or the sport default. */}
      <div className="rounded-xl border border-line bg-bg-card p-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enableOverride}
            onChange={(e) => setEnableOverride(e.target.checked)}
            className="h-4 w-4 accent-current"
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
            Override points for this match
          </span>
        </label>
        {enableOverride && (
          <>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
              These values supersede the sport default and any per-round
              override. E.g. Win 50 / Loss 30 for the Final.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <FormField label="Win">
                <TextInput
                  type="number"
                  value={pointsWin}
                  onChange={(e) => setPointsWin(e.target.value)}
                />
              </FormField>
              <FormField label="Draw">
                <TextInput
                  type="number"
                  value={pointsDraw}
                  onChange={(e) => setPointsDraw(e.target.value)}
                />
              </FormField>
              <FormField label="Loss">
                <TextInput
                  type="number"
                  value={pointsLoss}
                  onChange={(e) => setPointsLoss(e.target.value)}
                />
              </FormField>
            </div>
          </>
        )}
      </div>

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
          // Validate per-match override numbers if it's enabled.
          let pointsOverride: { win: number; draw: number; loss: number } | null = null;
          if (enableOverride) {
            const w = Number(pointsWin);
            const d = Number(pointsDraw);
            const l = Number(pointsLoss);
            if (![w, d, l].every((n) => Number.isFinite(n))) {
              setError('Match points must all be numbers.');
              return;
            }
            pointsOverride = { win: Math.trunc(w), draw: Math.trunc(d), loss: Math.trunc(l) };
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
            points: pointsOverride,
          });
          // Reset only the variable bits.
          setScheduled(null);
          setVenue('');
          setGroup('');
          setRound('');
          setEnableOverride(false);
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
            {typeof data.matchNumber === 'number' && (
              <span
                className="mr-2 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums align-middle"
                style={{
                  color: 'var(--accent-2)',
                  borderColor:
                    'color-mix(in oklab, var(--accent-2) 40%, transparent)',
                }}
              >
                #{data.matchNumber}
              </span>
            )}
            {teamOrSlotLabel(data.teamAId, data.teamASlot, teams)} <span className="text-ink-dim">vs</span> {teamOrSlotLabel(data.teamBId, data.teamBSlot, teams)}
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
            {data.sportId} · {data.scheduledStart ? formatDateTime(data.scheduledStart) : 'unscheduled'} · {data.venue || 'no venue'}
          </span>
          {(data.group || data.round || data.stageId || data.manuallyResolved) && (
            <span className="mt-1 flex flex-wrap gap-1">
              {data.stageId && (
                <span className="rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-accent">
                  {data.stageId}
                </span>
              )}
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
              {data.manuallyResolved && (
                <span className="rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-gold">
                  Manually set
                </span>
              )}
            </span>
          )}
        </span>
        <Chip variant={statusToChip(data.status)}>
          {data.status === 'live' ? 'Live' : data.status === 'final' ? 'Ended' : 'Sched'}
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

          {/* Bracket teams override. Visible for any match — useful for
              downstream bracket matches that still hold a placeholder
              slot OR for fixing a mis-resolved auto-advance. Picking a
              team here sets manuallyResolved=true so the cloud
              resolver leaves it alone on future winner changes. */}
          {(data.teamASlot || data.teamBSlot || data.stageId) && (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                Teams (admin override)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <TeamOverrideSelect
                  label={data.teamAId ? teamNameFor(data.teamAId, teams) : slotLabel(data.teamASlot)}
                  selected={data.teamAId || ''}
                  excludeId={data.teamBId || undefined}
                  teams={teams}
                  onPick={(teamId) =>
                    onPatch({
                      teamAId: teamId as TeamId,
                      teamASlot: null,
                      manuallyResolved: true,
                    })
                  }
                />
                <TeamOverrideSelect
                  label={data.teamBId ? teamNameFor(data.teamBId, teams) : slotLabel(data.teamBSlot)}
                  selected={data.teamBId || ''}
                  excludeId={data.teamAId || undefined}
                  teams={teams}
                  onPick={(teamId) =>
                    onPatch({
                      teamBId: teamId as TeamId,
                      teamBSlot: null,
                      manuallyResolved: true,
                    })
                  }
                />
              </div>
              {data.manuallyResolved && (
                <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-gold">
                  Manually resolved — auto-advance will not touch this match.
                </p>
              )}
            </div>
          )}

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
                const teamA = teamNameFor(data.teamAId, teams);
                const teamB = teamNameFor(data.teamBId, teams);
                const lines = [
                  `Delete ${teamA} vs ${teamB}?`,
                  '',
                  'This will:',
                  '  • delete the match doc',
                  '  • delete every referee event in its log',
                ];
                if (data.status === 'final' && data.pointsAwardedAt) {
                  lines.push(
                    '  • REVERSE the points awarded to both teams',
                  );
                }
                lines.push('', 'This cannot be undone.');
                if (window.confirm(lines.join('\n'))) onRemove();
              }}
              className="!w-auto !px-4 !py-2"
              style={{
                borderColor: 'color-mix(in oklab, var(--accent) 60%, transparent)',
                color: 'var(--accent)',
              }}
            >
              Delete match
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

function TeamOverrideSelect({
  label,
  selected,
  excludeId,
  teams,
  onPick,
}: {
  label: string;
  selected: string;
  excludeId?: string;
  teams: TeamOption[];
  onPick: (teamId: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
        {label}
      </span>
      <select
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onPick(v);
        }}
        className="rounded-md border border-line bg-bg-card px-2 py-1 text-sm"
      >
        <option value="">— pick a team —</option>
        {teams
          .filter((t) => t.id !== excludeId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
    </label>
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
