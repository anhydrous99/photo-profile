# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** Let the photos speak for themselves — a clean, distraction-free experience where the photography is the focus
**Current focus:** Milestone v1.1 — Phase 12 (Lightbox Polish) in progress

## Current Position

Phase: 12 of 14 (Lightbox Polish)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-06 — Completed 12-02-PLAN.md

Progress: ██████████████████░░░░░░░░░░░░ v1.1 (5/8 plans)

## Performance Metrics

**v1.0 Velocity:**

- Total plans completed: 29
- Average duration: 3 min
- Total execution time: 99 min
- Timeline: 12 days (2026-01-24 -> 2026-02-05)

**v1.1 Velocity:**

- Total plans completed: 5
- Plans estimated: 8
- Average duration: 2 min
- Total execution time: 13 min

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- ExifData interface defined in domain layer (domain/entities/Photo.ts) for Clean Architecture purity
- EXIF stored as JSON TEXT column, not individual columns -- flexible for future field additions
- exif-reader used for parsing (Sharp maintainer recommended, ships TypeScript types)
- Privacy fields (GPS, serial numbers, software) never accessed from parsed EXIF object
- ExifPanel always in DOM with CSS translate-y toggle for smooth bidirectional animation
- Camera field combines make+model, deduplicating when model includes make prefix
- Panel persists open state across photo navigation (exifOpen independent of index)
- Info icon placed before close button in YARL toolbar using toolbar.buttons prop
- Used --require dotenv/config for standalone CLI scripts to solve ESM hoisting issue
- Store empty JSON ({}) for photos with no EXIF data to ensure true backfill idempotency
- Use sharp().rotate().metadata() for post-rotation dimensions (handles portrait EXIF orientation)
- Width/height nullable to gracefully handle existing photos without dimensions
- Migration added to initializeDatabase() for automatic schema evolution (Phase 12 pattern)
- Zoom plugin before Fullscreen in YARL plugins array (Zoom needs pointer event priority for pan)
- srcSet only included when width/height available (graceful fallback for legacy photos)
- maxZoomPixelRatio: 1 prevents zooming beyond native resolution
- EXIF panel hidden when zoomed in via derived effectiveExifVisible state

### Pending Todos

None.

### Blockers/Concerns

- Docker not installed on development machine — Redis service not tested (docker-compose.yml created and ready)
- coverPhotoId FK constraint is NO ACTION instead of SET NULL — scheduled for fix in Phase 13
- findByAlbumId() missing ORDER BY sortOrder — scheduled for fix in Phase 13

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 12-02-PLAN.md
Resume file: None
