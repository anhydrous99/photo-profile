---
phase: 11-exif-metadata-pipeline
plan: 01
subsystem: database, image-processing
tags: [exif, sharp, exif-reader, sqlite, drizzle, bullmq, metadata]

# Dependency graph
requires:
  - phase: 04-image-pipeline
    provides: Sharp image processing worker, imageService, BullMQ queue
  - phase: 03-database-schema
    provides: SQLite photos table, Drizzle schema, repository pattern
provides:
  - ExifData domain type with 11 nullable fields
  - exifService for EXIF extraction and privacy sanitization
  - exif_data column on photos table via idempotent ALTER TABLE migration
  - Worker integration that auto-extracts EXIF on upload
affects: [11-02 (EXIF display in lightbox), 11-03 (EXIF backfill script)]

# Tech tracking
tech-stack:
  added: [exif-reader]
  patterns:
    [
      EXIF extraction via sharp+exif-reader,
      JSON column for structured metadata,
      EXIF numeric code mapping tables,
    ]

key-files:
  created:
    - src/infrastructure/services/exifService.ts
  modified:
    - src/domain/entities/Photo.ts
    - src/infrastructure/database/schema.ts
    - src/infrastructure/database/client.ts
    - src/infrastructure/database/repositories/SQLitePhotoRepository.ts
    - src/infrastructure/jobs/workers/imageProcessor.ts
    - src/infrastructure/jobs/queues.ts
    - src/app/api/admin/upload/route.ts
    - package.json

key-decisions:
  - "ExifData interface defined in domain layer (domain/entities/Photo.ts) for Clean Architecture purity"
  - "EXIF stored as JSON TEXT column, not individual columns -- flexible for future field additions"
  - "exif-reader used for parsing (Sharp maintainer recommended, ships TypeScript types)"
  - "Privacy fields (GPS, serial numbers, software) never accessed from parsed object"

patterns-established:
  - "EXIF numeric code mapping: const Record<number, string> maps for metering, white balance, flash"
  - "Shutter speed formatting: ExposureTime decimal to photographer-friendly string (1/250, 30s)"
  - "JSON column pattern: serialize on write (JSON.stringify), deserialize on read (JSON.parse) in repository"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 11 Plan 01: EXIF Extraction and Storage Summary

**EXIF metadata extraction via sharp+exif-reader with privacy sanitization, JSON storage in SQLite, and automatic worker integration on upload**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T03:30:45Z
- **Completed:** 2026-02-06T03:34:04Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- ExifData domain type with 11 nullable fields (cameraMake, cameraModel, lens, focalLength, aperture, shutterSpeed, iso, dateTaken, whiteBalance, meteringMode, flash)
- exifService that extracts EXIF via sharp metadata buffer + exif-reader, maps numeric codes to human-readable labels, and enforces privacy exclusions (GPS, serial, software never accessed)
- Idempotent schema migration adds exif_data TEXT column via PRAGMA table_info check + ALTER TABLE
- Image processing worker automatically extracts and persists EXIF data for every new upload

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ExifData type, exifService, and install exif-reader** - `1074d17` (feat)
2. **Task 2: Schema migration, repository mapping, and worker integration** - `5bc5738` (feat)

## Files Created/Modified

- `src/domain/entities/Photo.ts` - Added ExifData interface (11 fields) and exifData field on Photo
- `src/infrastructure/services/exifService.ts` - NEW: EXIF extraction + privacy sanitization with mapping tables
- `src/infrastructure/database/schema.ts` - Added exifData TEXT column to photos table definition
- `src/infrastructure/database/client.ts` - Added idempotent ALTER TABLE migration for exif_data column
- `src/infrastructure/database/repositories/SQLitePhotoRepository.ts` - JSON parse/stringify for exifData in toDomain/toDatabase
- `src/infrastructure/jobs/queues.ts` - Added exifData to ImageJobResult interface
- `src/infrastructure/jobs/workers/imageProcessor.ts` - Integrated extractExifData call and exifData persistence
- `src/app/api/admin/upload/route.ts` - Added exifData: null to new Photo creation
- `package.json` - Added exif-reader dependency

## Decisions Made

- **ExifData in domain layer:** Defined ExifData interface in `domain/entities/Photo.ts` rather than infrastructure, keeping the domain layer clean and allowing any infrastructure service to produce it.
- **JSON TEXT column:** Stored EXIF as serialized JSON in a single column rather than 11 individual columns. More flexible for future field additions and avoids schema bloat.
- **exif-reader library:** Used exif-reader (recommended by Sharp's maintainer, ships TypeScript types) over alternatives like exifr or exif-parser.
- **Privacy by design:** GPS, serial number, and software tags are never accessed from the parsed EXIF object -- not read, not stored.
- **Type assertions for Make/Model:** exif-reader's types use `Record<string, GenericTag> &` intersection which widens specific string fields; used explicit `as string | undefined` casts for `Make` and `Model` properties.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added exifData: null to upload route Photo creation**

- **Found during:** Task 1 (typecheck revealed missing field)
- **Issue:** After adding `exifData` to the Photo interface, the upload route's Photo literal was missing the new required field, causing TS2741
- **Fix:** Added `exifData: null` to the Photo object literal in `src/app/api/admin/upload/route.ts`
- **Files modified:** src/app/api/admin/upload/route.ts
- **Verification:** `npm run typecheck` passes
- **Committed in:** 1074d17 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary type safety fix. No scope creep.

## Issues Encountered

- exif-reader's TypeScript types use `Record<string, GenericTag> & { Make: string; ... }` intersection, which causes TypeScript to widen `Make` and `Model` to `GenericTag` (union including number, Buffer). Resolved with targeted type assertions since these fields are always strings per EXIF standard.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EXIF extraction and storage pipeline fully wired for new uploads
- Plan 02 (EXIF display in lightbox) can read exifData from Photo objects passed to components
- Plan 03 (backfill script) can use extractExifData and the repository to backfill existing photos
- No blockers

## Self-Check: PASSED

---

_Phase: 11-exif-metadata-pipeline_
_Completed: 2026-02-06_
