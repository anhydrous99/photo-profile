# Project Research Summary

**Project:** Photo Profile v1.1 Enhancement Milestone
**Domain:** Photography Portfolio (self-hosted)
**Researched:** 2026-02-05
**Confidence:** HIGH

## Executive Summary

The v1.1 milestone adds EXIF metadata, lightbox polish, album management improvements, and social sharing to the existing v1.0 photography portfolio. The good news: **this requires almost zero new dependencies**. The existing stack (YARL for lightbox, @dnd-kit for drag-and-drop, Next.js for metadata) already supports seven of eight features. Only `exifr` (~30KB) is needed for EXIF extraction.

The recommended approach is to build in four waves: (1) EXIF extraction pipeline (touches all layers, requires schema migration), (2) Lightbox enhancements (pure presentation layer), (3) Album management UI (admin interface for existing database columns), and (4) Shareability features (OpenGraph tags and deep links). This ordering mitigates the biggest risks: database migration must come first (v1.0 learned the hard way to use ALTER TABLE, not db:push), and EXIF data must be available before it can be displayed or shared.

Key risks are **privacy** (GPS coordinates in EXIF must never be displayed), **schema drift** (the project has existing FK constraint mismatches and sort order columns that are unused), and **browser compatibility** (fullscreen API doesn't work on iPhone Safari, OG images need JPEG format for crawler compatibility). The research identifies 15 specific pitfalls with codebase-specific warnings based on v1.0 lessons learned.

## Key Findings

### Recommended Stack

**Net new dependencies: 1.** YARL already includes Fullscreen and Zoom plugins. @dnd-kit already handles drag-to-reorder (proven in album reordering). Next.js `generateMetadata` is built-in. The only addition is `exifr` for EXIF extraction.

**Core technologies:**

- **exifr v7.1.3**: Parse EXIF metadata from uploaded photos — fastest option (2.5ms/photo), 497K weekly downloads, zero dependencies, handles selective field extraction. Sharp's `metadata()` returns raw EXIF buffers; exifr parses them.
- **YARL Fullscreen plugin**: Built-in to existing YARL v3.28.0 — uses browser Fullscreen API, auto-hides on unsupported browsers (iPhone Safari).
- **YARL Zoom plugin**: Built-in to YARL — handles pinch-to-zoom, double-tap-to-zoom, mouse wheel zoom. No additional gesture library needed.
- **@dnd-kit rectSortingStrategy**: Already installed, used for album reordering — reuse the exact same pattern for photo reordering within albums, switching from vertical to grid strategy.
- **Next.js generateMetadata**: Framework built-in — dynamic OG tags per page. Point `og:image` to existing 1200w derivatives (already generated and cached).

### Expected Features

**Must have (table stakes):**

- EXIF metadata display — photographers expect to show camera, lens, settings (make, model, lens, focal length, aperture, shutter speed, ISO, date taken). Extract during image processing worker, store as individual typed columns (not JSON blob for queryability).
- Touch gestures in lightbox — horizontal swipe already works (YARL default), enable pull-down-to-close and add Zoom plugin for pinch gestures.
- Album cover selection — infrastructure fully built (schema column, API endpoint), only needs admin UI.
- Photo reordering in albums — `photo_albums.sortOrder` column EXISTS but is never used. Fix `findByAlbumId` to ORDER BY it, then build drag UI.
- Direct photo links — use query param approach (`/albums/abc?photo=xyz`) with `history.replaceState` for navigation (not `pushState`, which pollutes history).
- OpenGraph meta tags — generate dynamically with `generateMetadata`, serve existing 1200w derivatives as `og:image` (add JPEG generation for maximum crawler compatibility).

**Should have (differentiators):**

- Smooth lightbox transitions — already configured at 200ms fade / 300ms swipe. Add responsive `srcSet` to slides (biggest win: loading the right resolution eliminates flashing). Tune easing curves.
- Fullscreen mode — YARL plugin adds toolbar button automatically. Do NOT auto-enter (surprising). Note: iPhone Safari unsupported, design works without it.

**Defer (v2+):**

- Dynamic OG image generation — the actual photo IS the best OG image for a portfolio. Branded text overlays can wait.
- Slideshow auto-play — distracting, photographers want viewers to linger.
- Zoom-from-thumbnail transitions — complex, fragile, not a YARL built-in.

### Architecture Approach

All eight features integrate cleanly into the existing Clean Architecture. Five features are isolated within a single layer (presentation-only: fullscreen, transitions, gestures; admin UI-only: album management). Only EXIF spans all four layers. The codebase already has infrastructure ready: `photo_albums.sortOrder` exists, `albums.coverPhotoId` exists and the PATCH API accepts it, YARL plugins are bundled, @dnd-kit is proven in `SortableAlbumCard`.

**Major components:**

1. **EXIF extraction service** — new `infrastructure/services/exifService.ts`, integrates into existing image processing worker between derivative generation and status update. Extracts metadata from Sharp's raw EXIF buffer using exifr. Stores 8 fields in photos table (camera make/model, lens, focal length, aperture, shutter speed, ISO, date taken). Privacy-safe: GPS coordinates explicitly excluded.
2. **Lightbox enhancement** — modify existing `PhotoLightbox.tsx` to add Fullscreen + Zoom plugins, enable pull-down-to-close gesture, add `srcSet` to slides for responsive images, display EXIF metadata via custom `render.slideFooter`. Pure configuration changes, no new components.
3. **Album management admin page** — new `app/admin/(protected)/albums/[id]/page.tsx` with photo grid. Enables cover selection ("Set as Cover" button) and drag-to-reorder (reuse @dnd-kit pattern from `SortableAlbumCard`, switch to `rectSortingStrategy` for grid). New API endpoint for batch sort order updates.
4. **Direct photo pages + OG metadata** — new route at `albums/[id]/photos/[photoId]/page.tsx` with `generateMetadata` export. Lightbox URL sync with `history.replaceState` on navigation. OG images point to existing 1200w derivatives (add JPEG generation for crawler compatibility).

### Critical Pitfalls

1. **GPS privacy leak** — EXIF extraction returns GPS coordinates that reveal shooting locations. Use a strict allowlist: only extract camera make/model, lens, focal length, aperture, shutter speed, ISO, date taken. Never store or display GPS, serial numbers, software versions.

2. **Schema migration breaking data** — v1.0 Phase 6 lesson: `db:push` caused runtime errors. Always use explicit `ALTER TABLE` migrations for existing databases. Add EXIF columns as nullable. The `initializeDatabase()` CREATE TABLE statements are out of sync with the Drizzle schema (evidence: `albums.tags` exists in schema but not in CREATE TABLE).

3. **Sharp EXIF returns raw buffer** — `sharp(image).metadata()` returns `{ exif: <Buffer> }`, not parsed fields. Requires `exifr` or `exif-reader` for parsing. Extract in the worker (not at upload or display time).

4. **Photo reorder ignored by public pages** — `photo_albums.sortOrder` exists but `findByAlbumId()` does NOT order by it. Admin reorder UI will appear broken until the query adds `.orderBy(photoAlbums.sortOrder)`.

5. **Deep links polluting browser history** — Using `history.pushState` for each photo navigation causes users to press back 15 times to exit the lightbox. Use `history.replaceState` for lightbox navigation, `pushState` only when opening.

6. **FK constraint mismatch** — Drizzle schema says `albums.coverPhotoId` has `onDelete: "set null"` but actual database has `NO ACTION`. Deleting a photo that is an album cover will fail or leave dangling reference. Fix constraint before building cover selection UI.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: EXIF Metadata Pipeline

**Rationale:** Hardest feature, spans all four layers. Requires database migration which must be done first (v1.0 pattern: ALTER TABLE, never db:push). The EXIF data is needed for Phase 2 (display) and Phase 4 (OG tags). Establishing the migration pattern now prevents rework.
**Delivers:** EXIF extraction during worker processing, 8 new typed columns in photos table, extracted metadata available to all consumers.
**Addresses:** EXIF extraction and storage (half of feature 1).
**Avoids:** GPS privacy leak (Pitfall 1), schema migration errors (Pitfall 2), Sharp EXIF buffer confusion (Pitfall 3).
**Dependencies:** Install `exifr`, create migration script, update Drizzle schema, extend Photo entity, modify worker.

### Phase 2: Lightbox Polish

**Rationale:** All changes isolated to `PhotoLightbox.tsx`. Grouped together because they modify the same component. EXIF display (second half of feature 1) depends on Phase 1 data. Pure presentation layer, no database changes, no new pages.
**Delivers:** Fullscreen mode, smooth transitions with responsive srcSet, touch gestures (pull-down-to-close, pinch-to-zoom), EXIF metadata display in lightbox footer.
**Addresses:** Features 1 (display), 2, 3, 4.
**Avoids:** Fullscreen iPhone Safari gap (Pitfall 6), custom animation conflicts (Pitfall 10), image quality regression (Pitfall 15).
**Dependencies:** YARL Fullscreen and Zoom plugins (already installed), EXIF data from Phase 1.

### Phase 3: Album Management

**Rationale:** Both features 5 and 6 require a new admin album detail page. Building them together avoids creating the page twice. Independent of Phases 1 and 2 (could theoretically run in parallel, but sequential execution recommended). Fixes two unused schema elements: `coverPhotoId` and `sortOrder`.
**Delivers:** Admin album detail page with photo grid, "Set as Cover" functionality, drag-to-reorder photos, batch sort order API endpoint.
**Addresses:** Features 5, 6.
**Avoids:** Photo reorder query bug (Pitfall 4), FK constraint mismatch (Pitfall 11), dnd-kit grid strategy mismatch (Pitfall 14), touch gesture conflicts (Pitfall 7).
**Dependencies:** Fix `findByAlbumId` ORDER BY, create reorder API route, fix FK constraint on `coverPhotoId`.

### Phase 4: Shareability

**Rationale:** Deep links (feature 7) establish the URL structure that social sharing (feature 8) relies on. OG tags benefit from EXIF data (Phase 1) being available. Most user-facing polish features. Capstone that ties everything together.
**Delivers:** Direct photo page route, URL sync in lightbox with `history.replaceState`, `generateMetadata` on all public pages, JPEG OG image derivatives, tested social media previews.
**Addresses:** Features 7, 8.
**Avoids:** Browser history pollution (Pitfall 5), OG image crawler compatibility (Pitfall 8).
**Dependencies:** EXIF data from Phase 1, album photo ordering from Phase 3, generate JPEG derivatives for OG compatibility.

### Phase Ordering Rationale

- **Phase 1 first** because database migrations are risky and learned patterns from v1.0. EXIF data is a dependency for display (Phase 2) and sharing (Phase 4).
- **Phase 2 second** because lightbox changes are presentation-only and can consume Phase 1 data immediately. Lowest risk phase.
- **Phase 3 third** because it's independent (no dependencies on Phases 1-2) but Phase 4 benefits from photo ordering working correctly. Fixes schema drift issues before final polish.
- **Phase 4 last** because it needs direct links working before sharing can work, and it benefits from all other features being complete (EXIF data enriches OG tags, album covers are set, photos are ordered).

**Dependency graph:**

```
Phase 1: EXIF
    |
    +-> Phase 2: Lightbox (needs EXIF data)
    |
    +-> Phase 4: Shareability (OG tags enriched by EXIF)

Phase 3: Album Management (independent)
    |
    +-> Phase 4: Shareability (cover photos used in OG tags)
```

### Research Flags

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (EXIF):** exifr library is well-documented, Sharp integration is straightforward, worker pattern already established.
- **Phase 2 (Lightbox):** YARL plugins are official and documented, configuration-only changes.
- **Phase 3 (Album Management):** @dnd-kit pattern proven in `SortableAlbumCard`, direct replication with grid strategy.
- **Phase 4 (Shareability):** Next.js `generateMetadata` is framework built-in, well-documented.

**No phases need deeper research.** All features have clear implementation paths with existing patterns or well-documented libraries.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                                  |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack        | HIGH       | YARL plugins verified from installed package exports and TypeScript declarations. @dnd-kit proven in codebase. exifr chosen based on npm trends, GitHub activity, and Sharp maintainer recommendation. |
| Features     | HIGH       | All 8 features verified against YARL docs, Next.js API reference, and existing codebase patterns. EXIF display patterns researched from Flickr/500px.                                                  |
| Architecture | HIGH       | Integration points mapped to existing Clean Architecture layers. `photo_albums.sortOrder` and `albums.coverPhotoId` verified in schema. YARL v3.28.0 plugin availability confirmed.                    |
| Pitfalls     | HIGH       | Codebase-specific pitfalls verified by reading actual source code (FK constraint mismatch, unused sortOrder, missing ORDER BY, v1.0 db:push lesson). Library pitfalls verified from official docs.     |

**Overall confidence:** HIGH

### Gaps to Address

- **JPEG derivative generation for OG images:** Current pipeline only generates WebP and AVIF. Need to add JPEG generation for maximum social media crawler compatibility. Sharp already installed, just needs configuration.
- **FK constraint fix for coverPhotoId:** Schema says `onDelete: "set null"` but database has `NO ACTION` (MEMORY.md documents this mismatch). Must reconcile before building cover selection UI. Options: (a) ALTER TABLE to add ON DELETE SET NULL, or (b) application-level cleanup when deleting photos.
- **Testing on iPhone Safari:** Fullscreen mode is unsupported. Design must work gracefully without the Fullscreen API. Need real device testing (DevTools emulation insufficient).
- **OG image absolute URLs:** Need to construct fully-qualified URLs for `og:image` (crawlers require absolute URLs with domain). May need `NEXT_PUBLIC_SITE_URL` env var or use Next.js request headers to infer domain.

## Sources

### Primary (HIGH confidence)

- **Installed package analysis:** YARL v3.28.0 package.json exports, TypeScript type declarations for AnimationSettings, ControllerSettings, Fullscreen/Zoom plugin configurations. @dnd-kit/core v6.3.1 and @dnd-kit/sortable v10.0.0 installed.
- **Codebase verification:** Existing `SortableAlbumCard` pattern, `photo_albums.sortOrder` column in schema, `albums.coverPhotoId` with PATCH API support, Sharp v0.34.5 usage in `imageService.ts`, BullMQ worker pipeline in `imageProcessor.ts`.
- **Official documentation:** [Sharp metadata API](https://sharp.pixelplumbing.com/api-input/), [YARL Plugins](https://yet-another-react-lightbox.com/plugins), [YARL Fullscreen Plugin](https://yet-another-react-lightbox.com/plugins/fullscreen), [YARL Zoom Plugin](https://yet-another-react-lightbox.com/plugins/zoom), [Next.js generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), [Next.js Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images), [dnd-kit Sortable](https://docs.dndkit.com/presets/sortable).

### Secondary (MEDIUM confidence)

- **Ecosystem research:** [npm trends comparison: exifr vs exifreader vs exif-reader](https://npmtrends.com/exif-reader-vs-exifr-vs-exifreader) — exifr has 497K weekly downloads, exifreader 91K, exif-reader 14K.
- **Pattern research:** Flickr EXIF display patterns (camera/lens/settings shown, GPS hidden), 500px gear pages (camera metadata as portfolio feature), photography site UX patterns for lightbox transitions and gestures.

### Tertiary (LOW confidence)

- None. All findings verified against authoritative sources or codebase inspection.

---

_Research completed: 2026-02-05_
_Ready for roadmap: yes_
