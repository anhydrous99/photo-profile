# Learnings - Dark Mode Implementation

## Conventions & Patterns

_Accumulated knowledge about code conventions, patterns, and established practices_

---

## Vitest Setup (Task 5)

### Configuration Approach

- **vitest.config.ts**: Minimal config with TypeScript path aliases matching `tsconfig.json`
- **Environment**: `node` (no DOM needed for CSS text parsing)
- **Globals**: Enabled for `describe`, `it`, `expect` without imports
- **Path aliases**: Replicated from tsconfig.json for consistent module resolution

### Test Structure Pattern

- **CSS parsing**: Read file as text with `readFileSync()`, no DOM or JSDOM needed
- **Regex matching**: Extract `:root` and `@media (prefers-color-scheme: dark)` blocks
- **Token extraction**: Use `match(/--[\w-]+/g)` to find all CSS custom property names
- **Parity validation**: Compare token sets between light and dark themes

### Test Organization

- **CSS Structure**: Validates presence of `:root` and dark media query blocks
- **Light Theme Tokens**: Asserts each expected token exists in `:root`
- **Dark Theme Tokens**: Asserts each expected token exists in dark media query
- **Token Parity**: Ensures every light token has a dark equivalent
- **Token Values**: Validates color values are present (hex, rgb, hsl, or var())

### Expected Token List (from plan)

- **Surface**: `--surface`, `--surface-secondary`, `--surface-hover`, `--surface-inset`
- **Text**: `--text-primary`, `--text-secondary`, `--text-tertiary`
- **Border**: `--border`, `--border-strong`
- **Interactive**: `--accent`, `--accent-hover`, `--accent-surface`, `--accent-text`
- **Status**: `--status-success-bg`, `--status-success-text`, `--status-warning-bg`, `--status-warning-text`, `--status-error-bg`, `--status-error-text`, `--status-error-surface`, `--status-error-surface-text`
- **Misc**: `--ring-offset`, `--button-primary-bg`, `--button-primary-text`
- **Total**: ~20 tokens (currently testing 2 baseline tokens: `--background`, `--foreground`)

### TDD Phase

- **RED**: Tests fail if Task 1 hasn't added tokens yet (expected)
- **GREEN**: Tests pass once tokens are defined in `globals.css`
- **Current state**: All 10 tests pass with baseline tokens; ready for Task 1 to expand token set

### Scripts Added

- `npm test`: Runs `vitest run` (single execution)
- `npm run test:watch`: Runs `vitest` (watch mode for development)

### Key Learnings

1. Vitest doesn't require jsdom/happy-dom for CSS text parsing
2. Regex patterns with `[\s\S]*?` handle multi-line CSS blocks effectively
3. Token extraction via `match(/--[\w-]+/g)` is reliable for CSS custom properties
4. Test structure is extensible: add new tokens to `expectedLightTokens` and `expectedDarkTokens` arrays
5. Comments in test files clarify TDD phases and regex intent (necessary for maintainability)

## [2026-02-07T04:53] Task 0: Baseline Screenshots

### Approach

- Used Playwright directly via Node.js script (scripts/capture-baseline.mjs)
- Dev server running on localhost:3000
- Full-page screenshots with networkidle wait state

### Observations

- Homepage screenshot: 828K (large, likely has images)
- Albums page: 26K (smaller, possibly empty or minimal content)
- Login page: 9.5K (simple form page)

### Pattern Established

- Playwright script pattern works well for screenshot capture
- networkidle wait state ensures pages fully load before capture
- Full-page mode captures entire scrollable content

## [2026-02-07T05:10] Task 2: Public Component Migration - COMPLETE

### Files Migrated (7 total)

1. `src/presentation/components/Header.tsx` — nav links to semantic tokens
2. `src/presentation/components/Breadcrumb.tsx` — breadcrumb text colors
3. `src/presentation/components/HomepageClient.tsx` — focus ring colors + ring-offset fix
4. `src/presentation/components/AlbumGalleryClient.tsx` — text colors + focus ring + ring-offset fix
5. `src/app/page.tsx` — empty state text
6. `src/app/albums/page.tsx` — headings, placeholder, hover states
7. `src/app/photo/[slug]/page.tsx` — empty state text

### Token Mapping Patterns Established

- `text-gray-900` → `text-text-primary` (headings, primary text)
- `text-gray-600` → `text-text-secondary` (body text, descriptions)
- `text-gray-500` → `text-text-secondary` (muted text, empty states)
- `text-gray-400` → `text-text-tertiary` (icons, separators)
- `bg-gray-100` → `bg-surface-secondary` (placeholders, backgrounds)
- `hover:bg-gray-50` → `hover:bg-surface-hover` (interactive hover states)
- `focus:ring-blue-500` → `focus:ring-accent` (focus indicators)
- Added `focus:ring-offset-ring-offset` to all `ring-offset-2` instances (3 locations)

### Verification

- Build: ✅ PASS
- Typecheck: ✅ PASS
- Committed: d7b8df6

### Notes

- FadeImage.tsx had no color classes (clean component)
- albums/[id]/page.tsx and albums/[id]/photo/[slug]/page.tsx had no color classes (use client components)
- Ring-offset fix prevents white gap in dark mode around focused images
