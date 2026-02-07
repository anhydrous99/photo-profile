---
phase: 16-error-boundaries-api-hardening
plan: 01
subsystem: ui
tags: [error-boundary, loading-state, not-found, next.js, react, ux]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: App Router layout structure and Tailwind design tokens
provides:
  - Root error boundary (ERR-01) with retry and home navigation
  - Global error boundary (ERR-02) with self-contained html/body
  - Album detail error boundary (ERR-03) with contextual messaging
  - Admin error boundary (ERR-04) without stack trace exposure
  - Styled 404 page (ERR-05) with gallery navigation
  - Loading skeletons and spinners for all route segments (ERR-06)
affects: [16-02, 16-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error boundary pattern: use client + {error, reset} props + useEffect logging + styled UI with retry button"
    - "Global error pattern: self-contained html/body with inline styles and dark mode media query"
    - "Loading skeleton pattern: animate-pulse boxes matching page grid layout"
    - "Admin loading pattern: animate-spin spinner (utilitarian)"

key-files:
  created:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/not-found.tsx
    - src/app/loading.tsx
    - src/app/albums/[id]/error.tsx
    - src/app/albums/[id]/loading.tsx
    - src/app/admin/(protected)/error.tsx
    - src/app/admin/(protected)/loading.tsx
  modified: []

key-decisions:
  - "D-16-01-01: global-error.tsx uses inline styles (not Tailwind) since it replaces root layout and CSS may not be available"
  - "D-16-01-02: Admin loading uses spinner (animate-spin) rather than skeleton grid to match utilitarian admin aesthetic"

patterns-established:
  - "Error boundary: always log to console.error, never expose error.message in rendered UI"
  - "Error boundary: two-button pattern (retry + contextual navigation)"
  - "Loading state: skeleton grid matching target page layout dimensions"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 16 Plan 01: Error Boundaries and Loading States Summary

**8 error boundary, 404, and loading files covering ERR-01 through ERR-06 -- every route segment has styled error recovery and loading indicators using project design tokens**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T23:48:15Z
- **Completed:** 2026-02-07T23:52:05Z
- **Tasks:** 2
- **Files created:** 8

## Accomplishments

- Every public and admin route segment catches rendering errors with a styled retry + navigation UI instead of white screen
- Root layout errors caught by global-error.tsx with self-contained html/body (no dependency on framework CSS)
- Styled 404 page with link back to gallery replaces raw framework 404
- Loading skeletons prevent blank flash during route navigation (photo grids for gallery, spinner for admin)
- No error.message or stack traces exposed to end users in any error boundary

## Task Commits

Each task was committed atomically:

1. **Task 1: Create root error boundaries and 404 page** - `905a53c` (feat)
2. **Task 2: Create segment-level error boundaries and loading states** - `9865976` (feat)

## Files Created

- `src/app/error.tsx` - Root error boundary with retry button and home navigation (ERR-01)
- `src/app/global-error.tsx` - Global error fallback with own html/body tags and dark mode support (ERR-02)
- `src/app/not-found.tsx` - Styled 404 page with "Back to gallery" link (ERR-05)
- `src/app/loading.tsx` - Root loading skeleton with 8-cell photo grid (ERR-06)
- `src/app/albums/[id]/error.tsx` - Album detail error boundary with "Failed to load album" message (ERR-03)
- `src/app/albums/[id]/loading.tsx` - Album detail loading skeleton with title placeholder and 6-cell grid (ERR-06)
- `src/app/admin/(protected)/error.tsx` - Admin error boundary without stack trace exposure (ERR-04)
- `src/app/admin/(protected)/loading.tsx` - Admin loading spinner (ERR-06)

## Decisions Made

- **D-16-01-01:** global-error.tsx uses inline styles instead of Tailwind classes because it replaces the root layout entirely, so CSS imports may not be available. Uses hardcoded colors matching the design tokens with a prefers-color-scheme media query for dark mode.
- **D-16-01-02:** Admin loading uses a spinner (animate-spin) rather than a skeleton grid to match the utilitarian admin panel aesthetic and differentiate from the public gallery experience.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added eslint-disable for anchor tag in global-error.tsx**

- **Found during:** Task 1 (Root error boundaries)
- **Issue:** ESLint @next/next/no-html-link-for-pages rule flagged the `<a href="/">` in global-error.tsx, but `<Link>` from next/link cannot be used because global-error.tsx replaces the root layout and Next.js router context is unavailable
- **Fix:** Added inline eslint-disable-next-line comment with explanatory reason
- **Files modified:** src/app/global-error.tsx
- **Verification:** `npm run lint` passes with 0 errors
- **Committed in:** 905a53c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for lint compliance. No scope creep.

## Issues Encountered

- Pre-existing TypeScript error in `src/infrastructure/__tests__/mocks.smoke.test.ts` (cookies() returns Promise in Next.js 16 but test accesses .get synchronously). Unrelated to this plan's files. `npm run typecheck` fails due to this pre-existing issue, but build succeeds.
- lint-staged had trouble with parenthesized path `(protected)` during commit, required retry but ultimately committed successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All error surfaces covered (ERR-01 through ERR-06)
- Ready for 16-02 (API hardening) and 16-03 (additional error handling improvements)
- Build succeeds with all new files recognized by Next.js router

---

_Phase: 16-error-boundaries-api-hardening_
_Completed: 2026-02-07_

## Self-Check: PASSED

All 8 created files verified present. Both task commits (905a53c, 9865976) verified in git log. SUMMARY.md exists at expected path.
