import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDocs, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Avatar } from '@/components/shared/Avatar';
import { PlayerPicker } from '@/components/shared/PlayerPicker';
import { Button } from '@/components/shared/Button';
import { useRole } from '@/lib/roles';
import { useAuth } from '@/lib/auth';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers, type PersonRow } from '@/lib/playerDirectory';
import { emailDocId, stagedPlayersCol, teamsCol, usersCol } from '@/lib/db';
import { displayEmail } from '@/lib/syntheticEmail';
import { grantAdmin, revokeAdmin } from '@/lib/manageAdmins';
import { CsvImporter, ManualAdd, type ImportedRow } from '@/components/admin/PlayerImport';
import { colorVarFor, type TeamId } from '@/types/team';
import type { UserDoc, TeamDoc } from '@/types/player';

export const Route = createFileRoute('/manage-admins')({
  component: ManageAdminsScreen,
});

const ADMINS_QK = ['manage-admins', 'list'] as const;

type AdminRow = UserDoc & { uid: string };

function ManageAdminsScreen() {
  const role = useRole();
  const auth = useAuth();
  const importerUid = auth.status === 'signedIn' ? auth.user.uid : null;
  const qc = useQueryClient();
  const { people, isLoading: peopleLoading } = useAllEventPlayers();
  const { activeEventId, event: activeEvent } = useActiveEvent();

  // Set of emails already known to the system — used to dedupe imports.
  const knownEmails = useMemo(
    () => new Set(people.map((p) => p.email.toLowerCase())),
    [people],
  );

  // Subscribe to teams in the active event so we can render the "Players
  // in this event" roster grouped by team. The collection is read-public,
  // so this works for every signed-in user.
  const [eventTeams, setEventTeams] = useState<(TeamDoc & { id: TeamId })[]>([]);
  const [eventTeamsLoading, setEventTeamsLoading] = useState(true);
  useEffect(() => {
    if (!activeEventId) {
      setEventTeams([]);
      setEventTeamsLoading(false);
      return;
    }
    setEventTeamsLoading(true);
    return onSnapshot(
      teamsCol(activeEventId),
      (snap) => {
        setEventTeams(
          snap.docs.map((d) => ({ id: d.id as TeamId, ...(d.data() as TeamDoc) })),
        );
        setEventTeamsLoading(false);
      },
      () => setEventTeamsLoading(false),
    );
  }, [activeEventId]);

  // Map email → directory row so the roster section can show display name
  // and claimed/staged status without re-fetching.
  const directoryByEmail = useMemo(() => {
    const m = new Map<string, PersonRow>();
    for (const p of people) m.set(p.email.toLowerCase(), p);
    return m;
  }, [people]);

  // Set of emails referenced by any team in the active event — drives
  // the "Unassigned" bucket so admins see imported users who haven't been
  // rostered yet.
  const rosteredEmails = useMemo(() => {
    const s = new Set<string>();
    for (const t of eventTeams) {
      for (const m of t.members ?? []) s.add(m.toLowerCase());
    }
    return s;
  }, [eventTeams]);

  const unassignedPeople = useMemo(
    () => people.filter((p) => !rosteredEmails.has(p.email.toLowerCase())),
    [people, rosteredEmails],
  );

  // Stage a list of users globally (not event-scoped). Once each user signs
  // in for the first time, the `onUserCreate` Cloud Function promotes
  // their staged record to a `users/{uid}` doc; from that point they
  // appear in the picker below and can be granted admin.
  const importUsers = useMutation({
    mutationFn: async (rows: ImportedRow[]) => {
      if (!importerUid) throw new Error('Not signed in.');
      await Promise.all(
        rows
          .filter((r) => !knownEmails.has(r.email))
          .map((r) =>
            setDoc(
              doc(stagedPlayersCol, emailDocId(r.email)),
              {
                email: r.email,
                displayName: r.name,
                phone: r.phone,
                teamId: null,
                importedAt: serverTimestamp(),
                importedBy: importerUid,
              },
              { merge: true },
            ),
          ),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['eventPlayers', 'staged'] });
    },
  });

  // Current admin list — derived from users/{uid}.globalRoles. This is
  // the canonical client-visible source; the underlying custom claim
  // gates the Firestore writes.
  const admins = useQuery({
    queryKey: ADMINS_QK,
    enabled: role.is('super-admin'),
    queryFn: async (): Promise<AdminRow[]> => {
      const snap = await getDocs(usersCol);
      return snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => (u.globalRoles ?? []).includes('admin'));
    },
  });

  const adminUids = useMemo(
    () => new Set((admins.data ?? []).map((u) => u.uid)),
    [admins.data],
  );

  // Grant flow's candidate pool = signed-in users not already admin and
  // not the calling super-admin themselves (you can't re-grant yourself).
  const grantCandidates = useMemo<PersonRow[]>(() => {
    const out: PersonRow[] = [];
    for (const p of people) {
      if (!p.uid) continue; // staged players can't be admins yet
      if (adminUids.has(p.uid)) continue;
      out.push(p);
    }
    return out;
  }, [people, adminUids]);

  const grant = useMutation({
    mutationFn: async (uid: string) => grantAdmin(uid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMINS_QK });
    },
  });
  const revoke = useMutation({
    mutationFn: async (uid: string) => revokeAdmin(uid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMINS_QK });
    },
  });

  if (role.loading) {
    return (
      <>
        <TopBar title="Manage Admins" />
        <main className="mx-auto max-w-[420px] pb-28">
          <p className="px-5 text-ink-dim">Checking role…</p>
        </main>
      </>
    );
  }

  if (!role.is('super-admin')) {
    return (
      <>
        <TopBar title="Manage Admins" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="Super Admin only"
            hint="This screen grants and revokes admin access — only the Super Admin can use it."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Manage Admins" />
      <main className="mx-auto flex max-w-[420px] flex-col gap-5 pb-28">
        {/* Current admins */}
        <section className="mx-5 flex flex-col gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Current admins ({admins.data?.length ?? 0})
          </h2>
          {admins.isLoading ? (
            <p className="text-ink-dim">Loading…</p>
          ) : (admins.data ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
              No admins yet — grant the first one below.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(admins.data ?? []).map((u) => {
                const isSuper = (u.globalRoles ?? []).includes('super-admin');
                const isPending = revoke.isPending && revoke.variables === u.uid;
                return (
                  <li
                    key={u.uid}
                    className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-3 py-2"
                  >
                    <Avatar name={u.displayName ?? u.email} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {u.displayName ?? u.email}
                      </p>
                      <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                        {displayEmail(u.email)}
                      </p>
                    </div>
                    {isSuper && (
                      <span
                        className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                        style={{
                          color: 'var(--gold)',
                          borderColor: 'color-mix(in oklab, var(--gold) 40%, transparent)',
                        }}
                      >
                        Super
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        const warn = isSuper
                          ? `Revoke admin from ${u.displayName ?? u.email}? They will keep Super Admin powers — only the admin claim is removed.`
                          : `Revoke admin from ${u.displayName ?? u.email}?`;
                        if (window.confirm(warn)) {
                          revoke.mutate(u.uid);
                        }
                      }}
                      className="!w-auto !px-3 !py-1.5"
                    >
                      {isPending ? '…' : 'Revoke'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {revoke.error && (
            <p className="font-mono text-[10px] text-accent">
              {revoke.error instanceof Error ? revoke.error.message : String(revoke.error)}
            </p>
          )}
        </section>

        {/* Global user pool — CSV + manual entry. Independent of any event;
            users staged here become candidates for admin promotion below
            the moment they sign in. */}
        <section className="mx-5 flex flex-col gap-3 border-t border-line pt-5">
          <header>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
              Add users
            </h2>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
              Stage users globally — they don't need to be part of an event.
              Each user must sign in once before they can be granted admin.
            </p>
          </header>

          <CsvImporter
            heading="Bulk add (CSV)"
            onImport={(rows) => importUsers.mutate(rows)}
            pending={importUsers.isPending}
            error={importUsers.error ? String(importUsers.error) : null}
            success={importUsers.isSuccess}
            existingEmails={knownEmails}
          />

          <ManualAdd
            heading="Add one user"
            buttonLabel="Add user"
            onAdd={(row) => importUsers.mutate([row])}
            pending={importUsers.isPending}
            existingEmails={knownEmails}
          />
        </section>

        {/* Grant flow */}
        <section className="mx-5 flex flex-col gap-2 border-t border-line pt-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Grant admin
          </h2>
          <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
            The user must have signed in once — staged users can't be
            promoted until their account exists.
          </p>
          {peopleLoading ? (
            <p className="text-ink-dim">Loading users…</p>
          ) : (
            <PlayerPicker
              available={grantCandidates}
              selected={[]}
              onChange={(next) => {
                const target = next[0];
                if (!target?.uid) return;
                if (
                  window.confirm(`Grant admin to ${target.name} (${target.email})?`)
                ) {
                  grant.mutate(target.uid);
                }
              }}
              mode="single"
              searchPlaceholder="Search a signed-in user…"
              emptyAvailableLabel="Everyone who can be admin already is."
              emptySelectedLabel="Pick a user to promote"
            />
          )}
          {grant.error && (
            <p className="font-mono text-[10px] text-accent">
              {grant.error instanceof Error ? grant.error.message : String(grant.error)}
            </p>
          )}
          <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
            Note: the new admin needs to sign out and back in (or wait
            ~1 hr for token refresh) before Firestore writes succeed.
          </p>
        </section>

        {/* Players in the active event — grouped by team. Read-only
            reference list so super admins don't need to bounce to the
            Players / Teams tabs to see who's been imported and where
            they sit. Includes an "Unassigned" bucket for users who've
            been imported globally but aren't on any team in this event
            yet. */}
        <section className="mx-5 flex flex-col gap-3 border-t border-line pt-5">
          <header>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
              Players in this event
            </h2>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
              {activeEvent
                ? `Active event: ${activeEvent.name}. Roster mirrors the Teams tab in real time.`
                : 'No active event selected.'}
            </p>
          </header>

          {eventTeamsLoading || peopleLoading ? (
            <p className="text-ink-dim">Loading…</p>
          ) : !activeEventId ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
              Pick an event from the top bar to see its roster.
            </p>
          ) : (
            <>
              {eventTeams.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
                  No teams in this event yet · create one on the Teams tab.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {eventTeams.map((t) => (
                    <TeamRosterCard
                      key={t.id}
                      team={t}
                      directoryByEmail={directoryByEmail}
                    />
                  ))}
                </ul>
              )}

              {unassignedPeople.length > 0 && (
                <UnassignedCard people={unassignedPeople} />
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}

function TeamRosterCard({
  team,
  directoryByEmail,
}: {
  team: TeamDoc & { id: TeamId };
  directoryByEmail: Map<string, PersonRow>;
}) {
  const teamColor = team.color || colorVarFor(team.id);
  const members = (team.members ?? []).map((rawEmail) => {
    const email = rawEmail.toLowerCase();
    const directory = directoryByEmail.get(email);
    return {
      email,
      name: directory?.name ?? email.split('@')[0]!,
      isClaimed: !!directory?.isClaimed,
    };
  });
  const sortedMembers = [...members].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
  const gcEmail = team.groupCaptainEmail?.toLowerCase() ?? null;
  const vcEmail = team.viceCaptainEmail?.toLowerCase() ?? null;

  return (
    <li className="rounded-xl border border-line bg-bg-card">
      <header
        className="flex items-center gap-2 rounded-t-xl px-3 py-2"
        style={{ background: `color-mix(in oklab, ${teamColor} 18%, transparent)` }}
      >
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ background: teamColor }}
          aria-hidden="true"
        />
        <p className="flex-1 truncate font-display text-base uppercase">
          {team.name}
        </p>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
          {sortedMembers.length} player{sortedMembers.length === 1 ? '' : 's'}
        </span>
      </header>
      {sortedMembers.length === 0 ? (
        <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
          No members yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {sortedMembers.map((m) => {
            const isGc = !!gcEmail && gcEmail === m.email;
            const isVc = !!vcEmail && vcEmail === m.email;
            return (
              <li
                key={m.email}
                className="flex items-center gap-2 border-t border-line px-3 py-2 first:border-t-0"
              >
                <Avatar name={m.name} teamId={team.id as TeamId} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{m.name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                    {displayEmail(m.email)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isGc && (
                    <span
                      className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                      style={{
                        color: 'var(--gold)',
                        borderColor: 'color-mix(in oklab, var(--gold) 40%, transparent)',
                      }}
                    >
                      GC
                    </span>
                  )}
                  {isVc && (
                    <span
                      className="rounded-md border border-line bg-bg-elev px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim"
                    >
                      VC
                    </span>
                  )}
                  {m.isClaimed ? (
                    <span
                      className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                      style={{
                        color: 'var(--accent-2)',
                        borderColor: 'color-mix(in oklab, var(--accent-2) 40%, transparent)',
                      }}
                    >
                      Signed in
                    </span>
                  ) : (
                    <span className="rounded-md border border-line bg-bg-elev px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
                      Staged
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function UnassignedCard({ people }: { people: PersonRow[] }) {
  const sorted = [...people].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
  return (
    <div className="rounded-xl border border-dashed border-line bg-bg-card">
      <header className="rounded-t-xl border-b border-line px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Unassigned · {sorted.length}
        </p>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
          Imported but not yet on a team in this event.
        </p>
      </header>
      <ul className="flex flex-col">
        {sorted.map((p) => (
          <li
            key={p.email}
            className="flex items-center gap-2 border-t border-line px-3 py-2 first:border-t-0"
          >
            <Avatar name={p.name} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{p.name}</p>
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                {displayEmail(p.email)}
              </p>
            </div>
            {p.isClaimed ? (
              <span
                className="shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                style={{
                  color: 'var(--accent-2)',
                  borderColor: 'color-mix(in oklab, var(--accent-2) 40%, transparent)',
                }}
              >
                Signed in
              </span>
            ) : (
              <span className="shrink-0 rounded-md border border-line bg-bg-elev px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
                Staged
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
