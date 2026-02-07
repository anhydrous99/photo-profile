# [COMPLETED — Plan generated at .sisyphus/plans/dark-mode.md]

# Draft: Day/Night Mode (System Preferences)

## Requirements (confirmed)

- Dark/light mode based on system preferences (prefers-color-scheme)

## Current State (from research)

- **Tailwind v4** with `@tailwindcss/postcss`, no `tailwind.config.js` — all config in `globals.css` via `@theme inline`
- CSS variables already exist: `--background` (#ffffff/#0a0a0a) and `--foreground` (#171717/#ededed) with `@media (prefers-color-scheme: dark)` — BUT components don't use them
- **Zero `dark:` prefixes** in the entire codebase — clean slate
- **126+ hardcoded Tailwind color classes** across 19 components + 6 admin pages + 3 public pages
- 1 hardcoded RGB value (PhotoLightbox: `rgb(0, 0, 0)`)
- Modal backdrops use `bg-black/50` (hardcoded)
- Status badges use hardcoded color objects in components
- ExifPanel has intentionally dark gradient overlay (lightbox context)

## Technical Decisions

- **Approach**: System preferences only (`prefers-color-scheme` media query). No manual toggle, no state management, no localStorage.
- **Strategy**: Semantic CSS variables. Define tokens in globals.css with light/dark values. Components reference via Tailwind theme.
- **Scope**: Both public gallery AND admin panel get dark mode treatment.
- **Dark palette**: Softer dark gray (#1e1e1e or similar) — less harsh, "dark UI" feel rather than pure black.
- **Testing**: Set up test infrastructure (TDD). Need to pick a framework.

## Test Strategy Decision

- **Infrastructure exists**: NO
- **Automated tests**: YES (TDD)
- **Framework**: Vitest
- **Agent-Executed QA**: ALWAYS (Playwright visual checks in both color schemes)

## Scope Boundaries

- INCLUDE: All 19 components, all admin pages, all public pages, globals.css theme system, lightbox/modal fixes
- EXCLUDE: Manual toggle button, theme context/provider, localStorage persistence
