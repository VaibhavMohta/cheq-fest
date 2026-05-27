/**
 * Reusable user-import primitives — CSV paste + manual single-row add.
 *
 * Used by:
 *  - PlayersTab (event-scoped admin setup, gated by RequireEvent)
 *  - Manage Admins screen (global user pool — add users without needing
 *    an active event before promoting them to admin)
 *
 * Both surfaces stage rows into `stagedPlayers/`, keyed by lowercased
 * email so re-imports merge instead of duplicating. Promotion to a real
 * `users/{uid}` doc happens via the `onUserCreate` Cloud Function the
 * first time the staged email signs in.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { parsePlayersCsv } from '@/lib/csv';
import { normalizeEmail } from '@/lib/db';
import { makeSyntheticEmail } from '@/lib/syntheticEmail';
import { FormField, TextArea, TextInput } from './FormField';

export type ImportedRow = {
  email: string;
  name: string;
  phone: string | null;
};

export function CsvImporter({
  onImport,
  pending,
  error,
  success,
  existingEmails,
  heading = 'Paste CSV',
}: {
  onImport: (rows: ImportedRow[]) => void;
  pending: boolean;
  error: string | null;
  success: boolean;
  existingEmails: Set<string>;
  heading?: string;
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
        {heading}
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
            : `Import ${newRowsCount} user${newRowsCount === 1 ? '' : 's'}`}
      </Button>
    </section>
  );
}

export function ManualAdd({
  onAdd,
  pending,
  existingEmails,
  heading = 'Add one user',
  buttonLabel = 'Add user',
}: {
  onAdd: (row: ImportedRow) => void;
  pending: boolean;
  existingEmails: Set<string>;
  heading?: string;
  buttonLabel?: string;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        {heading}
      </h2>
      <div className="grid grid-cols-1 gap-2">
        <FormField
          label="Email (optional)"
          hint={
            email.trim()
              ? undefined
              : 'Leave blank for players who don’t have an email yet — they’ll show as "No email" in the picker and can’t be promoted to admin.'
          }
        >
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
          const displayName = name.trim();
          if (!displayName) {
            setError('Display name is required.');
            return;
          }
          const typedEmail = normalizeEmail(email);
          let finalEmail: string;
          if (typedEmail.length === 0) {
            // No email provided — mint a synthetic id in the
            // @no-email.local namespace so the rest of the system keeps
            // working (membership, captaincy etc. are all email-keyed).
            // The UI renders these as "No email" via displayEmail().
            finalEmail = makeSyntheticEmail(displayName);
          } else {
            if (!typedEmail.includes('@')) {
              setError('Enter a valid email — or leave it blank.');
              return;
            }
            if (existingEmails.has(typedEmail)) {
              setError(`${typedEmail} is already in the list.`);
              return;
            }
            finalEmail = typedEmail;
          }
          setError(null);
          onAdd({
            email: finalEmail,
            name: displayName,
            phone: phone.trim() || null,
          });
          setEmail('');
          setName('');
          setPhone('');
        }}
      >
        {buttonLabel}
      </Button>
    </section>
  );
}
