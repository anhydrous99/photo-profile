---
phase: 10-polish
plan: 02
subsystem: ui
tags:
  [
    next-image,
    blur-placeholder,
    lqip,
    fade-transition,
    custom-loader,
    webp,
    standalone,
  ]

# Dependency graph
requires:
  - phase: 10-01
    provides: blurDataUrl field on Photo entity and populated blur placeholders
  - phase: 02-image-pipeline
    provides: Sharp-generated WebP derivatives at [300, 600, 1200, 2400] widths
  - phase: 09-homepage
    provides: Homepage layout with hero + grid photo display
provides:
  - FadeImage component with blur placeholder and ~300ms CSS fade-in transition
  - Custom next/image loader mapping width requests to pre-processed Sharp derivatives
  - Standalone output configuration in next.config.ts for Docker deployment
  - All public pages display blur placeholders while images load
affects: [10-03, deployment, docker]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom image loader: maps next/image width to nearest available derivative (300/600/1200/2400)"
    - "FadeImage pattern: blur placeholder <img> underneath next/image with opacity transition"
    - "Standalone output for Docker via next.config.ts output: standalone"

key-files:
  created:
    - src/lib/imageLoader.ts
    - src/presentation/components/FadeImage.tsx
  modified:
    - next.config.ts
    - src/app/page.tsx
    - src/app/albums/page.tsx
    - src/app/albums/[id]/page.tsx
    - src/presentation/components/HomepageClient.tsx
    - src/presentation/components/AlbumGalleryClient.tsx

key-decisions:
  - "Custom loader skips Next.js image optimization (images already pre-processed by Sharp)"
  - "FadeImage uses CSS opacity transition (not built-in placeholder=blur) for controlled ~300ms fade-in"
  - "preload prop used instead of deprecated priority prop for hero image"
  - "Albums listing keeps direct Image usage (80px thumbnails too small for blur benefit)"
  - "AlbumGalleryClient wraps FadeImage in zoom container to separate hover and fade concerns"
  - "Standalone output added to next.config.ts for Docker readiness"

patterns-established:
  - "FadeImage component: blur <img> with scale-110 blur-lg + next/image with opacity-0 to opacity-100 on load"
  - "Custom loader: AVAILABLE_WIDTHS array, find first >= requested width, fallback to largest"
  - "Server components pass blurDataUrl alongside photo data to client components"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 10 Plan 02: FadeImage Component and Blur Placeholders Summary

**FadeImage component with blur LQIP placeholders, ~300ms CSS fade-in, and custom next/image loader bypassing double-optimization**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-06T01:49:19Z
- **Completed:** 2026-02-06T01:57:14Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Created FadeImage component with blur placeholder background and smooth ~300ms opacity fade-in transition
- Custom image loader maps next/image width requests to pre-processed Sharp derivatives, preventing double-optimization
- All public-facing pages (homepage, album detail, albums listing) updated to use blur placeholders
- next.config.ts configured with custom loader and standalone output for Docker deployment
- Hero image uses preload prop (not deprecated priority) for above-the-fold loading

## Task Commits

Each task was committed atomically:

1. **Task 1: Create custom image loader, FadeImage component, and update next.config** - `9662604` (feat)
2. **Task 2: Update all public pages to pass blurDataUrl and use FadeImage** - `f8a5dd9` (feat)

## Files Created/Modified

- `src/lib/imageLoader.ts` - Custom next/image loader mapping widths to Sharp derivatives (300/600/1200/2400)
- `src/presentation/components/FadeImage.tsx` - Shared image component with blur placeholder and CSS fade-in
- `next.config.ts` - Custom loader config and standalone output for Docker
- `src/app/page.tsx` - Homepage passes blurDataUrl to HomepageClient
- `src/app/albums/[id]/page.tsx` - Album detail passes blurDataUrl to AlbumGalleryClient
- `src/app/albums/page.tsx` - Albums listing uses custom loader URL format
- `src/presentation/components/HomepageClient.tsx` - Uses FadeImage for hero (with preload) and grid photos
- `src/presentation/components/AlbumGalleryClient.tsx` - Uses FadeImage with hover zoom wrapper

## Decisions Made

- Used custom opacity CSS transition instead of next/image built-in `placeholder="blur"` for full control over the ~300ms fade-in timing and blur appearance
- preload prop (Next.js 16) replaces deprecated priority prop for hero image
- Albums listing page (80px thumbnails) keeps direct `<Image>` usage since blur placeholders would be barely visible at that size, but URL format updated for custom loader consistency
- AlbumGalleryClient wraps FadeImage in a separate div with `group-hover:scale-105` to keep hover zoom and fade-in as independent concerns
- Standalone output added to next.config.ts proactively for Docker deployment (Plan 10-03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both tasks compiled and built successfully on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Blur placeholder infrastructure complete end-to-end (generation + storage + display)
- Ready for 10-03 (Docker deployment) with standalone output already configured
- PhotoLightbox intentionally unchanged (YARL manages its own image loading)

## Self-Check: PASSED

---

_Phase: 10-polish_
_Completed: 2026-02-05_
