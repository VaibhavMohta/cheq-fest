import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

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
