import clsx from 'clsx';

export const ADMIN_TABS = ['Event', 'Players', 'Teams', 'Sports', 'Matches', 'Rulebook'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

type Props = {
  current: AdminTab;
  onChange: (tab: AdminTab) => void;
};

export function AdminTabs({ current, onChange }: Props) {
  return (
    <div
      role="tablist"
      className="mx-5 mt-1 mb-4 flex gap-1 overflow-x-auto rounded-full border border-line bg-bg-card p-1"
    >
      {ADMIN_TABS.map((tab) => {
        const active = tab === current;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab)}
            className={clsx(
              'shrink-0 rounded-full px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition',
              active ? 'bg-accent text-bg' : 'text-ink-dim hover:text-ink',
            )}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
