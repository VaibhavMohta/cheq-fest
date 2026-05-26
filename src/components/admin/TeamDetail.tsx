import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import {
  stagedPlayersCol,
  teamRef,
  teamsCol,
  usersCol,
} from '@/lib/db';
import { storage } from '@/lib/firebase';
import { colorVarFor, flagInitials } from '@/types/team';
import type { TeamDoc } from '@/types/player';
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

  const teamMembers = allPeople.filter((p) => p.currentTeamId === teamId);
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as PersonRow[];
    return allPeople
      .filter(
        (p) =>
          p.currentTeamId !== teamId &&
          (p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [allPeople, search, teamId]);

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
      const writes: Promise<void>[] = [];
      for (const t of allTeamDocs) {
        const data = t.data();
        const members = new Set(data.members.map((m) => m.toLowerCase()));
        const before = members.size;
        if (t.id === args.nextTeamId) {
          members.add(personEmail);
        } else {
          members.delete(personEmail);
        }
        if (members.size !== before) {
          writes.push(setDoc(t.ref, { members: Array.from(members) }, { merge: true }));
        }
      }
      // If the person was the GC of any team they're leaving, clear that.
      for (const t of allTeamDocs) {
        const data = t.data();
        if (
          t.id !== args.nextTeamId &&
          data.groupCaptainEmail?.toLowerCase() === personEmail
        ) {
          writes.push(setDoc(t.ref, { groupCaptainEmail: null }, { merge: true }));
        }
      }
      await Promise.all(writes);
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
      await setDoc(
        teamRef(eventId, teamId),
        { groupCaptainEmail: email?.toLowerCase() ?? null },
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
      // Detach members first so they don't end up dangling on a missing team.
      await Promise.all(
        teamMembers.map((m) => setDoc(m.membershipRef, { teamId: null }, { merge: true })),
      );
      await deleteDoc(teamRef(eventId, teamId));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamsQk(eventId) });
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
  const teamsById = new Map<string, TeamDoc>();
  for (const team of allTeams.data ?? []) teamsById.set(team.id, team);

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

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-3xl p-5 text-bg"
        style={{ background: `linear-gradient(135deg, ${color}, #0f0e0c)` }}
      >
        <div className="flex items-center gap-3">
          {t.logoUrl ? (
            <img
              src={t.logoUrl}
              alt=""
              className="h-14 w-14 rounded-full border-2 border-bg/30 object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-14 w-14 place-items-center rounded-full border-2 border-bg/30 font-display text-lg"
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
          <select
            value={t.groupCaptainEmail ?? ''}
            onChange={(e) => setGroupCaptain.mutate(e.target.value || null)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">— No Group Captain —</option>
            {gcCandidates.map((m) => (
              <option key={m.key} value={m.email.toLowerCase()}>
                {m.name}
                {!m.isClaimed ? ' (staged — assigns on sign-in)' : ''}
              </option>
            ))}
          </select>
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
                    {p.email}
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
        {search && searchResults.length === 0 && (
          <p className="font-mono text-[10px] text-ink-mute">No matching players.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {searchResults.map((p) => {
            const onAnotherTeam = !!p.currentTeamId;
            const otherTeamName = onAnotherTeam
              ? teamsById.get(p.currentTeamId!)?.name ?? p.currentTeamId
              : null;
            return (
              <li
                key={p.key}
                className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => {
                    if (
                      onAnotherTeam &&
                      !window.confirm(
                        `${p.name} is currently on ${otherTeamName}. Move them to ${t.name}?`,
                      )
                    ) {
                      return;
                    }
                    assignToTeam.mutate({ person: p, nextTeamId: teamId });
                  }}
                  className="h-4 w-4 cursor-pointer accent-accent"
                  aria-label={`Add ${p.name}`}
                />
                <Avatar name={p.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                    {p.email}
                  </p>
                </div>
                {onAnotherTeam && (
                  <span
                    className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                    style={{ color: 'var(--gold)', borderColor: 'color-mix(in oklab, var(--gold) 40%, transparent)' }}
                  >
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
