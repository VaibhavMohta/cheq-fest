/**
 * Revoke the `admin` custom claim. A Super Admin caller can revoke the
 * `admin` claim from anyone — including another Super Admin (the
 * `superAdmin` claim itself is preserved; only `admin` is stripped). The
 * `superAdmin` claim is still bootstrap-only.
 *
 * Self-strip guard: a caller cannot strip their OWN admin claim if doing
 * so would leave them unable to perform admin actions. (Super Admins are
 * fine — they have superAdmin separately.)
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

  // Strip only the `admin` claim. Leave `superAdmin` untouched — that
  // claim is bootstrap-managed and stays intact even when stripping admin
  // from a Super Admin user.
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
