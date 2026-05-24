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

const provider = new GoogleAuthProvider();
// Restrict Google's OAuth picker to @cheq.one accounts at the provider level.
// Defense-in-depth check on email happens in the Cloud Function and the UI.
provider.setCustomParameters({ hd: CHEQ_DOMAIN, prompt: 'select_account' });

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
    super(`Only @${CHEQ_DOMAIN} Google accounts can sign in.`);
    this.name = 'CheqDomainError';
  }
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, provider);
  const email = credential.user.email;
  if (!email || !email.toLowerCase().endsWith(`@${CHEQ_DOMAIN}`)) {
    // Sign the user back out before propagating — they should not have an
    // active session if their domain is wrong, even briefly.
    await fbSignOut(auth);
    throw new CheqDomainError(email);
  }
  return credential.user;
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}
