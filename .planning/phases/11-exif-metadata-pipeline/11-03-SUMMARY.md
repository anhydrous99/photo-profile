---
phase: 11-exif-metadata-pipeline
plan: 03
subsystem: image-processing, database
tags: [exif, sharp, exif-reader, sqlite, cli, backfill, scripts]

# Dependency graph
requires:
  - phase: 11-01
    provides: "ExifData type, exifService with extractExifData, exif_data column on photos table"
provides:
  - CLI backfill script for EXIF metadata on existing photos
  - npm run exif:backfill command
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dotenv/config preload via --require flag for standalone CLI scripts"
    - "Empty JSON marker ({}) for idempotent backfill of nullable columns"

key-files:
  created:
    - scripts/backfill-exif.ts
  modified:
    - package.json

key-decisions:
  - "Used --require dotenv/config instead of inline dotenv import to solve ESM hoisting issue"
  - "Store empty JSON ({}) for photos with no EXIF data to ensure true idempotency"

patterns-established:
  - "Backfill scripts use --require dotenv/config for env loading before module imports"

# Metrics
duration: 2min
completed: 2026-02-06
---

# Phase 11 Plan 03: EXIF Backfill Script Summary

**Idempotent CLI backfill script (`npm run exif:backfill`) that populates EXIF metadata for all existing photos using the same extractExifData service as the upload worker**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-06T03:38:08Z
- **Completed:** 2026-02-06T03:40:56Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `scripts/backfill-exif.ts` that queries photos with null exif_data and extracts EXIF from originals on disk
- Added `npm run exif:backfill` command to package.json
- Script is truly idempotent -- marks photos with no EXIF using empty JSON so they are not re-processed
- Summary output shows processed, skipped, and failed counts
- Missing original files are reported to stderr and counted as failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backfill-exif script and add npm script** - `e9ede36` (feat)

## Files Created/Modified

- `scripts/backfill-exif.ts` - CLI script that backfills EXIF metadata for existing photos
- `package.json` - Added `exif:backfill` npm script

## Decisions Made

- Used `--require dotenv/config` in the npm script command rather than inline dotenv import. ESM module hoisting causes all `import` statements to execute before any top-level code, so inline `config()` calls run after modules that need env vars are already loaded. The `--require` flag loads dotenv before any ESM resolution.
- Photos with no extractable EXIF data get `{}` stored (empty JSON object) instead of remaining null. This ensures the `WHERE exif_data IS NULL` query skips already-checked photos on subsequent runs, making the script truly idempotent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added dotenv/config preload for environment variable loading**

- **Found during:** Task 1 (script creation)
- **Issue:** Script crashed with "Invalid environment variables" because env vars were not loaded. ESM import hoisting means inline dotenv config() calls execute after module imports that need env vars.
- **Fix:** Used `--require dotenv/config` flag in the npm script command to preload environment before any ESM modules resolve.
- **Files modified:** package.json
- **Verification:** `npm run exif:backfill` runs successfully with env vars loaded
- **Committed in:** e9ede36 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed idempotency by storing empty JSON for EXIF-less photos**

- **Found during:** Task 1 (verification)
- **Issue:** Photos with no EXIF data in their original file were skipped without database update, leaving exif_data as NULL. Running the script twice would re-process these photos every time, breaking idempotency.
- **Fix:** Store `{}` (empty JSON) for photos where extractExifData returns null, so the `WHERE exif_data IS NULL` query correctly skips them on subsequent runs.
- **Files modified:** scripts/backfill-exif.ts
- **Verification:** Running `npm run exif:backfill` twice: first run processes photos, second run shows "All photos already have EXIF data."
- **Committed in:** e9ede36 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes essential for correct operation. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EXIF backfill script complete and verified
- Plan 11-02 (EXIF display UI) is the remaining plan in Phase 11
- All EXIF infrastructure (extraction service, DB column, worker integration, backfill script) is in place

## Self-Check: PASSED

---

_Phase: 11-exif-metadata-pipeline_
_Completed: 2026-02-06_
