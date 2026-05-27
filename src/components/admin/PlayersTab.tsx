import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import type { TeamId } from '@/types/team';
import {
  emailDocId,
  normalizeEmail,
  stagedPlayersCol,
  usersCol,
} from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { CsvImporter, ManualAdd } from './PlayerImport';
import { RequireEvent } from './RequireEvent';

const STAGED_QK = ['admin', 'stagedPlayers'] as const;
const CLAIMED_QK = ['admin', 'claimedPlayers'] as const;

export function PlayersTab() {
  // Players are global (an email can sign up once and be reused across years)
  // but we gate the tab on having an active event so admins can't import
  // players into a vacuum — they're meant to assign them to teams in
  // the active event right after.
  return <RequireEvent>{() => <PlayersTabInner />}</RequireEvent>;
}

function PlayersTabInner() {
  const auth = useAuth();
  const importerUid = auth.status === 'signedIn' ? auth.user.uid : null;
  const qc = useQueryClient();

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

  const importCsv = useMutation({
    mutationFn: async (rows: { email: string; name: string; phone: string | null }[]) => {
      if (!importerUid) throw new Error('Not signed in.');
      // Check which emails already exist in users/ so we don't stage duplicates.
      const existingEmails = new Set(
        (claimed.data ?? []).map((u) => normalizeEmail(u.email)),
      );
      await Promise.all(
        rows
          .filter((r) => !existingEmails.has(r.email))
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
      void qc.invalidateQueries({ queryKey: STAGED_QK });
    },
  });

  const removeStaged = useMutation({
    mutationFn: async (stagedId: string) => {
      await deleteDoc(doc(stagedPlayersCol, stagedId));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: STAGED_QK });
    },
  });

  const allEmails = useMemo(() => {
    const set = new Set<string>();
    for (const s of staged.data ?? []) set.add(normalizeEmail(s.email));
    for (const c of claimed.data ?? []) set.add(normalizeEmail(c.email));
    return set;
  }, [staged.data, claimed.data]);

  return (
    <div className="mx-5 flex flex-col gap-5">
      <CsvImporter
        onImport={(rows) => importCsv.mutate(rows)}
        pending={importCsv.isPending}
        error={importCsv.error ? String(importCsv.error) : null}
        success={importCsv.isSuccess}
        existingEmails={allEmails}
      />

      <ManualAdd
        onAdd={(row) => importCsv.mutate([row])}
        pending={importCsv.isPending}
        existingEmails={allEmails}
      />

      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          {(staged.data?.length ?? 0) + (claimed.data?.length ?? 0)} players ·{' '}
          {claimed.data?.length ?? 0} signed in
        </h2>

        {staged.isLoading || claimed.isLoading ? (
          <p className="text-ink-dim">Loading…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(claimed.data ?? []).map((u) => (
              <PlayerRow
                key={u.uid}
                email={u.email}
                name={u.displayName ?? u.email.split('@')[0]!}
                teamId={u.teamId ?? null}
                status="claimed"
              />
            ))}
            {(staged.data ?? []).map((s) => (
              <PlayerRow
                key={s.id}
                email={s.email}
                name={s.displayName}
                teamId={s.teamId ?? null}
                status="staged"
                onRemove={() => removeStaged.mutate(s.id)}
                removing={removeStaged.isPending && removeStaged.variables === s.id}
              />
            ))}
            {(staged.data ?? []).length + (claimed.data ?? []).length === 0 && (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
                No players yet · paste a CSV or add one manually
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function PlayerRow({
  email,
  name,
  teamId,
  status,
  onRemove,
  removing,
}: {
  email: string;
  name: string;
  teamId: TeamId | null;
  status: 'staged' | 'claimed';
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{name}</p>
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          {email}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={status} />
        {teamId ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
            {teamId}
          </span>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
            No team
          </span>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="rounded-lg border border-line bg-bg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim hover:text-accent disabled:opacity-50"
        >
          {removing ? '…' : 'Remove'}
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'staged' | 'claimed' }) {
  if (status === 'claimed') {
    return (
      <span
        className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
        style={{
          color: 'var(--accent-2)',
          borderColor: 'color-mix(in oklab, var(--accent-2) 40%, transparent)',
        }}
      >
        Signed in
      </span>
    );
  }
  return (
    <span className="rounded-md border border-line bg-bg-elev px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
      Staged
    </span>
  );
}
