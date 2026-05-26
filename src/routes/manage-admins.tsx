import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDocs } from 'firebase/firestore';
import { createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Avatar } from '@/components/shared/Avatar';
import { PlayerPicker } from '@/components/shared/PlayerPicker';
import { Button } from '@/components/shared/Button';
import { useRole } from '@/lib/roles';
import { useAllEventPlayers, type PersonRow } from '@/lib/playerDirectory';
import { usersCol } from '@/lib/db';
import { grantAdmin, revokeAdmin } from '@/lib/manageAdmins';
import type { UserDoc } from '@/types/player';

export const Route = createFileRoute('/manage-admins')({
  component: ManageAdminsScreen,
});

const ADMINS_QK = ['manage-admins', 'list'] as const;

type AdminRow = UserDoc & { uid: string };

function ManageAdminsScreen() {
  const role = useRole();
  const qc = useQueryClient();
  const { people, isLoading: peopleLoading } = useAllEventPlayers();

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
                        {u.email}
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
                      disabled={isSuper || isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Revoke admin from ${u.displayName ?? u.email}?`,
                          )
                        ) {
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

        {/* Grant flow */}
        <section className="mx-5 flex flex-col gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Grant admin
          </h2>
          <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
            The user must have signed in once — staged players can't be
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
