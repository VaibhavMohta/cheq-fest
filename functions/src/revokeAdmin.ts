/**
 * Revoke the `admin` custom claim. Refuses to touch a user that holds
 * `superAdmin` — those are demoted only via the bootstrap script. Caller
 * must hold the `superAdmin` claim.
 */
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

export const revokeAdmin = onCall(async (req) => {
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
  if (existing.superAdmin) {
    throw new HttpsError(
      'failed-precondition',
      'Cannot revoke admin from a Super Admin. Use the bootstrap script.',
    );
  }
  const { admin: _admin, ...rest } = existing;
  await auth.setCustomUserClaims(uid, rest);

  try {
    await getFirestore()
      .collection('users')
      .doc(uid)
      .set(
        {
          globalRoles: FieldValue.arrayRemove('admin'),
        },
        { merge: true },
      );
  } catch (err) {
    logger.warn('revokeAdmin: could not mirror role removal on users doc', { err });
  }

  return { ok: true, uid };
});
