---
phase: 18-worker-resilience-tech-debt
plan: 01
subsystem: infra
tags: [bullmq, worker, sqlite, drizzle, resilience]

# Dependency graph
requires:
  - phase: 05-image-processing
    provides: BullMQ worker and image processing pipeline
provides:
  - Resilient worker with in-processor DB status updates (covered by BullMQ retry)
  - retryDbUpdate helper for failed handler DB updates
  - findByStatus repository method for status-based photo filtering
  - findStaleProcessing repository method for detecting stuck photos
  - findOriginalFile storage helper for reprocessing path discovery
affects: [18-02-admin-ui-stuck-photos, 18-03-tech-debt-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [in-processor-db-update, retry-wrapper, stale-detection-query]

key-files:
  created: []
  modified:
    - src/infrastructure/jobs/workers/imageProcessor.ts
    - src/domain/repositories/PhotoRepository.ts
    - src/infrastructure/database/repositories/SQLitePhotoRepository.ts
    - src/infrastructure/storage/fileStorage.ts
    - src/infrastructure/storage/index.ts

key-decisions:
  - "DB status update to 'ready' moved inside processor function for BullMQ retry coverage"
  - "Completed event handler reduced to logging-only (no DB access)"
  - "Failed handler uses retryDbUpdate wrapper with 3 attempts and exponential backoff"

patterns-established:
  - "retryDbUpdate pattern: wrap event handler DB updates in retry loop since BullMQ retry does not cover event handlers"
  - "findStaleProcessing uses createdAt threshold (not updatedAt) since processing photos may not have been updated yet"

# Metrics
duration: 2min
completed: 2026-02-08
---

# Phase 18 Plan 01: Worker Resilience Summary

**BullMQ worker DB updates moved into processor function with retry coverage, plus findByStatus/findStaleProcessing repo methods and findOriginalFile storage helper for admin reprocessing UI**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-08T05:57:13Z
- **Completed:** 2026-02-08T05:59:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Moved photo status="ready" DB update inside the BullMQ processor function so it is covered by BullMQ's 3-attempt automatic retry mechanism
- Reduced completed event handler to logging-only, eliminating the race condition where both processor and event handler could update status
- Added retryDbUpdate wrapper around the failed handler's status="error" DB update with 3 attempts and exponential backoff
- Added findByStatus and findStaleProcessing methods to PhotoRepository interface and SQLitePhotoRepository implementation
- Added findOriginalFile helper to discover original file paths for reprocessing

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor imageProcessor to move DB updates into processor function** - `805ab2d` (feat)
2. **Task 2: Add findByStatus, findStaleProcessing repo methods and findOriginalFile helper** - `b8fb252` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `src/infrastructure/jobs/workers/imageProcessor.ts` - Moved DB status update into processor, added retryDbUpdate helper, simplified event handlers
- `src/domain/repositories/PhotoRepository.ts` - Added findByStatus and findStaleProcessing interface methods
- `src/infrastructure/database/repositories/SQLitePhotoRepository.ts` - Implemented findByStatus (Drizzle eq filter) and findStaleProcessing (and/eq/lt with time threshold)
- `src/infrastructure/storage/fileStorage.ts` - Added findOriginalFile function for discovering original file paths by photoId
- `src/infrastructure/storage/index.ts` - Added findOriginalFile to barrel export

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- findByStatus and findStaleProcessing are ready for Plan 18-02's admin UI (status filter dropdown and stale detection)
- findOriginalFile is ready for Plan 18-02's reprocess API endpoint
- Worker resilience is in place; photos should no longer get permanently stuck in "processing" status

## Self-Check: PASSED

- All 5 modified files exist on disk
- Commits 805ab2d and b8fb252 verified in git log
- imageProcessor.ts contains repository.save (2 occurrences: processor + failed handler)
- imageProcessor.ts contains retryDbUpdate (3 occurrences: definition + usage + log)
- PhotoRepository.ts contains findByStatus and findStaleProcessing interface methods
- SQLitePhotoRepository.ts implements findByStatus and findStaleProcessing
- fileStorage.ts exports findOriginalFile
- storage/index.ts re-exports findOriginalFile

---

_Phase: 18-worker-resilience-tech-debt_
_Completed: 2026-02-08_
