import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Avatar } from '@/components/shared/Avatar';
import { PlayerPicker } from '@/components/shared/PlayerPicker';
import { Button } from '@/components/shared/Button';
import { useRole } from '@/lib/roles';
import { useAuth } from '@/lib/auth';
import { useAllEventPlayers, type PersonRow } from '@/lib/playerDirectory';
import { emailDocId, stagedPlayersCol, usersCol } from '@/lib/db';
import { displayEmail } from '@/lib/syntheticEmail';
import { grantAdmin, revokeAdmin } from '@/lib/manageAdmins';
import { CsvImporter, ManualAdd, type ImportedRow } from '@/components/admin/PlayerImport';
import type { UserDoc } from '@/types/player';

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

  // Set of emails already known to the system — used to dedupe imports.
  const knownEmails = useMemo(
    () => new Set(people.map((p) => p.email.toLowerCase())),
    [people],
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
      </main>
    </>
  );
}
