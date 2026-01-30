# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** Let the photos speak for themselves — a clean, distraction-free experience where the photography is the focus
**Current focus:** Phase 4 - Photo Upload (in progress)

## Current Position

Phase: 4 of 10 (Photo Upload)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-01-30 - Completed 04-01-PLAN.md

Progress: [########..] 38%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: 2 min
- Total execution time: 22 min

**By Phase:**

| Phase             | Plans | Total | Avg/Plan |
| ----------------- | ----- | ----- | -------- |
| 01-foundation     | 3     | 8 min | 2.7 min  |
| 02-image-pipeline | 4     | 6 min | 1.5 min  |
| 03-admin-auth     | 3     | 6 min | 2.0 min  |
| 04-photo-upload   | 1     | 2 min | 2.0 min  |

**Recent Trend:**

- Last 5 plans: 02-04 (1 min), 03-01 (2 min), 03-02 (2 min), 03-03 (2 min), 04-01 (2 min)
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

### Pending Todos

None yet.

### Blockers/Concerns

- Docker not installed on development machine - Redis service not tested (docker-compose.yml created and ready)

## Session Continuity

Last session: 2026-01-30T06:44:21Z
Stopped at: Completed 04-01-PLAN.md
Resume file: None
