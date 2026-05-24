# Kickoff Prompt for Claude Code

Copy-paste this into your first Claude Code session.

---

## First message

I want to build "CHEQ Fest" — a mobile-first PWA for tracking my company's sports fest in real time.

I have three reference files in this directory:

1. `CLAUDE.md` — project context, stack, design system, data model, build order
2. `ARCHITECTURE.md` — deeper architectural decisions and feature specs
3. `prototype/cheq-fest-prototype.html` — a working single-file HTML prototype showing every screen and the visual design

Before you write any code:

1. Read `CLAUDE.md` end-to-end
2. Read `ARCHITECTURE.md` end-to-end
3. Open `prototype/cheq-fest-prototype.html` in a browser tab and scroll through every screen — there's a role switcher at the top-right that lets you preview all roles (Guest / Player / Ref / SCap / GCap / Admin). Match the visual design when you build.

Then propose:
- The exact `package.json` with versions you'll use
- The folder structure under `/src`
- Which step from the "Build Order" section in `CLAUDE.md` you'll tackle first
- Any clarifying questions you have for me

Don't start coding until I confirm the plan.

---

## Notes for your first session

- Be opinionated. If there's a better way than what I've spec'd, push back. The prototype is the visual truth; the architecture is a starting proposal.
- We're using `pnpm`, not `npm` or `yarn`. Use `pnpm dlx` instead of `npx`.
- Use the latest stable versions of React, Vite, Firebase, Tailwind. Don't pin to outdated versions because you remember them.
- TypeScript strict mode on from day one.
- Keep commits small and incremental. Run `pnpm dev` after each meaningful change.

---

## Helpful follow-up prompts

After the plan is approved:

- "Scaffold the Vite project with all dependencies, design tokens as CSS variables, and the Tailwind config. Get `pnpm dev` running cleanly."
- "Now build the shared components: Avatar (with photo priority logic), CaptainBadge, TopBar, TabBar. Show them on a single dev page so I can review."
- "Wire up Firebase auth with Google domain restriction. Build the login screen. Show me both states (signed-out and signed-in) without persisting yet."
- "Implement the Home screen with seed data. Match the prototype pixel-for-pixel — same fonts, colors, spacing, animations."

When you hit a screen that's heavy on interaction (lineup drag-and-drop, referee console), ask Claude Code to outline the component breakdown before building.
