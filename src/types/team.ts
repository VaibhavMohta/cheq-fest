export const TEAM_IDS = ['tridents', 'phantoms', 'blazers', 'voltron'] as const;
export type TeamId = (typeof TEAM_IDS)[number];

export const TEAM_COLOR_VAR: Record<TeamId, string> = {
  tridents: 'var(--accent)',
  phantoms: 'var(--accent-3)',
  blazers: 'var(--accent-2)',
  voltron: 'var(--accent-4)',
};

export const TEAM_LABEL: Record<TeamId, string> = {
  tridents: 'Tridents',
  phantoms: 'Phantoms',
  blazers: 'Blazers',
  voltron: 'Voltron',
};
