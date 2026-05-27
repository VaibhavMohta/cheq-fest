import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

const CHEQ_DOMAIN = 'cheq.one';

// Explicit allow-list of personal emails permitted to sign in despite not
// being on @cheq.one. Keep this list short and intentional.
const ALLOWED_EMAILS = new Set<string>(['vai.mohta@gmail.com']);

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  if (normalized.endsWith(`@${CHEQ_DOMAIN}`)) return true;
  return ALLOWED_EMAILS.has(normalized);
}

const provider = new GoogleAuthProvider();
// Don't set `hd` here — that would block the personal allow-list emails at
// the Google account picker. Domain enforcement happens after sign-in.
provider.setCustomParameters({ prompt: 'select_account' });

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedIn'; user: User }
  | { status: 'signedOut'; user: null };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setState({ status: 'signedIn', user });
      } else {
        setState({ status: 'signedOut', user: null });
      }
    });
  }, []);

  return state;
}

export class CheqDomainError extends Error {
  constructor(public readonly email: string | null) {
    super(`This Google account is not allowed to sign in. Use an @${CHEQ_DOMAIN} account.`);
    this.name = 'CheqDomainError';
  }
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, provider);
  const email = credential.user.email;
  if (!isAllowedEmail(email)) {
    // Sign back out so the rejected account doesn't hold a session, even briefly.
    await fbSignOut(auth);
    throw new CheqDomainError(email);
  }
  return credential.user;
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}
