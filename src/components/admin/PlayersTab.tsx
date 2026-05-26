import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { Button } from '@/components/shared/Button';
import type { TeamId } from '@/types/team';
import { parsePlayersCsv } from '@/lib/csv';
import {
  emailDocId,
  normalizeEmail,
  stagedPlayersCol,
  usersCol,
} from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { FormField, TextArea, TextInput } from './FormField';
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

function CsvImporter({
  onImport,
  pending,
  error,
  success,
  existingEmails,
}: {
  onImport: (rows: { email: string; name: string; phone: string | null }[]) => void;
  pending: boolean;
  error: string | null;
  success: boolean;
  existingEmails: Set<string>;
}) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parsePlayersCsv(text) : null), [text]);
  const newRowsCount = parsed
    ? parsed.rows.filter((r) => !existingEmails.has(r.email)).length
    : 0;
  const skipCount = parsed ? parsed.rows.length - newRowsCount : 0;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        Paste CSV
      </h2>
      <FormField
        label="CSV (email, name, phone)"
        hint="First row must be a header. Email is required. Lines with bad emails are skipped."
      >
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`email,name,phone\nshah@cheq.one,Shah Mehta,\nriya@cheq.one,Riya N,+91...`}
        />
      </FormField>

      {parsed && (
        <div className="rounded-xl border border-line bg-bg-card px-3 py-2 text-xs">
          <p className="font-mono uppercase tracking-[0.06em] text-ink-dim">
            {newRowsCount} new · {skipCount} already in list · {parsed.errors.length} skipped
          </p>
          {parsed.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-4 font-mono text-[10px] text-accent">
              {parsed.errors.slice(0, 5).map((e, i) => (
                <li key={i}>
                  row {e.rowIndex}: {e.message}
                </li>
              ))}
              {parsed.errors.length > 5 && <li>… and {parsed.errors.length - 5} more</li>}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] text-accent">
          {error}
        </p>
      )}

      <Button
        type="button"
        disabled={pending || !parsed || newRowsCount === 0}
        onClick={() => {
          if (!parsed) return;
          const next = parsed.rows.filter((r) => !existingEmails.has(r.email));
          onImport(next);
        }}
      >
        {pending
          ? 'Importing…'
          : success && newRowsCount === 0
            ? 'Imported ✓'
            : `Import ${newRowsCount} player${newRowsCount === 1 ? '' : 's'}`}
      </Button>
    </section>
  );
}

function ManualAdd({
  onAdd,
  pending,
  existingEmails,
}: {
  onAdd: (row: { email: string; name: string; phone: string | null }) => void;
  pending: boolean;
  existingEmails: Set<string>;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        Add one player
      </h2>
      <div className="grid grid-cols-1 gap-2">
        <FormField label="Email">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@cheq.one"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Display name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Shah Mehta" />
          </FormField>
          <FormField label="Phone (optional)">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
          </FormField>
        </div>
      </div>
      {error && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] text-accent">
          {error}
        </p>
      )}
      <Button
        variant="ghost"
        type="button"
        disabled={pending}
        onClick={() => {
          const e = normalizeEmail(email);
          if (!e || !e.includes('@')) {
            setError('Enter a valid email.');
            return;
          }
          if (existingEmails.has(e)) {
            setError(`${e} is already in the list.`);
            return;
          }
          setError(null);
          onAdd({ email: e, name: name.trim() || e.split('@')[0]!, phone: phone.trim() || null });
          setEmail('');
          setName('');
          setPhone('');
        }}
      >
        Add player
      </Button>
    </section>
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
