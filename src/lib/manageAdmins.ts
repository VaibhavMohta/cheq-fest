import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { emailDocId, stagedPlayersCol } from './db';

const grantCallable = httpsCallable<{ uid: string }, { ok: true; uid: string }>(
  functions,
  'grantAdmin',
);

const revokeCallable = httpsCallable<{ uid: string }, { ok: true; uid: string }>(
  functions,
  'revokeAdmin',
);

export async function grantAdmin(uid: string): Promise<void> {
  await grantCallable({ uid });
}

export async function revokeAdmin(uid: string): Promise<void> {
  await revokeCallable({ uid });
}

/**
 * Pre-stage an admin promotion for a user who hasn't signed in yet. The
 * stagedPlayers doc gets a `pendingAdmin: true` flag; `onUserCreate`
 * picks it up on first sign-in and applies the `admin` custom claim
 * automatically (no manual second step needed).
 *
 * Server gating: only admins can write to `stagedPlayers/{id}` per
 * Firestore rules, so the caller's `admin` claim already enforces the
 * Super-Admin-or-Admin permission level. The UI scopes this further to
 * Super Admin only on the Manage Admins screen.
 */
export async function stagePendingAdmin(email: string): Promise<void> {
  await setDoc(
    doc(stagedPlayersCol, emailDocId(email)),
    { pendingAdmin: true },
    { merge: true },
  );
}

export async function unstagePendingAdmin(email: string): Promise<void> {
  await setDoc(
    doc(stagedPlayersCol, emailDocId(email)),
    { pendingAdmin: false },
    { merge: true },
  );
}
