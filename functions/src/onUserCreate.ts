import { auth } from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const CHEQ_DOMAIN = 'cheq.one';

// Explicit allow-list of personal emails permitted alongside @cheq.one.
// Keep in sync with `ALLOWED_EMAILS` in src/lib/auth.ts.
const ALLOWED_EMAILS = new Set<string>(['vai.mohta@gmail.com']);

function isAllowedEmail(email: string): boolean {
  const normalized = email.toLowerCase();
  if (normalized.endsWith(`@${CHEQ_DOMAIN}`)) return true;
  return ALLOWED_EMAILS.has(normalized);
}

/**
 * Hard-enforce the @cheq.one domain. Even though the client uses
 * `hd: cheq.one` in the Google OAuth flow, an attacker could call the
 * Identity Toolkit API directly — this function is the backstop.
 *
 * On accept: write the user doc and, if a stagedPlayers record exists for
 * their email, merge in pre-imported fields (displayName, phone, teamId).
 */
export const onUserCreate = auth.user().onCreate(async (user) => {
  const email = user.email?.toLowerCase() ?? null;

  if (!email || !isAllowedEmail(email)) {
    logger.warn('Rejecting non-allowed account', { uid: user.uid, email });
    await getAuth().deleteUser(user.uid);
    return;
  }

  const db = getFirestore();
  const userRef = db.collection('users').doc(user.uid);

  // Look for a staged record imported by an admin before this user logged in.
  const stagedSnap = await db
    .collection('stagedPlayers')
    .where('email', '==', email)
    .limit(1)
    .get();

  const staged = stagedSnap.docs[0];
  const stagedData = staged?.data() ?? {};

  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        email,
        displayName: user.displayName ?? stagedData['displayName'] ?? null,
        googlePhotoUrl: user.photoURL ?? null,
        adminPhotoUrl: null,
        phone: stagedData['phone'] ?? null,
        teamId: stagedData['teamId'] ?? null,
        createdAt: FieldValue.serverTimestamp(),
        globalRoles: [] as string[],
      },
      { merge: true },
    );
    if (staged) {
      tx.delete(staged.ref);
    }
  });

  logger.info('Created user doc', { uid: user.uid, email, hadStagedRecord: !!staged });
});
