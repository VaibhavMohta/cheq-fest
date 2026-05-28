import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import Fuse from 'fuse.js';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { PlayerPicker } from '@/components/shared/PlayerPicker';
import {
  ensureTeamMember,
  matchesCol,
  purgePlayerFromTeam,
  refereeEventsCol,
  stagedPlayersCol,
  teamRef,
  teamsCol,
  usersCol,
} from '@/lib/db';
import { storage } from '@/lib/firebase';
import {
  colorVarFor,
  flagInitials,
  isLightTeamColor,
  teamSurfaceGradient,
} from '@/types/team';
import type { TeamDoc } from '@/types/player';
import type { PersonRow as DirectoryPersonRow } from '@/lib/playerDirectory';
import { displayEmail } from '@/lib/syntheticEmail';
import { FormField } from './FormField';

const teamsQk = (eventId: string) => ['admin', 'teams', eventId] as const;
const STAGED_QK = ['admin', 'stagedPlayers'] as const;
const CLAIMED_QK = ['admin', 'claimedPlayers'] as const;

type Props = {
  eventId: string;
  teamId: string;
  onClose: () => void;
};

type PersonRow = {
  /** Stable identifier — uid for claimed, staged doc id for staged. */
  key: string;
  email: string;
  name: string;
  /** For claimed players, this is their uid (used for groupCaptainUid). */
  uid: string | null;
  /** Which team-in-this-event the player currently belongs to. */
  currentTeamId: string | null;
  isClaimed: boolean;
  /** The Firestore doc the membership lives on — used to update teamId. */
  membershipRef: ReturnType<typeof doc>;
};

export function TeamDetail({ eventId, teamId, onClose }: Props) {
  const qc = useQueryClient();

  // The team being edited (subscribed so save-and-edit-again feels live).
  const team = useQuery({
    queryKey: ['admin', 'team', eventId, teamId],
    queryFn: async (): Promise<TeamDoc | null> => {
      const snap = await getDoc(teamRef(eventId, teamId));
      return snap.exists() ? snap.data() : null;
    },
  });

  // All teams in this event — used to know "team X is on another team".
  const allTeams = useQuery({
    queryKey: teamsQk(eventId),
    queryFn: async () => {
      const snap = await getDocs(teamsCol(eventId));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const staged = useQuery({
    queryKey: STAGED_QK,
    queryFn: async () => {
      const snap = await getDocs(stagedPlayersCol);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const claimed = useQuery({
    queryKey: CLAIMED_QK,
    queryFn: async () => {
      const snap = await getDocs(usersCol);
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },
  });

  // Flatten every player into a single list with a stable key + the doc ref
  // we'd write to in order to update their team membership.
  const allPeople = useMemo<PersonRow[]>(() => {
    const rows: PersonRow[] = [];
    for (const u of claimed.data ?? []) {
      rows.push({
        key: `c-${u.uid}`,
        email: u.email,
        name: u.displayName ?? u.email.split('@')[0]!,
        uid: u.uid,
        currentTeamId: (u.teamId as string | null) ?? null,
        isClaimed: true,
        membershipRef: doc(usersCol, u.uid),
      });
    }
    for (const s of staged.data ?? []) {
      rows.push({
        key: `s-${s.id}`,
        email: s.email,
        name: s.displayName,
        uid: null,
        currentTeamId: (s.teamId as string | null) ?? null,
        isClaimed: false,
        membershipRef: doc(stagedPlayersCol, s.id),
      });
    }
    return rows;
  }, [claimed.data, staged.data]);

  const [search, setSearch] = useState('');

  // Lookup of every team in this event. Used to detect "orphaned" players
  // whose `currentTeamId` points at a team that no longer exists, so the
  // picker can render them as effectively unassigned.
  const teamsById = useMemo(() => {
    const m = new Map<string, TeamDoc>();
    for (const team of allTeams.data ?? []) m.set(team.id, team);
    return m;
  }, [allTeams.data]);

  const teamMembers = allPeople.filter((p) => p.currentTeamId === teamId);

  // Fuse index — fuzzy, typo-tolerant. Rebuilt only when the player
  // directory itself changes, so typing is cheap.
  const fuse = useMemo(
    () =>
      new Fuse(allPeople, {
        keys: ['name', 'email'],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [allPeople],
  );

  /**
   * The "Add players" list is always populated. When a search is active
   * we narrow to matches; either way the list is sorted in three priority
   * tiers, alphabetically within each:
   *
   *   1. Unassigned — pickable, highest priority (top of the list).
   *      This also covers ORPHANS — players whose teamId points at a
   *      team that no longer exists (e.g. the team was deleted). They
   *      look unassigned to the admin and get auto-healed the moment
   *      they're picked into a real team.
   *   2. On another team — visible but greyed, with that team's color +
   *      name chip so the admin sees the conflict at a glance.
   *   3. Already on this team — visible but greyed (tap to remove).
   */
  const visiblePlayers = useMemo(() => {
    const q = search.trim();
    const base = q ? fuse.search(q).map((r) => r.item) : allPeople;
    const cmp = (a: PersonRow, b: PersonRow) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    const unassigned: PersonRow[] = [];
    const onOther: PersonRow[] = [];
    const onThis: PersonRow[] = [];
    for (const p of base) {
      const tid = p.currentTeamId;
      if (!tid) unassigned.push(p);
      else if (tid === teamId) onThis.push(p);
      else if (!teamsById.has(tid)) unassigned.push(p); // orphan → effectively unassigned
      else onOther.push(p);
    }
    return [...unassigned.sort(cmp), ...onOther.sort(cmp), ...onThis.sort(cmp)];
  }, [allPeople, fuse, search, teamId, teamsById]);

  const assignToTeam = useMutation({
    mutationFn: async (args: { person: PersonRow; nextTeamId: string | null }) => {
      await setDoc(
        args.person.membershipRef,
        { teamId: args.nextTeamId },
        { merge: true },
      );
      // Keep the team docs' members[] in sync. Always use email as the
      // identifier — that way staged + claimed players use the same key,
      // and team membership survives the sign-in transition.
      const personEmail = args.person.email.toLowerCase();
      const allTeamDocs = (await getDocs(teamsCol(eventId))).docs;

      // For every team the player is leaving, cascade-clean their email
      // from members[], captain fields, and every roster bucket /
      // sportCaptainEmail. Without this, ghosts accumulate after each
      // re-assignment.
      const leaves = allTeamDocs.filter(
        (t) =>
          t.id !== args.nextTeamId &&
          (t.data().members ?? []).some(
            (m: string) => m.toLowerCase() === personEmail,
          ),
      );
      await Promise.all(
        leaves.map((t) => purgePlayerFromTeam(eventId, t.id, personEmail)),
      );

      // Add to the new team's members[] if joining one (idempotent).
      if (args.nextTeamId) {
        await ensureTeamMember(eventId, args.nextTeamId, personEmail);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamsQk(eventId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'team', eventId, teamId] });
      void qc.invalidateQueries({ queryKey: STAGED_QK });
      void qc.invalidateQueries({ queryKey: CLAIMED_QK });
    },
  });

  const setGroupCaptain = useMutation({
    mutationFn: async (email: string | null) => {
      const normalized = email?.toLowerCase() ?? null;
      // Auto-add the captain to team.members[] first so the captain
      // invariant ("captain is always a team member") never breaks.
      if (normalized) {
        await ensureTeamMember(eventId, teamId, normalized);
      }
      await setDoc(
        teamRef(eventId, teamId),
        { groupCaptainEmail: normalized },
        { merge: true },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'team', eventId, teamId] });
      void qc.invalidateQueries({ queryKey: teamsQk(eventId) });
    },
  });

  const uploadAsset = useMutation({
    mutationFn: async (args: { kind: 'logo' | 'jersey'; file: File }) => {
      const ext = (args.file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `events/${eventId}/teams/${teamId}/${args.kind}.${ext}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, args.file, { contentType: args.file.type || 'image/jpeg' });
      const url = await getDownloadURL(r);
      await setDoc(
        teamRef(eventId, teamId),
        args.kind === 'logo' ? { logoUrl: url } : { jerseyUrl: url },
        { merge: true },
      );
      return url;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'team', eventId, teamId] });
      void qc.invalidateQueries({ queryKey: teamsQk(eventId) });
    },
  });

  const removeTeam = useMutation({
    mutationFn: async () => {
      // 1) Detach members. Email-keyed membership lives both on the user
      //    doc (teamId) and on the (now-deleted) team's members[] — we
      //    only need to clear the user side; the team doc is going away.
      await Promise.all(
        teamMembers.map((m) => setDoc(m.membershipRef, { teamId: null }, { merge: true })),
      );

      // 2) Cascade-delete every match where this team plays, plus the
      //    refereeEvents subcollection under each. Firestore doesn't do
      //    recursive deletes, so we walk it ourselves.
      const asTeamA = await getDocs(
        query(matchesCol(eventId), where('teamAId', '==', teamId)),
      );
      const asTeamB = await getDocs(
        query(matchesCol(eventId), where('teamBId', '==', teamId)),
      );
      const matchIds = new Set<string>();
      for (const d of asTeamA.docs) matchIds.add(d.id);
      for (const d of asTeamB.docs) matchIds.add(d.id);
      for (const matchId of matchIds) {
        const refEvents = await getDocs(refereeEventsCol(eventId, matchId));
        await Promise.all(refEvents.docs.map((e) => deleteDoc(e.ref)));
        await deleteDoc(doc(matchesCol(eventId), matchId));
      }

      // 3) Wipe the team's roster subcollection (one doc per sport).
      const rosters = await getDocs(
        collection(teamRef(eventId, teamId), 'rosters'),
      );
      await Promise.all(rosters.docs.map((r) => deleteDoc(r.ref)));

      // 4) Finally drop the team doc itself.
      await deleteDoc(teamRef(eventId, teamId));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamsQk(eventId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'matches', eventId] });
      onClose();
    },
  });

  if (team.isLoading) return <p className="px-5 text-ink-dim">Loading team…</p>;
  if (!team.data) {
    return (
      <div className="mx-5">
        <p className="text-ink-dim">Team not found.</p>
        <Button variant="ghost" onClick={onClose} className="mt-3 !w-auto !px-4 !py-2">
          ← Back
        </Button>
      </div>
    );
  }

  const t = team.data;
  const color = colorVarFor(t.color);

  // Any team member (staged or claimed) can be the Group Captain. The
  // assignment is stored as an email, so when a staged player eventually
  // signs in, the captain reference resolves automatically.
  const gcCandidates = teamMembers;

  return (
    <div className="mx-5 flex flex-col gap-5">
      <button
        type="button"
        onClick={onClose}
        className="self-start font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim hover:text-ink"
      >
        ← All teams
      </button>

      {/* Hero — when the team colour is dark, the gradient + ink colour
          flip to a light surface with dark text so the team identity
          stays readable. Light-coloured teams keep the original dark
          gradient. */}
      <section
        className="relative overflow-hidden rounded-3xl p-5"
        style={{
          background: teamSurfaceGradient(t.color),
          color: isLightTeamColor(t.color) ? 'var(--bg)' : color,
        }}
      >
        <div className="flex items-center gap-3">
          {t.logoUrl ? (
            <img
              src={t.logoUrl}
              alt=""
              className="h-14 w-14 rounded-full border-2 object-cover"
              style={{
                borderColor: isLightTeamColor(t.color)
                  ? 'color-mix(in oklab, var(--bg) 30%, transparent)'
                  : 'color-mix(in oklab, var(--ink) 25%, transparent)',
              }}
            />
          ) : (
            <span
              aria-hidden
              className="grid h-14 w-14 place-items-center rounded-full border-2 font-display text-lg"
              style={{
                borderColor: isLightTeamColor(t.color)
                  ? 'color-mix(in oklab, var(--bg) 30%, transparent)'
                  : 'color-mix(in oklab, var(--ink) 25%, transparent)',
              }}
            >
              {flagInitials(t.name)}
            </span>
          )}
          <div>
            <p className="font-display text-3xl leading-none uppercase">{t.name}</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] opacity-70">
              {teamMembers.length} player{teamMembers.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </section>

      {/* Group Captain */}
      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Group Captain
        </h3>
        {gcCandidates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-3 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            Add players to this team first.
          </p>
        ) : (
          (() => {
            const gcEmail = t.groupCaptainEmail?.toLowerCase() ?? '';
            const candidates = gcCandidates as DirectoryPersonRow[];
            const picked = gcEmail
              ? candidates.filter((p) => p.email.toLowerCase() === gcEmail)
              : [];
            return (
              <PlayerPicker
                mode="single"
                available={candidates}
                selected={picked}
                onChange={(next) => setGroupCaptain.mutate(next[0]?.email.toLowerCase() ?? null)}
                emptySelectedLabel="No Group Captain yet"
                searchPlaceholder="Search team members…"
                teamColor={t.color}
              />
            );
          })()
        )}
      </section>

      {/* Logo + Jersey uploads */}
      <section className="grid grid-cols-2 gap-3">
        <AssetUpload
          label="Team logo"
          url={t.logoUrl}
          onUpload={(file) => uploadAsset.mutate({ kind: 'logo', file })}
          pending={uploadAsset.isPending && uploadAsset.variables?.kind === 'logo'}
        />
        <AssetUpload
          label="Jersey photo"
          url={t.jerseyUrl}
          onUpload={(file) => uploadAsset.mutate({ kind: 'jersey', file })}
          pending={uploadAsset.isPending && uploadAsset.variables?.kind === 'jersey'}
        />
      </section>

      {/* Current roster */}
      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Roster ({teamMembers.length})
        </h3>
        {teamMembers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-3 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            No players yet · search and add below
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {teamMembers.map((p) => (
              <li
                key={p.key}
                className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => assignToTeam.mutate({ person: p, nextTeamId: null })}
                  className="h-4 w-4 cursor-pointer accent-accent"
                  aria-label={`Remove ${p.name}`}
                />
                <Avatar name={p.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                    {displayEmail(p.email)}
                  </p>
                </div>
                {!p.isClaimed && (
                  <span className="rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
                    Staged
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add players */}
      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Add players
        </h3>
        <FormField label="Search by name or email">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm placeholder:text-ink-mute focus:border-accent focus:outline-none"
            placeholder="Start typing…"
          />
        </FormField>
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
          {search.trim()
            ? `${visiblePlayers.length} match${visiblePlayers.length === 1 ? '' : 'es'}`
            : `${visiblePlayers.length} player${visiblePlayers.length === 1 ? '' : 's'} total`}
          {' · '}unassigned shown first
        </p>
        {visiblePlayers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            No matching players.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visiblePlayers.map((p) => {
              const onThisTeam = p.currentTeamId === teamId;
              const onAnotherTeam = !!p.currentTeamId && !onThisTeam;
              const otherTeam = onAnotherTeam
                ? teamsById.get(p.currentTeamId!) ?? null
                : null;
              const otherTeamName = otherTeam?.name ?? p.currentTeamId;
              const otherTeamColor = otherTeam ? colorVarFor(otherTeam.color) : 'var(--ink-dim)';
              const dimmed = onThisTeam || onAnotherTeam;

              const onToggle = () => {
                if (onThisTeam) {
                  assignToTeam.mutate({ person: p, nextTeamId: null });
                  return;
                }
                if (onAnotherTeam) {
                  if (
                    !window.confirm(
                      `${p.name} is currently on ${otherTeamName}. Move them to ${t.name}?`,
                    )
                  ) {
                    return;
                  }
                }
                assignToTeam.mutate({ person: p, nextTeamId: teamId });
              };

              return (
                <li
                  key={p.key}
                  className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-3 py-2 transition"
                  style={{ opacity: dimmed ? 0.55 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={onThisTeam}
                    onChange={onToggle}
                    className="h-4 w-4 cursor-pointer accent-accent"
                    aria-label={onThisTeam ? `Remove ${p.name}` : `Add ${p.name}`}
                  />
                  <Avatar name={p.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-bold"
                      style={{ color: dimmed ? 'var(--ink-dim)' : 'var(--ink)' }}
                    >
                      {p.name}
                    </p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
                      {displayEmail(p.email)}
                    </p>
                  </div>
                  {onThisTeam && (
                    <span
                      className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                      style={{
                        color: colorVarFor(t.color),
                        borderColor: 'color-mix(in oklab, currentColor 40%, transparent)',
                      }}
                    >
                      On {t.name}
                    </span>
                  )}
                  {onAnotherTeam && (
                    <span
                      className="flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                      style={{
                        color: otherTeamColor,
                        borderColor: 'color-mix(in oklab, currentColor 40%, transparent)',
                      }}
                    >
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: otherTeamColor }}
                      />
                      On {otherTeamName}
                    </span>
                  )}
                  {!p.isClaimed && (
                    <span className="rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
                      Staged
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            if (window.confirm(`Delete "${t.name}"? All ${teamMembers.length} player(s) will be unassigned.`)) {
              removeTeam.mutate();
            }
          }}
          disabled={removeTeam.isPending}
        >
          {removeTeam.isPending ? 'Deleting…' : 'Delete team'}
        </Button>
      </section>
    </div>
  );
}

function AssetUpload({
  label,
  url,
  onUpload,
  pending,
}: {
  label: string;
  url: string | null;
  onUpload: (file: File) => void;
  pending: boolean;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </span>
      <span
        className="grid aspect-square place-items-center overflow-hidden rounded-2xl border border-dashed border-line bg-bg-card text-center"
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-mute">
            {pending ? 'Uploading…' : 'Tap to upload'}
          </span>
        )}
      </span>
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}
