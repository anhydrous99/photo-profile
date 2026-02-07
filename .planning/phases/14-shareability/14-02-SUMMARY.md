---
phase: 14-shareability
plan: 02
subsystem: ui
tags: [opengraph, meta-tags, deep-links, seo, next-metadata]

# Dependency graph
requires:
  - phase: 14-01
    provides: findBySlugPrefix repository method, initialPhotoSlug prop, replaceState URL sync
provides:
  - Deep link pages for album photos (/albums/[id]/photo/[slug])
  - Deep link pages for homepage photos (/photo/[slug])
  - OpenGraph metadata on all public routes
  - metadataBase in root layout for absolute OG image URLs
affects: [14-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React cache() for deduplicating DB queries between generateMetadata and page component"
    - "generateMetadata with dynamic OG tags from database"
    - "EXIF-enriched OG descriptions for photo deep links"

key-files:
  created:
    - src/app/albums/[id]/photo/[slug]/page.tsx
    - src/app/photo/[slug]/page.tsx
  modified:
    - src/app/layout.tsx
    - src/app/page.tsx
    - src/app/albums/[id]/page.tsx

key-decisions:
  - "WebP 1200w derivative for OG images (AVIF unsupported by social media crawlers)"
  - "React cache() for getAlbum to share data between generateMetadata and page function"
  - "Homepage photo deep link replaces last random photo if not in set (guaranteed lightbox target)"
  - "EXIF data appended to OG description when available (camera, focal length, aperture, shutter, ISO)"

patterns-established:
  - "generateMetadata pattern: cache repo calls, build EXIF-enriched descriptions, use 1200w.webp for OG"
  - "Deep link page pattern: server component renders same client component with initialPhotoSlug prop"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 14 Plan 02: Deep Links and OG Metadata Summary

**Deep link pages for album and homepage photos with OpenGraph metadata and EXIF-enriched descriptions across all public routes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T04:12:15Z
- **Completed:** 2026-02-07T04:14:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Root layout has metadataBase and default OG tags with title template for child pages
- Homepage and album pages have static/dynamic OG metadata with cover photo images
- Two new deep link routes render existing gallery with lightbox pre-opened on specified photo
- Photo deep links include EXIF data in OG description (camera, focal length, aperture, shutter speed, ISO)
- Invalid photo slugs return 404 via notFound()

## Task Commits

Each task was committed atomically:

1. **Task 1: Add metadataBase to root layout and OG metadata to homepage and album pages** - `7c80965` (feat)
2. **Task 2: Create deep link pages for album photos and homepage photos** - `2c35e48` (feat)

## Files Created/Modified

- `src/app/layout.tsx` - metadataBase, title template, default OG/Twitter tags
- `src/app/page.tsx` - Static homepage OG metadata with site name and description
- `src/app/albums/[id]/page.tsx` - generateMetadata with album title, description, cover photo OG image; cached getAlbum
- `src/app/albums/[id]/photo/[slug]/page.tsx` - Album photo deep link with EXIF-enriched OG tags, renders AlbumGalleryClient with initialPhotoSlug
- `src/app/photo/[slug]/page.tsx` - Homepage photo deep link with EXIF-enriched OG tags, renders HomepageClient with initialPhotoSlug

## Decisions Made

- Used WebP 1200w derivative for all OG images since AVIF is not supported by social media crawlers
- Used React `cache()` to deduplicate `getAlbum` calls between `generateMetadata` and page component
- Homepage photo deep link replaces the last random photo in the set if the target photo is not already present, ensuring the lightbox can always open to it
- EXIF data (camera model, focal length, aperture, shutter speed, ISO) appended to OG description when available for richer social media previews

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All deep link routes and OG metadata in place
- Ready for Plan 03 (any remaining shareability features)
- metadataBase ensures all relative OG image URLs resolve to absolute URLs automatically

---

_Phase: 14-shareability_
_Completed: 2026-02-06_

## Self-Check: PASSED
