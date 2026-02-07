---
phase: 13-album-management
plan: 01
subsystem: database-infrastructure
tags: [sqlite, drizzle, api, migration, foreign-key]
dependency-graph:
  requires: []
  provides:
    - "Fixed coverPhotoId FK constraint (ON DELETE SET NULL)"
    - "findByAlbumId returns photos ordered by sortOrder ASC"
    - "addToAlbum assigns next sortOrder (MAX + 1)"
    - "updatePhotoSortOrders repository method"
    - "POST /api/admin/albums/[id]/photos/reorder endpoint"
  affects:
    - "13-02 (admin album detail page uses reorder API and ordered photo queries)"
tech-stack:
  added: []
  patterns:
    - "SQLite table recreation migration for FK constraint changes"
    - "PRAGMA foreign_keys = ON for FK enforcement"
key-files:
  created:
    - src/app/api/admin/albums/[id]/photos/reorder/route.ts
  modified:
    - src/infrastructure/database/client.ts
    - src/domain/repositories/PhotoRepository.ts
    - src/infrastructure/database/repositories/SQLitePhotoRepository.ts
decisions:
  - id: "13-01-a"
    decision: "Use SQLite table recreation for FK constraint fix (ALTER CONSTRAINT not supported)"
    reason: "SQLite standard migration approach per official docs"
  - id: "13-01-b"
    decision: "Enable PRAGMA foreign_keys = ON in initializeDatabase()"
    reason: "FK constraints are meaningless without enforcement; better-sqlite3 defaults to OFF"
  - id: "13-01-c"
    decision: "addToAlbum uses MAX(sort_order) + 1 for new photo position"
    reason: "New photos should appear at end of album, not overwrite position 0"
metrics:
  duration: "3 min"
  completed: "2026-02-06"
---

# Phase 13 Plan 01: Album Data Layer Fixes Summary

Fixed three infrastructure bugs in the album/photo data layer and added the photo reorder API endpoint needed for the admin album detail page.

## What Was Done

### Task 1: Fix Infrastructure Bugs (FK constraint, ORDER BY, sortOrder)

**Commit:** `b04b8f8`

Three fixes applied:

1. **coverPhotoId FK constraint** -- Added migration in `initializeDatabase()` that recreates the `albums` table with `ON DELETE SET NULL` on `cover_photo_id`. Uses `PRAGMA foreign_key_list(albums)` to detect if migration is needed, then does the standard SQLite table recreation dance (rename, create new, copy data, drop old). Includes the `tags` column that was added after initial table creation.

2. **findByAlbumId ORDER BY** -- Added `.orderBy(photoAlbums.sortOrder)` to the Drizzle query chain. Photos in an album now return sorted by sort_order ascending.

3. **addToAlbum sortOrder** -- Changed from hardcoded `sortOrder: 0` to computing `MAX(sort_order) + 1` for the target album. New photos now appear at the end of the album rather than conflicting with position 0.

4. **Foreign key enforcement** -- Added `sqlite.pragma("foreign_keys = ON")` at the end of `initializeDatabase()` to enable FK constraint enforcement going forward.

### Task 2: Add updatePhotoSortOrders Repository Method and Reorder API

**Commit:** `933a9a3`

1. **Domain interface** -- Added `updatePhotoSortOrders(albumId: string, photoIds: string[]): Promise<void>` to `PhotoRepository` interface.

2. **SQLite implementation** -- Implemented using `db.transaction()` with a loop that sets `sortOrder = i` for each `photoIds[i]` within the given album. Follows the exact pattern from `SQLiteAlbumRepository.updateSortOrders()`.

3. **API endpoint** -- Created `POST /api/admin/albums/[id]/photos/reorder` with auth check via `verifySession()`, Zod validation of `{ photoIds: string[] }` body, and call to `photoRepository.updatePhotoSortOrders()`. Follows established album reorder API pattern exactly.

## Task Commits

| Task | Name                     | Commit    | Key Files                                                      |
| ---- | ------------------------ | --------- | -------------------------------------------------------------- |
| 1    | Fix infrastructure bugs  | `b04b8f8` | client.ts, SQLitePhotoRepository.ts                            |
| 2    | Add reorder method + API | `933a9a3` | PhotoRepository.ts, SQLitePhotoRepository.ts, reorder/route.ts |

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **SQLite table recreation for FK fix** -- Standard approach since SQLite does not support `ALTER TABLE ... ALTER CONSTRAINT`.
2. **PRAGMA foreign_keys = ON** -- Enabled at end of init to enforce all FK constraints going forward.
3. **MAX(sort_order) + 1 for addToAlbum** -- New photos appear at end of album, not at position 0.

## Verification Results

- `npm run typecheck` -- clean (no errors)
- `npm run lint` -- clean (0 errors, 2 pre-existing warnings in unrelated files)
- `npm run build` -- succeeds, FK migration ran during build, new route `/api/admin/albums/[id]/photos/reorder` appears in route list

## Next Phase Readiness

Plan 13-02 (Admin Album Detail Page) can proceed. All prerequisites delivered:

- `findByAlbumId()` returns photos in correct sort order
- `updatePhotoSortOrders()` method available for persisting drag-drop reorder
- `POST /api/admin/albums/[id]/photos/reorder` endpoint ready for client-side calls
- `addToAlbum()` properly assigns sort position for newly added photos

## Self-Check: PASSED
