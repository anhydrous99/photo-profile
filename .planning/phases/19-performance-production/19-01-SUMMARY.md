---
phase: 19-performance-production
plan: 01
subsystem: infra
tags: [bundle-analyzer, lighthouse, performance, webpack, next.js]

# Dependency graph
requires: []
provides:
  - Bundle analyzer configuration (ANALYZE=true npm run build --webpack)
  - npm run analyze script
  - Baseline bundle composition document with chunk sizes
  - Lighthouse measurement script for reproducible baselines
  - Lighthouse baseline template with Core Web Vitals targets
affects: [19-performance-production]

# Tech tracking
tech-stack:
  added: ["@next/bundle-analyzer"]
  patterns:
    [
      "ANALYZE=true env toggle for bundle analysis",
      "--webpack flag for Next.js 16 compatibility",
    ]

key-files:
  created:
    - ".planning/baselines/bundle-analysis.md"
    - ".planning/baselines/lighthouse.md"
    - "scripts/measure-performance.sh"
  modified:
    - "next.config.ts"
    - "package.json"

key-decisions:
  - "D-19-01-01: Use --webpack flag for bundle analyzer (Turbopack incompatible with @next/bundle-analyzer)"
  - "D-19-01-02: Lighthouse baselines as template (requires running server with data, not automatable in CI without setup)"

patterns-established:
  - "Bundle analysis via ANALYZE=true next build --webpack"
  - "Performance measurement scripts in scripts/ directory"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 19 Plan 01: Performance Baselines Summary

**Bundle analyzer configured with @next/bundle-analyzer, baseline recorded at 1007KB raw / 312KB gzipped shared JS, with dnd-kit (107KB) and lightbox (45KB) identified as optimization targets**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T06:47:30Z
- **Completed:** 2026-02-08T06:52:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Configured @next/bundle-analyzer with env-toggled activation and webpack mode compatibility
- Recorded baseline bundle composition identifying 13 shared chunks totaling 1007KB raw
- Identified two primary optimization targets: @dnd-kit/sortable (107KB, admin-only) and yet-another-react-lightbox (45KB, gallery-only)
- Created reproducible Lighthouse measurement script for Core Web Vitals baselining

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure @next/bundle-analyzer and run baseline analysis** - `403da46` (feat)
2. **Task 2: Measure Lighthouse baselines for public pages** - `828b0cc` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `next.config.ts` - Added bundleAnalyzer import and wrapper around existing NextConfig
- `package.json` - Added "analyze" script and @next/bundle-analyzer dev dependency
- `.planning/baselines/bundle-analysis.md` - Baseline bundle composition with chunk-by-chunk breakdown
- `.planning/baselines/lighthouse.md` - Template for recording Lighthouse Core Web Vitals scores
- `scripts/measure-performance.sh` - Executable script to run Lighthouse against public pages

## Decisions Made

- **D-19-01-01:** Used `--webpack` flag for the analyze script because Next.js 16 defaults to Turbopack, which is incompatible with @next/bundle-analyzer. The webpack build is only used for analysis; production builds continue using Turbopack.
- **D-19-01-02:** Lighthouse baselines left as a template rather than populated. Running Lighthouse requires a production server with actual photo data in the database, which is not available during plan execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added --webpack flag to analyze script**

- **Found during:** Task 1 (bundle analyzer configuration)
- **Issue:** Next.js 16 defaults to Turbopack which is incompatible with @next/bundle-analyzer; no report was generated
- **Fix:** Added `--webpack` flag to the `analyze` npm script: `ANALYZE=true next build --webpack`
- **Files modified:** package.json
- **Verification:** `npm run analyze` produces `.next/analyze/client.html`, `.next/analyze/nodejs.html`, `.next/analyze/edge.html`
- **Committed in:** 403da46 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for Next.js 16 Turbopack default. No scope creep.

## Issues Encountered

None beyond the Turbopack compatibility issue documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Bundle analysis infrastructure ready for Plan 19-03 (targeted optimizations)
- Lighthouse measurement script ready; user should run it once with actual data to populate baseline values
- Optimization targets identified: dnd-kit and lightbox dynamic imports as primary candidates

---

_Phase: 19-performance-production_
_Completed: 2026-02-08_
