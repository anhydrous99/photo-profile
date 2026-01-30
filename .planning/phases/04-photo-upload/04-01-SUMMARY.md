---
phase: 04-photo-upload
plan: 01
subsystem: api
tags: [next.js, route-handler, file-upload, multipart-form, bullmq, crypto]

# Dependency graph
requires:
  - phase: 03-admin-auth
    provides: verifySession() DAL for route protection
  - phase: 02-image-pipeline
    provides: BullMQ queue and enqueueImageProcessing() helper
  - phase: 01-foundation
    provides: SQLitePhotoRepository, Photo entity, env config
provides:
  - POST /api/admin/upload endpoint accepting multipart form data
  - saveOriginalFile() utility for writing uploads to storage
  - Full upload-to-processing pipeline integration
affects: [04-02, 04-03, admin-dashboard]

# Tech tracking
tech-stack:
  added: [react-dropzone]
  patterns: [Route Handler multipart parsing, file storage abstraction]

key-files:
  created:
    - src/app/api/admin/upload/route.ts
    - src/infrastructure/storage/fileStorage.ts
    - src/infrastructure/storage/index.ts
  modified:
    - package.json

key-decisions:
  - "Used crypto.randomUUID() for photo IDs (native, no external package)"
  - "Validate MIME type before saving (JPEG, PNG, WebP, HEIC)"
  - "File saved as original.{ext} in storage/originals/{photoId}/ directory"

patterns-established:
  - "Route Handler pattern: auth check -> validation -> action -> response"
  - "Storage utility pattern: abstracted file operations in infrastructure layer"

# Metrics
duration: 2min
completed: 2026-01-30
---

# Phase 04 Plan 01: Upload Infrastructure Summary

**POST /api/admin/upload Route Handler with file storage, auth, database, and BullMQ job queue integration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-30T06:42:18Z
- **Completed:** 2026-01-30T06:44:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Installed react-dropzone for future drag-drop UI component
- Created saveOriginalFile() utility that saves uploads to storage/originals/{photoId}/
- Built full upload pipeline: auth -> validate -> save -> DB record -> enqueue job
- Integrated with existing verifySession(), SQLitePhotoRepository, and enqueueImageProcessing()

## Task Commits

Each task was committed atomically:

1. **Task 1: Install react-dropzone dependency** - `ec47477` (chore)
2. **Task 2: Create file storage utility and upload Route Handler** - `caf3b2e` (feat)

## Files Created/Modified

- `src/app/api/admin/upload/route.ts` - POST endpoint with full upload pipeline
- `src/infrastructure/storage/fileStorage.ts` - saveOriginalFile() writes to storage path
- `src/infrastructure/storage/index.ts` - Barrel export for storage utilities
- `package.json` - Added react-dropzone@14.4.0 dependency

## Decisions Made

- **crypto.randomUUID():** Used native Node.js/browser API instead of uuid package
- **MIME validation:** Restricted to image/jpeg, image/png, image/webp, image/heic before saving
- **File naming:** Saved as `original.{ext}` within photoId subdirectory for organized structure
- **Status flow:** Photo created with status "processing" immediately, worker updates to "ready"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - build and lint passed without modification. Redis connection errors during build are expected (Docker not running - documented blocker in STATE.md).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Upload endpoint ready for frontend integration in 04-02
- Storage infrastructure in place for originals
- Processing pipeline triggers automatically via BullMQ
- No blockers for proceeding to upload form UI

---

_Phase: 04-photo-upload_
_Completed: 2026-01-30_
