---
phase: 12
plan: 01
subsystem: data-model
tags: [sharp, image-dimensions, schema-migration, data-flow]
depends_on:
  requires: [11] # EXIF pipeline established Photo entity pattern
  provides:
    [
      width/height fields in Photo entity and DB,
      dimension extraction in worker,
      data flow to lightbox,
    ]
  affects: [12-02, 12-03] # Lightbox responsive images and backfill script will use these fields
tech-stack:
  added: []
  patterns: [sharp-rotate-metadata-for-post-rotation-dimensions]
key-files:
  created: []
  modified:
    - src/domain/entities/Photo.ts
    - src/infrastructure/database/schema.ts
    - src/infrastructure/database/client.ts
    - src/infrastructure/database/repositories/SQLitePhotoRepository.ts
    - src/infrastructure/jobs/queues.ts
    - src/infrastructure/jobs/workers/imageProcessor.ts
    - src/app/api/admin/upload/route.ts
    - src/app/page.tsx
    - src/app/albums/[id]/page.tsx
    - src/presentation/components/HomepageClient.tsx
    - src/presentation/components/AlbumGalleryClient.tsx
    - src/presentation/components/PhotoLightbox.tsx
key-decisions:
  - Use sharp().rotate().metadata() for post-rotation dimensions (handles portrait EXIF orientation)
  - Width/height nullable to gracefully handle existing photos without dimensions
  - Migration added to initializeDatabase() for automatic schema evolution
duration: 3 min
completed: 2026-02-06
---

# Phase 12 Plan 01: Image Dimensions Data Model Summary

**One-liner:** Added width/height nullable integer fields across full data pipeline (entity, schema, repository, worker, server pages, client components) for YARL responsive image support.

## Performance

- **Duration:** ~3 minutes
- **Tasks:** 2/2 completed
- **Deviations:** 1 (auto-fix blocking issue in upload route)

## Accomplishments

1. Extended Photo entity with `width: number | null` and `height: number | null` fields
2. Added `width INTEGER` and `height INTEGER` columns to photos table schema
3. Applied ALTER TABLE migration to existing database (columns now exist)
4. Added idempotent migration to `initializeDatabase()` for automatic schema evolution
5. Updated repository toDomain/toDatabase mappings for width/height
6. Added width/height to ImageJobResult interface
7. Worker now extracts post-rotation dimensions via `sharp(path).rotate().metadata()` and stores them on job completion
8. Width/height flow from server pages through HomepageClient, AlbumGalleryClient, to PhotoLightbox

## Task Commits

| Task | Name                                                         | Commit    | Key Changes                                                                                             |
| ---- | ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------- |
| 1    | Add width/height to domain, schema, repository, and worker   | `4ebb18b` | Photo.ts, schema.ts, client.ts, SQLitePhotoRepository.ts, queues.ts, imageProcessor.ts, upload/route.ts |
| 2    | Pass width/height through server pages and client components | `a6a50ba` | page.tsx (home), page.tsx (album), HomepageClient.tsx, AlbumGalleryClient.tsx, PhotoLightbox.tsx        |

## Files Modified

- `src/domain/entities/Photo.ts` -- Added width/height fields to Photo interface
- `src/infrastructure/database/schema.ts` -- Added width/height integer columns
- `src/infrastructure/database/client.ts` -- Added Phase 12 migration in initializeDatabase()
- `src/infrastructure/database/repositories/SQLitePhotoRepository.ts` -- Map width/height in toDomain/toDatabase
- `src/infrastructure/jobs/queues.ts` -- Added width/height to ImageJobResult
- `src/infrastructure/jobs/workers/imageProcessor.ts` -- Extract post-rotation dimensions, store on completion
- `src/app/api/admin/upload/route.ts` -- Include null width/height in new photo creation
- `src/app/page.tsx` -- Pass width/height to HomepageClient
- `src/app/albums/[id]/page.tsx` -- Pass width/height to AlbumGalleryClient
- `src/presentation/components/HomepageClient.tsx` -- Added width/height to PhotoData interface
- `src/presentation/components/AlbumGalleryClient.tsx` -- Added width/height to PhotoData interface
- `src/presentation/components/PhotoLightbox.tsx` -- Added width/height to PhotoData interface

## Decisions Made

| Decision                                         | Rationale                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Use `sharp().rotate().metadata()` for dimensions | Handles EXIF orientation correctly -- portrait photos report accurate post-rotation width/height |
| Nullable width/height                            | Existing photos have NULL; Plan 02 backfill will populate them                                   |
| Migration in initializeDatabase()                | Follows Phase 11 pattern for idempotent schema evolution                                         |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Upload route missing width/height fields**

- **Found during:** Task 1
- **Issue:** `src/app/api/admin/upload/route.ts` creates a Photo object literal without the new width/height fields, causing TS2739 type error
- **Fix:** Added `width: null` and `height: null` to the photo creation in the upload route
- **Files modified:** `src/app/api/admin/upload/route.ts`
- **Commit:** `4ebb18b`

## Issues Encountered

None beyond the deviation noted above.

## Next Phase Readiness

- Plan 02 can now consume width/height from PhotoData to build YARL responsive slides with srcSet
- Plan 03 (backfill script) will populate width/height for existing photos that currently have NULL
- No blockers for subsequent plans

## Self-Check: PASSED
