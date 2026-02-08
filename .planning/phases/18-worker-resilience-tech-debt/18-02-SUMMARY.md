---
phase: 18-worker-resilience-tech-debt
plan: 02
subsystem: ui
tags: [admin, dashboard, status-filter, reprocess, bullmq, next.js]

# Dependency graph
requires:
  - phase: 18-worker-resilience-tech-debt
    provides: findStaleProcessing repo method, findOriginalFile storage helper, imageQueue/enqueueImageProcessing
provides:
  - POST /api/admin/photos/[id]/reprocess endpoint for re-enqueuing stuck/failed photos
  - Status filter dropdown on admin dashboard (all/processing/ready/error)
  - Visual stale-photo notification bar with reprocess controls
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [status-filter-dropdown, stale-notification-bar, reprocess-api]

key-files:
  created:
    - src/app/api/admin/photos/[id]/reprocess/route.ts
  modified:
    - src/app/admin/(protected)/page.tsx
    - src/app/admin/(protected)/AdminDashboardClient.tsx

key-decisions:
  - "Block reprocessing of ready photos (400 error) -- only error/processing allowed"
  - "Remove old BullMQ job before re-enqueue to prevent job ID collision"
  - "Separate notification bar for stale/error photos rather than inline per-card buttons"

patterns-established:
  - "Reprocess pattern: remove old BullMQ job, reset status, re-enqueue with timeout wrapper"
  - "Server-to-client stale ID passing: server queries findStaleProcessing, passes ID array to client component"

# Metrics
duration: 6min
completed: 2026-02-08
---

# Phase 18 Plan 02: Admin Stuck Photos UI Summary

**Status filter dropdown, stale-photo notification bar, and reprocess API endpoint for admin discovery and recovery of stuck/failed photos**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-08T06:05:05Z
- **Completed:** 2026-02-08T06:12:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created POST /api/admin/photos/[id]/reprocess endpoint with auth validation, status guard, old job removal, and re-enqueue
- Added status filter dropdown to admin dashboard with all/processing/ready/error options and dynamic count
- Added yellow notification bar that flags stale photos (>30 min processing) and error photos with "Reprocess All" button
- Server component queries findStaleProcessing(30min) and passes stale photo IDs to client for visual flagging

## Task Commits

Each task was committed atomically:

1. **Task 1: Create reprocess API endpoint** - `511b509` (feat)
2. **Task 2: Add status filter and reprocess controls to admin dashboard** - `e9e5dfe` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/app/api/admin/photos/[id]/reprocess/route.ts` - POST endpoint for reprocessing photos: auth check, status guard, original file discovery, old job removal, re-enqueue with timeout
- `src/app/admin/(protected)/page.tsx` - Added findStaleProcessing query and stalePhotoIds prop passing to client
- `src/app/admin/(protected)/AdminDashboardClient.tsx` - Status filter dropdown, stale/error notification bar, reprocess button with loading state

## Decisions Made

- Block reprocessing of "ready" photos with 400 error to prevent unnecessary re-enqueue
- Remove old BullMQ job before re-enqueue to prevent job ID collision (consistent with research pitfall from 18-01)
- Used separate notification bar approach rather than inline per-card reprocess buttons, keeping PhotoGrid component unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three plans in Phase 18 are now complete
- Worker resilience (18-01), admin stuck photos UI (18-02), and tech debt cleanup (18-03) are all delivered
- Phase 19 can proceed with full worker resilience and admin recovery workflow in place

## Self-Check: PASSED

- All 3 files verified on disk (reprocess/route.ts, page.tsx, AdminDashboardClient.tsx)
- Commit 511b509 verified in git log (Task 1)
- Commit e9e5dfe verified in git log (Task 2)
- reprocess/route.ts contains enqueueImageProcessing and verifySession
- page.tsx contains findStaleProcessing call
- AdminDashboardClient.tsx contains statusFilter state and fetch reprocess call

---

_Phase: 18-worker-resilience-tech-debt_
_Completed: 2026-02-08_
