---
phase: 09-homepage
plan: 01
subsystem: public-gallery
tags: [homepage, random-photos, hero-grid, lightbox, server-component]

dependencies:
  requires: [08-lightbox]
  provides: [homepage-gallery, random-photo-query, header-navigation]
  affects: [10-polish]

tech-stack:
  added: []
  patterns:
    - "SQL RANDOM() for random selection"
    - "force-dynamic for fresh data on each request"
    - "hero + grid layout pattern"

files:
  created:
    - src/presentation/components/Header.tsx
    - src/presentation/components/HomepageClient.tsx
  modified:
    - src/domain/repositories/PhotoRepository.ts
    - src/infrastructure/database/repositories/SQLitePhotoRepository.ts
    - src/app/page.tsx

decisions:
  - id: random-query-pattern
    choice: "SQL RANDOM() with GROUP BY for deduplication"
    reason: "Efficient random selection at database level, prevents duplicates when photo is in multiple albums"
  - id: hero-aspect-ratio
    choice: "3:2 aspect ratio for hero image"
    reason: "Standard photography aspect ratio, provides visual balance"
  - id: image-sizes
    choice: "1200w for hero, 600w for grid"
    reason: "Hero needs larger size for quality, grid images are smaller so 600w sufficient"

metrics:
  duration: 4 min
  completed: 2026-02-02
---

# Phase 9 Plan 1: Homepage Gallery Summary

**Random photos from published albums with hero+grid layout and lightbox integration.**

## What Was Built

### Repository Layer

Added `findRandomFromPublishedAlbums(limit: number)` method to PhotoRepository interface and SQLitePhotoRepository implementation. Query joins photos -> photoAlbums -> albums, filters by status="ready" and isPublished=true, groups by photo ID to deduplicate, and orders by SQL `RANDOM()`.

### Presentation Layer

**Header Component:**

- Minimal navigation with "Portfolio" logo linking to home
- "Albums" link to /albums
- Clean styling: px-6 py-4, gray-900 logo, gray-600 nav

**HomepageClient Component:**

- Hero photo (first in array) with 3:2 aspect ratio using 1200w image
- Grid of remaining photos (2-col mobile, 3-col desktop) using 600w images
- Dynamic import of PhotoLightbox with ssr: false
- Lightbox state management for opening/closing and index tracking
- Clean design: no borders, shadows, or hover effects
- Focus rings for accessibility

### Page Layer

Replaced Next.js boilerplate homepage with Server Component that:

- Uses `export const dynamic = "force-dynamic"` for fresh random selection
- Fetches 8 random photos from published albums
- Shows empty state when no published photos exist
- Renders Header + HomepageClient with photo data

## Commits

| Task | Commit  | Description                         |
| ---- | ------- | ----------------------------------- |
| 1    | f1adca5 | Add random photo repository method  |
| 2    | d2d2484 | Create Header and HomepageClient    |
| 3    | 39cbec8 | Replace homepage with photo gallery |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Status

- [x] Build passes without errors
- [x] Homepage marked as dynamic (force-dynamic)
- [x] Header component renders with navigation
- [x] Random photo query uses SQL RANDOM()
- [x] Photo data flows from server to client component

## Next Phase Readiness

Homepage is ready for polish phase. Key integration points:

- Header component can be enhanced with additional navigation
- HomepageClient pattern can be reused for other gallery views
- Random query can be extended with more filtering options
