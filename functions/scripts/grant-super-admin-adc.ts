/**
 * Same as grant-super-admin.ts, but authenticates via Application
 * Default Credentials (e.g. `gcloud auth application-default login`)
 * instead of a service-account.json file. Use this when you don't have
 * a downloaded key for the target project — handy for one-off prod
 * bootstraps.
 *
 * USAGE:
 *   1. Ensure ADC is set: `gcloud auth application-default login`
 *      (only needed once per machine; persists in ~/.config/gcloud).
 *   2. From functions/:
 *      pnpm tsx scripts/grant-super-admin-adc.ts <projectId> <uid> [--revoke]
 *
 *   Example:
 *      pnpm tsx scripts/grant-super-admin-adc.ts cheq-fest-prod pNA6XZcHjJRHIwa3isw1cGKzJ492
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.argv[2];
const uid = process.argv[3];
const revoke = process.argv[4] === '--revoke';

if (!projectId || !uid) {
  console.error(
    'Usage: pnpm tsx scripts/grant-super-admin-adc.ts <projectId> <uid> [--revoke]',
  );
  process.exit(1);
}

// Keep in sync with src/lib/auth.ts and functions/src/onUserCreate.ts.
const ALLOWED_EMAILS = new Set<string>(['vai.mohta@gmail.com']);

function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  if (normalized.endsWith('@cheq.one')) return true;
  return ALLOWED_EMAILS.has(normalized);
}

initializeApp({ credential: applicationDefault(), projectId });

async function main() {
  const auth = getAuth();
  const user = await auth.getUser(uid!);
  if (!isAllowedEmail(user.email)) {
    console.error(`Refusing: ${user.email} is not on the allow-list.`);
    process.exit(2);
  }
  const existing = user.customClaims ?? {};
  const next = revoke
    ? { ...existing, superAdmin: false, admin: false }
    : { ...existing, superAdmin: true, admin: true };
  await auth.setCustomUserClaims(uid!, next);
  console.log(
    `[${projectId}] ${revoke ? 'Revoked' : 'Granted'} super-admin for ${user.email} (${uid}).`,
  );
  console.log('User must sign out + back in (or getIdToken(true)) to refresh.');
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
