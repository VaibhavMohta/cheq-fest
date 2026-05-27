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
  // Neutrals — added so common kit colors (grey, black, navy, silver) are
  // representable as the dominant team color without forcing the AI to
  // misclassify them as something else.
  { hex: '#9ca3af', label: 'Silver' },
  { hex: '#4b5563', label: 'Charcoal' },
  { hex: '#1f2937', label: 'Slate' },
  { hex: '#0b0b0b', label: 'Black' },
  { hex: '#0c1a3a', label: 'Navy' },
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
  // Legacy 4-slot enum names (early teams stored these instead of hex).
  switch (value) {
    case 'accent':
      return 'var(--accent)';
    case 'accent-2':
      return 'var(--accent-2)';
    case 'accent-3':
      return 'var(--accent-3)';
    case 'accent-4':
      return 'var(--accent-4)';
    default:
      // Anything else (raw team id, missing data) → neutral mute. Never
      // return a fabricated team color for an unknown id.
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

/** Last-ditch label for a team id when no real team name is available
 *  (e.g. an orphaned match doc pointing at a deleted team). Returns the
 *  raw id verbatim — deliberately *not* prettified, so the admin sees the
 *  ghost rather than a fabricated name. Real screens should resolve
 *  `team.name` from the Firestore doc and pass it down explicitly. */
export function teamLabelFor(teamId: string | null | undefined): string {
  if (!teamId) return '';
  return teamId;
}

/**
 * Whether a stored team color reads as "light" — high enough luminance
 * that a dark background should sit behind text painted in this color.
 * Returns true for unknown / legacy values so the default (dark) page
 * surface still applies. Uses Rec. 709 luminance on the raw RGB.
 */
export function isLightTeamColor(value: string | null | undefined): boolean {
  if (!value || !value.startsWith('#')) return true;
  const hex = value.replace('#', '');
  if (hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return true;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55;
}

/**
 * Pick a box-background that contrasts with the team color so the team's
 * boundary, name, and logo (all painted in the team color) stay legible.
 *
 * - Light team color (white, lime, yellow, …) → the app's default dark
 *   card surface, lightly tinted with the team color. Dark page baseline
 *   means the bright team-color text + logo already pop.
 * - Dark team color (black, navy, slate, maroon, …) → an off-white
 *   surface (the same `--ink` we use for body text), tinted with the
 *   team color. Stands out from the rest of the dark UI deliberately —
 *   that's the point: the dark-on-white card is what makes the dark
 *   team identity readable.
 */
export function teamSurfaceFor(value: string | null | undefined): string {
  const teamColor = colorVarFor(value);
  if (isLightTeamColor(value)) {
    return `color-mix(in oklab, ${teamColor} 6%, var(--bg-card))`;
  }
  return `color-mix(in oklab, ${teamColor} 22%, var(--ink))`;
}

/**
 * Companion to {@link teamSurfaceFor}. Returns a same-toned but slightly
 * darker/lighter gradient endpoint so heroes that want a colour shift
 * (TeamDetail, TeamMgmt) still get one without losing contrast.
 */
export function teamSurfaceGradient(value: string | null | undefined): string {
  const teamColor = colorVarFor(value);
  if (isLightTeamColor(value)) {
    // Dark base, brighter team-coloured tail. Existing aesthetic.
    return `linear-gradient(135deg, ${teamColor}, #0f0e0c)`;
  }
  // Dark team: light card with a stronger team-tinted band. Keeps the
  // dynamic gradient feel without collapsing into a single dark hue.
  return `linear-gradient(135deg, color-mix(in oklab, ${teamColor} 35%, var(--ink)) 0%, color-mix(in oklab, ${teamColor} 12%, var(--ink)) 100%)`;
}

/** First two letters of the team name, uppercased. */
export function flagInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** TeamId is just a string — admin picks the slug at team creation. */
export type TeamId = string;
