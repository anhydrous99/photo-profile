# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** Let the photos speak for themselves — a clean, distraction-free experience where the photography is the focus
**Current focus:** Phase 9 - Homepage (in progress)

## Current Position

Phase: 9 of 10 (Homepage)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-02 - Completed 09-01-PLAN.md

Progress: [############################] 83%

## Performance Metrics

**Velocity:**

- Total plans completed: 25
- Average duration: 4 min
- Total execution time: 87 min

**By Phase:**

| Phase               | Plans | Total  | Avg/Plan |
| ------------------- | ----- | ------ | -------- |
| 01-foundation       | 3     | 8 min  | 2.7 min  |
| 02-image-pipeline   | 4     | 6 min  | 1.5 min  |
| 03-admin-auth       | 3     | 6 min  | 2.0 min  |
| 04-photo-upload     | 3     | 36 min | 12.0 min |
| 05-photo-management | 4     | 11 min | 2.8 min  |
| 06-album-management | 2     | 7 min  | 3.5 min  |
| 07-public-gallery   | 3     | 4 min  | 1.3 min  |
| 08-lightbox         | 2     | 5 min  | 2.5 min  |
| 09-homepage         | 1     | 4 min  | 4.0 min  |

**Recent Trend:**

- Last 5 plans: 07-02 (2 min), 07-03 (1 min), 08-01 (3 min), 08-02 (2 min), 09-01 (4 min)
- Trend: Stable

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Kept @/\* path alias alongside layer-specific aliases for backwards compatibility
- Used .gitkeep files to track empty directories in git
- Used Zod 4 with safeParse for fail-fast environment validation
- Stored timestamps as integer milliseconds with mode: 'timestamp_ms'
- Domain layer exports types only (no runtime code dependencies)
- Used onConflictDoUpdate for upsert behavior in repository save methods
- Used eslint directly instead of next lint for lint command
- Added eslint-config-prettier to disable conflicting rules
- Used exponential backoff with 2s base delay for job retries
- Set jobId to photo-{photoId} to prevent duplicate jobs
- Used lanczos3 kernel for high-quality image downscaling
- WebP quality 82, AVIF quality 80 for compression/quality balance
- Worker concurrency 2 for memory management with 50MP images
- Disabled sharp cache for long-running worker process
- Used tsx for worker TypeScript execution
- Used jose for JWT (zero-dependency, universal ESM, Edge-compatible)
- Used bcrypt cost factor 10 for password hashing
- Rate limiter uses existing Redis via rate-limiter-flexible
- DAL pattern with React cache() for deduplicated session verification
- proxy.ts only checks cookie existence, not JWT validity (lightweight for Edge)
- Two-layer protection: proxy.ts (exists) -> layout (valid)
- Unauthenticated /admin/\* returns 404 to hide admin existence
- Used crypto.randomUUID() for photo IDs (native, no external package)
- Validate MIME type before saving (JPEG, PNG, WebP, HEIC)
- File saved as original.{ext} in storage/originals/{photoId}/ directory
- XHR instead of fetch for upload progress events (fetch lacks upload.onprogress)
- Sequential upload processing for simpler state management
- Track upload progress via React useState (no external state library)
- Use rm with recursive+force to gracefully handle missing directories
- Delete files before database record for data integrity
- DELETE uses request body for albumId (keeps route structure simple)
- onConflictDoNothing for idempotent album assignment
- Auto-save on blur trigger (not every keystroke) for description editing
- Optimistic updates for album toggling with rollback on error
- PhotoGrid backwards compatible with optional selectable prop
- Promise.all for parallel batch API requests
- Client wrapper pattern for server/client component split
- Tags stored as comma-separated TEXT (not JSON) for simplicity
- coverPhotoId FK uses SET NULL on delete to prevent broken references
- Delete mode passed in request body for album deletion (album-only vs cascade)
- useSortable hook per album card for individual drag handles with dnd-kit
- Optimistic reorder with immediate visual feedback and API sync
- Radio buttons for delete mode selection in album delete modal
- Used YARL (yet-another-react-lightbox) for lightbox implementation
- Dynamic import with ssr: false for client-only YARL library
- Solid black background (rgb(0,0,0)) for lightbox per phase decision
- X-button-only close behavior (no click-outside, no swipe-down)
- Use 600w image size for lightbox display (sufficient quality, faster loading)
- SQL RANDOM() with GROUP BY for random photo selection (deduplicates photos in multiple albums)
- 1200w for hero images, 600w for grid images
- force-dynamic for fresh random selection on each request

### Pending Todos

None yet.

### Blockers/Concerns

- Docker not installed on development machine - Redis service not tested (docker-compose.yml created and ready)
- Schema migration workflow needs improvement - executor added tags column to schema.ts but didn't update database, causing runtime error. Fixed manually with `ALTER TABLE`. Consider using drizzle-kit generate/migrate instead of push for production.
- coverPhotoId FK constraint is NO ACTION instead of SET NULL (schema.ts defines SET NULL but existing DB has NO ACTION). Non-blocking but should be fixed in future migration.

## Session Continuity

Last session: 2026-02-02T03:10:52Z
Stopped at: Completed 09-01-PLAN.md
Resume file: None
