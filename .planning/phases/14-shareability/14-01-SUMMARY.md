---
phase: 14
plan: 01
subsystem: shareability
tags: [lightbox, url-sync, replaceState, slug, repository]
dependency-graph:
  requires: [phase-08-lightbox, phase-13-album-management]
  provides:
    [
      findBySlugPrefix-repository-method,
      lightbox-url-sync,
      initialPhotoSlug-prop,
    ]
  affects: [14-02-deep-link-pages, 14-03-opengraph-meta]
tech-stack:
  added: []
  patterns: [replaceState-url-sync, slug-prefix-lookup]
key-files:
  created: []
  modified:
    - src/domain/repositories/PhotoRepository.ts
    - src/infrastructure/database/repositories/SQLitePhotoRepository.ts
    - src/presentation/components/AlbumGalleryClient.tsx
    - src/presentation/components/HomepageClient.tsx
    - .env.example
decisions:
  - id: SHAR-SLUG-8
    summary: "8-character UUID prefix as photo slug for shareable URLs"
  - id: SHAR-REPLACESTATE
    summary: "window.history.replaceState for URL sync (no history entries, no React re-renders)"
  - id: SHAR-INITIALIZER
    summary: "useState initializer functions for deep link landing (avoids flash)"
metrics:
  duration: 2 min
  completed: 2026-02-06
---

# Phase 14 Plan 01: Lightbox URL Sync and Slug Lookup Summary

**One-liner:** replaceState URL sync in lightbox components with 8-char UUID slug prefix lookup via LIKE query

## What Was Done

### Task 1: Add findBySlugPrefix to PhotoRepository and SQLite implementation

- Added `findBySlugPrefix(slug: string): Promise<Photo | null>` to the `PhotoRepository` interface
- Implemented in `SQLitePhotoRepository` using Drizzle's `like` operator: `like(photos.id, \`${slug}%\`)`
- Returns first match via `.limit(1)`, mapped through `toDomain()`
- Added `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to `.env.example` for OpenGraph meta tags in Plan 03

### Task 2: Add URL sync to AlbumGalleryClient and HomepageClient lightboxes

- **AlbumGalleryClient**: Updates browser URL to `/albums/{albumId}/photo/{slug}` on every lightbox slide change via `window.history.replaceState`
- **HomepageClient**: Updates browser URL to `/photo/{slug}` on every lightbox slide change via `window.history.replaceState`
- Both components restore original page URL on lightbox close (`/albums/{id}` and `/` respectively)
- Both accept optional `initialPhotoSlug` prop for deep link landing (used by Plan 02 pages)
- Deep link landing uses `useState` initializer functions to open lightbox at correct index without flash
- Helper `getSlug()` extracts first 8 characters of photo UUID
- No `useRouter` or `usePathname` used -- direct DOM API for zero re-renders

## Decisions Made

| ID                | Decision                                     | Rationale                                                                           |
| ----------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| SHAR-SLUG-8       | 8-character UUID prefix as photo slug        | Negligible collision for personal portfolio; short enough for shareable URLs        |
| SHAR-REPLACESTATE | window.history.replaceState for URL sync     | No history entries added during browsing; no React re-renders unlike router.replace |
| SHAR-INITIALIZER  | useState initializer functions for deep link | Avoids flash: lightbox opens at correct photo on first render, not after effect     |

## Task Commits

| Task | Name                                   | Commit  | Key Changes                                                                         |
| ---- | -------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| 1    | Add findBySlugPrefix repository method | 018fc86 | PhotoRepository interface, SQLitePhotoRepository LIKE query, .env.example           |
| 2    | Add URL sync to lightbox components    | c52e90d | AlbumGalleryClient replaceState, HomepageClient replaceState, initialPhotoSlug prop |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `npm run typecheck`: PASSED (no errors)
- `npm run lint`: PASSED (only pre-existing warnings)
- `npm run build`: PASSED (successful production build)

## Next Phase Readiness

Plan 14-02 (Deep Link Pages) can proceed immediately:

- `findBySlugPrefix` repository method is available for server components
- `initialPhotoSlug` prop is wired into both gallery client components
- URL patterns (`/photo/{slug}` and `/albums/{id}/photo/{slug}`) are established

## Self-Check: PASSED
