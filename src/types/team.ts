/** Expanded team color palette. Each entry is identified by its hex string,
 *  which is what gets stored on the team doc as `color`. The four brand
 *  accents are the first four entries; the rest are standard sports-jersey
 *  colors so the AI has a believable space to match jerseys from.
 *
 *  Note: `team.color` is now stored as a HEX STRING (e.g. "#ff4a1c"), not a
 *  slot enum. `colorVarFor()` accepts either a hex, a legacy accent slot,
 *  or a legacy demo team id and returns the appropriate CSS value.
 */
export type TeamColor = {
  /** Stored value (hex with leading #). */
  hex: string;
  /** Short human label. */
  label: string;
};

export const TEAM_PALETTE: TeamColor[] = [
  // Brand accents (kept first so they map 1:1 to the 4 CSS-var slots).
  { hex: '#ff4a1c', label: 'Lava' },
  { hex: '#e8ff4a', label: 'Lime' },
  { hex: '#4ad4ff', label: 'Cyan' },
  { hex: '#ff4ad0', label: 'Pink' },
  // Standard sports-jersey colors.
  { hex: '#e63946', label: 'Red' },
  { hex: '#1d4ed8', label: 'Royal Blue' },
  { hex: '#16a34a', label: 'Green' },
  { hex: '#facc15', label: 'Yellow' },
  { hex: '#7c3aed', label: 'Purple' },
  { hex: '#0f766e', label: 'Teal' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#0ea5e9', label: 'Sky' },
  { hex: '#a16207', label: 'Maroon' },
  { hex: '#f5f1e8', label: 'White' },
] as const;

/** All palette hex values, exported for the AI server prompt + validation. */
export const TEAM_PALETTE_HEXES = TEAM_PALETTE.map((c) => c.hex);

/** Legacy slot type — still referenced by older components. New code should
 *  treat `team.color` as a free-form hex string. */
export const COLOR_SLOTS = ['accent', 'accent-2', 'accent-3', 'accent-4'] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];

/** CSS variable / hex for a stored team color. Accepts a hex ("#rrggbb"),
 *  a legacy accent slot ("accent"|...), or a legacy demo team id. */
export function colorVarFor(value: string | null | undefined): string {
  if (!value) return 'var(--ink-mute)';
  // Hex passes through as-is.
  if (value.startsWith('#')) return value;
  switch (value) {
    case 'accent':
      return 'var(--accent)';
    case 'accent-2':
      return 'var(--accent-2)';
    case 'accent-3':
      return 'var(--accent-3)';
    case 'accent-4':
      return 'var(--accent-4)';
    // Legacy demo team ids.
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

/** Human label for a stored team color (hex or legacy slot). */
export function colorLabelFor(value: string | null | undefined): string {
  if (!value) return '—';
  const found = TEAM_PALETTE.find((c) => c.hex.toLowerCase() === value.toLowerCase());
  if (found) return found.label;
  switch (value) {
    case 'accent':
      return 'Lava';
    case 'accent-2':
      return 'Lime';
    case 'accent-3':
      return 'Cyan';
    case 'accent-4':
      return 'Pink';
    default:
      return value;
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
