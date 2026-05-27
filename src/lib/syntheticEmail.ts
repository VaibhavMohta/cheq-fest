/**
 * Synthetic-email helpers — let admins manually add players who don't
 * have an email address yet. We mint a deterministic-ish identifier in
 * the `@no-email.local` namespace so the rest of the system (which is
 * email-keyed end-to-end: team.members, captain refs, staged docs) keeps
 * working without any schema changes.
 *
 * Rules:
 *   - Synthetic emails can never become a real auth user — no one owns
 *     the `@no-email.local` domain. The on-create function's domain
 *     check (`@cheq.one`) gates that anyway.
 *   - Synthetic-email players can be team members and captains (those
 *     are email-keyed and don't need a uid).
 *   - They can NOT be promoted to admin (no uid means no custom claim).
 *
 * Detection: `isSyntheticEmail(value)`. Display: callers should use
 * `displayEmail(value)` which returns "No email" for synthetic ids.
 */

const SUFFIX = '@no-email.local';

export function isSyntheticEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.toLowerCase().endsWith(SUFFIX);
}

/** What to show the admin in place of a synthetic email — never expose
 *  the `@no-email.local` plumbing in the UI. */
export function displayEmail(value: string | null | undefined): string {
  if (!value) return 'No email';
  if (isSyntheticEmail(value)) return 'No email';
  return value;
}

/** Mint a synthetic identifier for a manual-add row with no email. The
 *  slug + timestamp keeps it unique even if the admin types the same
 *  name twice and avoids accidental collisions with real addresses. */
export function makeSyntheticEmail(displayName: string): string {
  const slug = displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24) || 'player';
  // 36^6 ≈ 2.1B — collisions effectively impossible at our scale.
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug}-${rand}${SUFFIX}`;
}
