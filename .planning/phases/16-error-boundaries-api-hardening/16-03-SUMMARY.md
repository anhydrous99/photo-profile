---
phase: 16-error-boundaries-api-hardening
plan: 03
subsystem: api, ui
tags: [json-parse, error-handling, upload, react-dropzone, file-validation]

# Dependency graph
requires:
  - phase: 04-admin-crud
    provides: Upload page with DropZone and UploadQueue components
  - phase: 05-image-pipeline
    provides: SQLitePhotoRepository with toDomain() and exifData parsing
provides:
  - Safe JSON.parse wrapper in SQLitePhotoRepository (ERR-07)
  - Client-side 25MB upload limit matching server-side limit
  - File rejection notifications with toast-style auto-dismiss
  - Partial batch upload support (valid files upload, rejected files notified)
affects: [upload-ux, photo-repository, error-handling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "safeParseExifJson pattern for defensive JSON.parse in repositories"
    - "Toast-style rejection notifications with auto-dismiss timer"

key-files:
  created: []
  modified:
    - src/infrastructure/database/repositories/SQLitePhotoRepository.ts
    - src/presentation/components/DropZone.tsx
    - src/app/admin/(protected)/upload/page.tsx

key-decisions:
  - "Used ExifData type (not Record<string, unknown>) for safeParseExifJson return type to maintain type safety"
  - "Used standard Tailwind red color classes (red-50/200/700/800/950) for rejection notification instead of semantic status tokens (which may not exist in theme)"
  - "8-second auto-dismiss timer with clearTimeout on new rejections to prevent stale notifications"

patterns-established:
  - "Safe JSON.parse: Always wrap repository JSON.parse in try/catch returning null"
  - "Upload rejection UX: Show dismissible notification between DropZone and UploadQueue"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 16 Plan 03: Data Resilience and Upload UX Summary

**Safe JSON.parse wrapper in photo repository (ERR-07), 25MB client-side upload limit matching server, and dismissible file rejection notifications with partial batch support**

## Performance

- **Duration:** 2 min 55 sec
- **Started:** 2026-02-07T23:50:09Z
- **Completed:** 2026-02-07T23:53:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Wrapped JSON.parse in SQLitePhotoRepository toDomain() with try/catch so corrupt exifData returns null instead of crashing page renders (ERR-07)
- Aligned DropZone default maxSize from 100MB to 25MB matching the server-side upload limit
- Added file rejection notification UI to upload page showing filename and reason, with 8-second auto-dismiss
- Partial batch uploads work correctly: valid files in a mixed drop still upload while rejected files show notification

## Task Commits

Each task was committed atomically:

1. **Task 1: Safe JSON.parse in toDomain()** - `8dab82c` (fix)
2. **Task 2: DropZone 25MB limit and upload rejection handling** - `196582f` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified

- `src/infrastructure/database/repositories/SQLitePhotoRepository.ts` - Added safeParseExifJson() helper with try/catch, imported ExifData type, updated toDomain() to use safe parser
- `src/presentation/components/DropZone.tsx` - Changed default maxSize from 100MB to 25MB, updated help text
- `src/app/admin/(protected)/upload/page.tsx` - Added FileRejection import, rejection state, handleFilesRejected callback with human-readable messages, dismissible notification UI between DropZone and UploadQueue

## Decisions Made

- **ExifData return type over Record<string, unknown>:** The plan suggested `Record<string, unknown>` for safeParseExifJson but TypeScript rejected it since the Photo entity expects `ExifData | null`. Used `ExifData` for proper type safety.
- **Tailwind red utility classes for rejection UI:** Used standard red color scale (red-50/200/700/800/950 with dark mode variants) rather than semantic status tokens from the plan, since those tokens may not exist in the Tailwind theme.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed return type of safeParseExifJson**

- **Found during:** Task 1 (Safe JSON.parse in toDomain())
- **Issue:** Plan specified `Record<string, unknown> | null` return type, but TypeScript rejected assignment to `ExifData | null` in toDomain()
- **Fix:** Changed return type to `ExifData | null` and added `ExifData` to imports
- **Files modified:** src/infrastructure/database/repositories/SQLitePhotoRepository.ts
- **Verification:** `npm run typecheck` passes (no new errors)
- **Committed in:** 8dab82c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type-level fix necessary for compilation. No scope creep.

## Issues Encountered

- Pre-commit lint-staged hook reverted partial edits when adding an unused import (ExifData) before the usage site existed. Resolved by writing the complete file with all changes in a single write operation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ERR-07 (corrupt JSON.parse) is resolved
- Upload UX decisions (oversized file toast, partial batch upload) are implemented
- All 3 files from the plan are modified and verified
- Build succeeds, lint passes, typecheck clean (pre-existing mocks.smoke.test.ts error only)

## Self-Check: PASSED

- All 4 files verified (3 source + 1 SUMMARY)
- Both task commits verified (8dab82c, 196582f)

---

_Phase: 16-error-boundaries-api-hardening_
_Completed: 2026-02-07_
