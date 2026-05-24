/**
 * One-shot bootstrap to grant the Super Admin custom claim.
 *
 * USAGE (from the project root):
 *   1. Download a service-account key:
 *      Firebase Console → Project Settings → Service Accounts →
 *      "Generate new private key" → save as functions/service-account.json
 *      (this file is .gitignore'd via the functions/.gitignore below)
 *
 *   2. Find your UID:
 *      Firebase Console → Authentication → Users → copy the UID of your
 *      @cheq.one account.
 *
 *   3. Run:
 *      cd functions
 *      pnpm tsx scripts/grant-super-admin.ts <uid>
 *
 *   4. Sign out and back in (or call user.getIdToken(true) in the browser
 *      DevTools) to refresh the JWT with the new claim.
 *
 * The script is idempotent — running it again with the same UID is safe.
 * To REVOKE, pass --revoke as the second argument.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const keyPath = resolve(__dirname, '..', 'service-account.json');
let serviceAccount: Record<string, unknown>;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch (err) {
  console.error(`Could not read ${keyPath}.`);
  console.error('Download a service-account key from Firebase Console first.');
  console.error('(See instructions at the top of this file.)');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount as never) });

const uid = process.argv[2];
const revoke = process.argv[3] === '--revoke';

if (!uid) {
  console.error('Usage: pnpm tsx scripts/grant-super-admin.ts <uid> [--revoke]');
  process.exit(1);
}

async function main() {
  const auth = getAuth();
  const user = await auth.getUser(uid!);
  if (!user.email?.endsWith('@cheq.one')) {
    console.error(`Refusing: ${user.email} is not a @cheq.one address.`);
    process.exit(2);
  }
  const existing = user.customClaims ?? {};
  const next = revoke
    ? { ...existing, superAdmin: false, admin: false }
    : { ...existing, superAdmin: true, admin: true };
  await auth.setCustomUserClaims(uid!, next);
  console.log(`${revoke ? 'Revoked' : 'Granted'} super-admin for ${user.email} (${uid}).`);
  console.log('User must sign out + back in (or getIdToken(true)) to refresh.');
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
