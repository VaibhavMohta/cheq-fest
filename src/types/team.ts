/** Color slot picked when an admin creates a team. Maps to one of the 4
 *  CSS-var accents. Stored on the team doc as `color`. */
export const COLOR_SLOTS = ['accent', 'accent-2', 'accent-3', 'accent-4'] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];

/** CSS variable for a given color slot (or a legacy demo team id). */
export function colorVarFor(slot: ColorSlot | string | null | undefined): string {
  switch (slot) {
    case 'accent':
      return 'var(--accent)';
    case 'accent-2':
      return 'var(--accent-2)';
    case 'accent-3':
      return 'var(--accent-3)';
    case 'accent-4':
      return 'var(--accent-4)';
    // Legacy fallbacks for the original hardcoded demo team IDs.
    case 'tridents':
      return 'var(--accent)';
    case 'phantoms':
      return 'var(--accent-3)';
    case 'blazers':
      return 'var(--accent-2)';
    case 'voltron':
      return 'var(--accent-4)';
    default:
      return 'var(--ink-mute)';
  }
}

/** Human label for a legacy demo team id, falling back to a Title-cased
 *  version of the id itself. Use this when you have a string teamId but no
 *  full TeamDoc handy (e.g. the demo screens). For real teams, prefer
 *  `team.name` from the TeamDoc directly. */
export function teamLabelFor(teamId: string | null | undefined): string {
  if (!teamId) return '';
  if (teamId in TEAM_LABEL) return TEAM_LABEL[teamId]!;
  return teamId.charAt(0).toUpperCase() + teamId.slice(1);
}

/** First two letters of the team name, uppercased. */
export function flagInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// ─── Legacy hardcoded demo teams ─────────────────────────────────────────
// Kept so the existing /arena, /lineup, /team-mgmt, /dev/components demo
// screens keep rendering without live data. New teams (created via the
// admin Teams tab) use admin-chosen names and color slots stored on the
// TeamDoc and do not appear in these maps.

export const TEAM_IDS = ['tridents', 'phantoms', 'blazers', 'voltron'] as const;
/** TeamId is just a string now — admins can create any slug. The TEAM_IDS
 *  array above is a legacy default list used by demo screens. */
export type TeamId = string;

export const TEAM_COLOR_VAR: Record<string, string> = {
  tridents: 'var(--accent)',
  phantoms: 'var(--accent-3)',
  blazers: 'var(--accent-2)',
  voltron: 'var(--accent-4)',
};

export const TEAM_LABEL: Record<string, string> = {
  tridents: 'Tridents',
  phantoms: 'Phantoms',
  blazers: 'Blazers',
  voltron: 'Voltron',
};
