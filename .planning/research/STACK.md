# Technology Stack: v1.1 Additions

**Project:** Photography Portfolio Website -- v1.1 Enhancement Milestone
**Researched:** 2026-02-05
**Overall Confidence:** HIGH

## Executive Summary

The v1.1 milestone requires surprisingly few new dependencies. The existing stack already covers most needs:

- **YARL (already installed at v3.28.0)** has built-in fullscreen, touch/swipe, and transition plugins -- no new library needed
- **exifr** was planned in v1.0 research but never installed -- it remains the best choice for EXIF extraction
- **@dnd-kit (already installed)** handles the photo reordering use case with the same pattern as album reordering
- **OG images** need no new library -- Next.js `generateMetadata` + the existing image API route covers static OG meta tags; Sharp (already installed) can generate OG images if dynamic generation is desired

**Net new dependencies: 1 (exifr)**. Everything else is configuration of existing libraries.

---

## Feature-to-Stack Mapping

| Feature                   | Library                                         | Status                            | New Dependency?     |
| ------------------------- | ----------------------------------------------- | --------------------------------- | ------------------- |
| EXIF metadata extraction  | exifr ^7.1.3                                    | Not yet installed                 | YES -- only new dep |
| Fullscreen lightbox       | YARL Fullscreen plugin                          | Installed, unused                 | No                  |
| Smooth transitions        | YARL core animation config                      | Installed, partially configured   | No                  |
| Touch/swipe gestures      | YARL core (built-in)                            | Installed, active                 | No                  |
| Photo reorder (drag-drop) | @dnd-kit/core + @dnd-kit/sortable               | Installed, used for albums        | No                  |
| Direct photo links        | Next.js URL state + YARL `index` prop           | Framework built-in                | No                  |
| Album cover selection     | Existing API + UI only                          | Schema already has `coverPhotoId` | No                  |
| OpenGraph meta tags       | Next.js `generateMetadata` + existing image API | Framework built-in                | No                  |

---

## New Dependencies

### exifr -- EXIF Metadata Extraction

| Property      | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Package       | `exifr`                                                  |
| Version       | `^7.1.3` (latest, stable)                                |
| Purpose       | Parse EXIF from uploaded photos (camera, lens, settings) |
| Bundle impact | Server-side only (worker process), zero client impact    |
| Confidence    | HIGH                                                     |

**Why exifr over alternatives:**

| Criterion               | exifr                                | ExifReader                     | exif-reader         | Sharp metadata()      |
| ----------------------- | ------------------------------------ | ------------------------------ | ------------------- | --------------------- |
| Parse speed (per photo) | ~2.5ms                               | ~9.5ms                         | Not benchmarked     | N/A (raw buffer only) |
| Parsed output           | YES -- keyed object                  | YES -- keyed object            | YES -- keyed object | NO -- raw Buffer      |
| Node.js Buffer input    | YES                                  | YES                            | YES                 | Built-in              |
| HEIC/AVIF support       | YES                                  | YES                            | Limited             | N/A                   |
| Weekly npm downloads    | ~497K                                | ~91K                           | ~53 projects        | N/A                   |
| Maintenance             | Stable (no changes needed -- mature) | Active (maintained since 2012) | Sparse              | N/A                   |
| Zero dependencies       | YES                                  | YES                            | YES                 | N/A                   |

**Critical decision: exifr vs Sharp's built-in EXIF.** Sharp's `metadata()` returns EXIF as a raw binary `Buffer`, not parsed key-value pairs. You would need a second library (like `exif-reader`) to parse that buffer anyway. Using exifr directly on the file is simpler, faster, and avoids the double-parse.

**Why not parse EXIF via Sharp buffer + exif-reader:**

- Two-step process (Sharp reads file -> get buffer -> exif-reader parses buffer)
- exifr reads the file directly, only reading the first few hundred bytes where EXIF lives
- exifr handles the full pipeline in one call with better performance

**Target EXIF fields for photography portfolio:**

```typescript
// Fields to extract and store
interface PhotoExif {
  cameraMake: string | null; // "Canon", "Sony", "Nikon"
  cameraModel: string | null; // "EOS R5", "A7 IV"
  lensModel: string | null; // "RF 24-70mm F2.8 L IS USM"
  focalLength: number | null; // 50 (mm)
  aperture: number | null; // 2.8 (f-number)
  shutterSpeed: string | null; // "1/250" (formatted from ExposureTime)
  iso: number | null; // 400
  dateTaken: Date | null; // DateTimeOriginal
}
```

**Usage pattern -- extract during image processing worker:**

```typescript
import exifr from "exifr";

// In the BullMQ worker, after upload, before/alongside derivative generation
const exif = await exifr.parse(originalFilePath, {
  pick: [
    "Make",
    "Model",
    "LensModel",
    "FocalLength",
    "FNumber",
    "ExposureTime",
    "ISO",
    "DateTimeOriginal",
  ],
});
```

**Privacy note:** Do NOT extract or store GPS coordinates (`GPSLatitude`, `GPSLongitude`). These expose the photographer's location. The `pick` option in exifr ensures only whitelisted fields are read.

**Installation:**

```bash
npm install exifr
```

No `@types/exifr` needed -- exifr ships its own TypeScript declarations.

**Source:** [exifr GitHub](https://github.com/MikeKovarik/exifr), [npm trends comparison](https://npmtrends.com/exif-reader-vs-exifr-vs-exifreader), [Sharp metadata docs](https://sharp.pixelplumbing.com/api-input)

---

## Existing Dependencies: Configuration Changes

### YARL Plugins (yet-another-react-lightbox v3.28.0)

The project already imports YARL at v3.28.0. The current `PhotoLightbox.tsx` uses only the `Captions` plugin. Three additional built-in plugins need to be activated for v1.1 -- all ship with the already-installed package.

#### Fullscreen Plugin

| Property       | Value                                                |
| -------------- | ---------------------------------------------------- |
| Import         | `yet-another-react-lightbox/plugins/fullscreen`      |
| Purpose        | Full-screen lightbox mode via browser Fullscreen API |
| New dependency | NO -- bundled with YARL                              |
| Confidence     | HIGH (verified from installed package types)         |

**How it works:** Uses the browser's Fullscreen API. Adds a fullscreen toggle button to the toolbar. On unsupported environments (Safari iOS, iframes), the button is automatically hidden.

**Configuration:**

```typescript
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";

<Lightbox
  plugins={[Captions, Fullscreen]}
  fullscreen={{ auto: false }} // user triggers manually
/>
```

**Props verified from installed types:**

- `fullscreen.auto` (boolean) -- auto-enter fullscreen on open
- `fullscreen.ref` (ForwardedRef) -- external control
- `on.enterFullscreen` / `on.exitFullscreen` -- lifecycle callbacks

#### Touch/Swipe Navigation (Built-in Core)

| Property       | Value                                       |
| -------------- | ------------------------------------------- |
| Import         | N/A -- core feature, no plugin needed       |
| Purpose        | Swipe left/right to navigate, pull to close |
| New dependency | NO                                          |
| Confidence     | HIGH (verified from YARL documentation)     |

**Current state:** The existing `PhotoLightbox.tsx` already has swipe navigation working (it is a core YARL feature). The `controller` settings manage gesture behavior:

```typescript
// Currently configured (intentionally restrictive for v1.0):
controller={{
  closeOnBackdropClick: false,
  closeOnPullDown: false,
  closeOnPullUp: false,
}}
```

**v1.1 changes:** Consider enabling `closeOnPullDown: true` for mobile-friendly dismiss gesture. Swipe left/right for photo navigation is already active by default (controlled by `disableSwipeNavigation`, which defaults to `false`).

No new code needed for swipe -- just configuration adjustments.

#### Smooth Transitions (Built-in Core)

| Property       | Value                                    |
| -------------- | ---------------------------------------- |
| Import         | N/A -- core feature via `animation` prop |
| Purpose        | Smooth slide transitions between photos  |
| New dependency | NO                                       |
| Confidence     | HIGH (verified from installed types)     |

**Current state:** Already configured in `PhotoLightbox.tsx`:

```typescript
animation={{
  fade: 200,
  swipe: 300,
}}
```

**v1.1 tuning options available:**

- `animation.fade` -- fade-in/fade-out duration (ms)
- `animation.swipe` -- swipe transition duration (ms)
- `animation.navigation` -- keyboard/button navigation duration (ms, overrides swipe)
- `animation.easing.fade` -- timing function for fade (default: "ease")
- `animation.easing.swipe` -- timing function for swipe (default: "ease-out")
- `animation.easing.navigation` -- timing function for nav (default: "ease-in-out")

Recommended v1.1 settings for smoother feel:

```typescript
animation={{
  fade: 250,
  swipe: 400,
  navigation: 350,
  easing: {
    fade: "ease",
    swipe: "cubic-bezier(0.25, 0.1, 0.25, 1)",
    navigation: "ease-in-out",
  },
}}
```

### @dnd-kit -- Photo Reordering Within Albums

| Property       | Value                                                 |
| -------------- | ----------------------------------------------------- |
| Packages       | `@dnd-kit/core` (6.3.1), `@dnd-kit/sortable` (10.0.0) |
| Purpose        | Drag-to-reorder photos within an album (admin)        |
| New dependency | NO -- already installed and used for album reordering |
| Confidence     | HIGH (pattern already proven in codebase)             |

**Current usage:** `AlbumsPageClient.tsx` uses `DndContext` + `SortableContext` + `verticalListSortingStrategy` for album card reordering. `SortableAlbumCard.tsx` uses `useSortable` hook.

**v1.1 reuse:** The exact same pattern applies to photo reordering within an album. The only differences:

- Use a grid layout strategy instead of vertical list (photos displayed as thumbnails in a grid)
- Import `rectSortingStrategy` instead of `verticalListSortingStrategy` for grid sorting
- Create a `SortablePhotoCard` component analogous to `SortableAlbumCard`

**Grid sorting strategy (already available):**

```typescript
import { rectSortingStrategy } from "@dnd-kit/sortable";

<SortableContext
  items={photos.map(p => p.id)}
  strategy={rectSortingStrategy}  // For grid layout
>
```

The `photo_albums` junction table already has a `sortOrder` column, so the database schema is ready.

No new packages, no version changes needed.

### Next.js -- Direct Photo Links and OpenGraph

| Property       | Value                                    |
| -------------- | ---------------------------------------- |
| Framework      | Next.js 16.1.6 (already installed)       |
| Purpose        | URL-based photo deep links, OG meta tags |
| New dependency | NO                                       |
| Confidence     | HIGH                                     |

#### Direct Photo Links (URL opens lightbox)

**Approach:** Use URL search params or hash to encode the current photo index/ID. When a user shares a URL like `/albums/abc123?photo=photo456`, the page opens with the lightbox showing that photo.

Implementation is pure application logic -- no new library needed:

- Read `searchParams` in the Server Component or via `useSearchParams()` client-side
- Pass the initial `index` to `<PhotoLightbox index={initialIndex} />`
- Update the URL on `onIndexChange` using `router.replace()` or `history.replaceState()`

#### OpenGraph Meta Tags

**Approach:** Use Next.js `generateMetadata` function (App Router built-in) to set OG tags dynamically per page.

Two sub-approaches for the `og:image`:

**Option A (Recommended): Point OG image to existing image API route.**

```typescript
// In page.tsx or layout.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const album = await getAlbum(params.id);
  const coverPhoto = album.coverPhotoId;
  return {
    openGraph: {
      title: album.title,
      description: album.description,
      images: [
        {
          url: `/api/images/${coverPhoto}/1200w.webp`,
          width: 1200,
          type: "image/webp",
        },
      ],
    },
  };
}
```

This reuses the existing image serving infrastructure -- the processed 1200w derivatives are already generated and served with immutable caching. No new image generation pipeline needed.

**Option B (If branded OG images desired): Use `next/og` ImageResponse.**

This would generate images with text overlays (album title, site branding) using the Satori engine. This requires more work but produces branded social cards.

```typescript
// app/albums/[id]/opengraph-image.tsx
import { ImageResponse } from "next/og";

export default async function Image({ params }) {
  // Fetch album data, generate branded card
  return new ImageResponse(/* JSX */);
}
```

**Recommendation:** Start with Option A. It is zero-dependency, uses existing infrastructure, and produces better results for a photography portfolio (showing the actual photo is more compelling than a branded text card). Option B can be added later if social media previews need branding.

**Source:** [Next.js Metadata Docs](https://nextjs.org/docs/app/getting-started/metadata-and-og-images), [Next.js generateMetadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)

---

## Schema Changes Required

The `photos` table needs new columns for EXIF metadata. No new tables needed.

```sql
ALTER TABLE photos ADD COLUMN camera_make TEXT;
ALTER TABLE photos ADD COLUMN camera_model TEXT;
ALTER TABLE photos ADD COLUMN lens_model TEXT;
ALTER TABLE photos ADD COLUMN focal_length REAL;
ALTER TABLE photos ADD COLUMN aperture REAL;
ALTER TABLE photos ADD COLUMN shutter_speed TEXT;
ALTER TABLE photos ADD COLUMN iso INTEGER;
ALTER TABLE photos ADD COLUMN date_taken INTEGER;  -- timestamp_ms, like other date columns
```

**Important:** Based on the v1.0 lesson learned (documented in MEMORY.md), use `ALTER TABLE` directly for migrations, not `db:push`. The `db:push` command caused runtime errors in Phase 6 of v1.0.

The Drizzle schema in `infrastructure/database/schema.ts` will also need updating:

```typescript
export const photos = sqliteTable("photos", {
  // ... existing columns ...
  cameraMake: text("camera_make"),
  cameraModel: text("camera_model"),
  lensModel: text("lens_model"),
  focalLength: real("focal_length"),
  aperture: real("aperture"),
  shutterSpeed: text("shutter_speed"),
  iso: integer("iso"),
  dateTaken: integer("date_taken", { mode: "timestamp_ms" }),
});
```

The `Photo` domain entity will need matching fields. All new fields are nullable since not all images contain EXIF data (screenshots, scans, edited exports).

---

## What NOT to Add

| Library/Approach         | Why Not                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hello-pangea/dnd`      | Project already uses `@dnd-kit`. No reason to add a second DnD library.                                                                                                                                 |
| `framer-motion`          | YARL already handles lightbox animations. Adding framer-motion for transitions would conflict with YARL's internal animation system and bloat the bundle.                                               |
| `react-swipeable`        | YARL has built-in swipe/touch gesture support. Adding a second gesture library would create conflicts.                                                                                                  |
| `@vercel/og` or `satori` | `next/og` (built into Next.js) already wraps Satori. No separate install needed if dynamic OG images are desired.                                                                                       |
| `sharp` for OG images    | Sharp is already installed for image processing. If needed for OG image generation, it can be reused without a new dependency. However, the recommended approach (Option A) needs no generation at all. |
| `exif-reader`            | Only useful as a companion to Sharp's raw EXIF buffer. exifr reads files directly and is faster -- no need for the two-step approach.                                                                   |
| `zustand`                | Was considered in v1.0 research but never installed. Lightbox state (current photo index, URL sync) can be managed with React `useState` + URL params. No global store needed.                          |
| `photoswipe`             | YARL is already installed and working. Switching lightbox libraries for v1.1 would be a major rewrite for marginal benefit.                                                                             |

---

## Installation Summary

```bash
# Only ONE new dependency
npm install exifr
```

That is it. All other v1.1 features use existing dependencies with configuration changes.

---

## Integration Points with Existing Stack

| v1.1 Feature    | Touches                                         | Integration Strategy                                                              |
| --------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| EXIF extraction | BullMQ worker, Photo entity, DB schema          | Extract in worker alongside derivative generation. Store in photos table.         |
| EXIF display    | PhotoLightbox, Captions plugin, API routes      | Add EXIF to photo API response. Display via YARL Captions or custom slide footer. |
| Fullscreen      | PhotoLightbox component                         | Add Fullscreen to plugins array. One line change.                                 |
| Transitions     | PhotoLightbox component                         | Tune existing animation prop. Config change only.                                 |
| Touch gestures  | PhotoLightbox component                         | Adjust controller settings. Config change only.                                   |
| Photo reorder   | New admin page/component, photo_albums table    | Clone album reorder pattern. Use existing sortOrder column.                       |
| Deep links      | Gallery pages, PhotoLightbox                    | URL searchParams -> lightbox index. Framework feature.                            |
| Album covers    | Album admin page, albums table                  | Schema already has coverPhotoId. Just needs UI for selection.                     |
| OG meta tags    | Page-level generateMetadata, existing image API | generateMetadata returns image URL pointing to existing derivatives.              |

---

## Confidence Assessment

| Component                    | Confidence | Reasoning                                                                                               |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| exifr                        | HIGH       | Verified via GitHub README, npm trends, installed types. Planned in v1.0, still best choice.            |
| YARL Fullscreen plugin       | HIGH       | Verified from installed package.json exports and TypeScript declarations.                               |
| YARL touch/swipe             | HIGH       | Verified from installed types (ControllerSettings) and official documentation. Already working in v1.0. |
| YARL transitions             | HIGH       | Verified from installed types (AnimationSettings). Already partially configured.                        |
| @dnd-kit photo reorder       | HIGH       | Exact same pattern already proven in album reorder (AlbumsPageClient.tsx).                              |
| Next.js generateMetadata     | HIGH       | Standard Next.js App Router feature, well-documented.                                                   |
| Next.js URL-based deep links | HIGH       | Standard web pattern, searchParams already available in framework.                                      |
| Schema migration for EXIF    | HIGH       | Approach validated in v1.0 (ALTER TABLE). Column types straightforward.                                 |

---

## Sources

### Verified from Installed Packages (HIGH confidence)

- YARL v3.28.0 package.json: exports for fullscreen, captions, counter, download, share, slideshow, thumbnails, zoom, inline, video plugins
- YARL types.d.ts: AnimationSettings (fade, swipe, navigation, easing), ControllerSettings (swipe/gesture options)
- YARL plugins/fullscreen/index.d.ts: auto mode, ref control, enter/exit callbacks
- @dnd-kit/core v6.3.1 and @dnd-kit/sortable v10.0.0: installed and working in AlbumsPageClient.tsx
- Database schema: photos table (ready for EXIF columns), photo_albums.sortOrder (ready for photo reorder)

### Official Documentation (HIGH confidence)

- [Sharp metadata API](https://sharp.pixelplumbing.com/api-input/) -- returns raw EXIF buffer, not parsed
- [exifr GitHub](https://github.com/MikeKovarik/exifr) -- Buffer input, parsed output, field picking
- [YARL Documentation](https://yet-another-react-lightbox.com/documentation) -- touch/swipe/animation built-in
- [YARL Fullscreen Plugin](https://yet-another-react-lightbox.com/plugins/fullscreen) -- browser Fullscreen API
- [YARL Plugins Overview](https://yet-another-react-lightbox.com/plugins) -- 10 bundled plugins
- [Next.js Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) -- generateMetadata approach
- [Next.js opengraph-image Convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image) -- file-based and dynamic

### Ecosystem Research (MEDIUM confidence)

- [npm trends: exifr vs exifreader vs exif-reader](https://npmtrends.com/exif-reader-vs-exifr-vs-exifreader) -- exifr leads in downloads
- [dnd-kit documentation](https://docs.dndkit.com/presets/sortable) -- sortable presets including grid strategy
