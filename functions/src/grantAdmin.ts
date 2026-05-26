/**
 * Grant the `admin` custom claim to a target user, and mirror the value
 * into `users/{uid}.globalRoles` so the client UI (which reads the doc,
 * not just the claim) lights up without waiting for a token refresh.
 *
 * Caller must hold the `superAdmin` claim. Bootstrapping the very first
 * super-admin still happens out-of-band via
 * `functions/scripts/grant-super-admin.ts`.
 */
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

export const grantAdmin = onCall(async (req) => {
  const claims = req.auth?.token as { superAdmin?: boolean } | undefined;
  if (!claims?.superAdmin) {
    throw new HttpsError('permission-denied', 'Super Admin only.');
  }
  const { uid } = (req.data ?? {}) as { uid?: string };
  if (!uid) {
    throw new HttpsError('invalid-argument', '`uid` is required.');
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existing = (user.customClaims ?? {}) as Record<string, unknown>;
  await auth.setCustomUserClaims(uid, { ...existing, admin: true });

  try {
    await getFirestore()
      .collection('users')
      .doc(uid)
      .set(
        {
          globalRoles: FieldValue.arrayUnion('admin'),
        },
        { merge: true },
      );
  } catch (err) {
    logger.warn('grantAdmin: could not mirror admin role on users doc', { err });
  }

  return { ok: true, uid };
});
