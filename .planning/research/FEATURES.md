# Feature Landscape: v1.1 Enhancement Features

**Domain:** Photography portfolio enhancements
**Researched:** 2026-02-05
**Scope:** 8 specific features for existing v1.0 portfolio app

---

## Feature Analysis

### 1. EXIF Metadata Extraction and Display

**Category:** Table Stakes (was deferred from v1.0, photographers expect this)

**How it typically works:**

Photography sites like Flickr and 500px display EXIF data alongside or below images. The standard pattern is:

- **Extraction at upload time:** EXIF is parsed from the original file during the image processing pipeline and stored in the database. It is NOT parsed on each request.
- **Storage:** A JSON column or separate metadata table stores the parsed values. Only the photographically-relevant subset is kept.
- **Display:** A compact info panel shown below the photo in the lightbox or as a toggleable overlay. The most common layout is a single row of icons with values (camera icon + "Canon R5", aperture icon + "f/2.8", etc.).

**Expected EXIF fields to display (in priority order):**

| Field         | EXIF Tag         | Example           | Why                                   |
| ------------- | ---------------- | ----------------- | ------------------------------------- |
| Camera body   | Make + Model     | Canon EOS R5      | Most asked "what did you shoot with?" |
| Lens          | LensModel        | RF 24-70mm f/2.8L | Second most asked question            |
| Focal length  | FocalLength      | 50mm              | Compositional context                 |
| Aperture      | FNumber          | f/2.8             | Depth of field context                |
| Shutter speed | ExposureTime     | 1/250s            | Motion context                        |
| ISO           | ISOSpeedRatings  | 400               | Light conditions context              |
| Date taken    | DateTimeOriginal | Jan 15, 2026      | When, not just upload date            |

**Fields to extract but NOT display publicly:**

| Field                | Reason                              |
| -------------------- | ----------------------------------- |
| GPS coordinates      | Privacy: reveals shooting locations |
| Camera serial number | Privacy: identifies specific device |
| Software version     | Not useful to viewers               |
| Full IPTC/XMP        | Overkill for portfolio display      |

**Implementation approach:**

Sharp already returns an `exif` property as a raw Buffer from `metadata()`. This buffer needs parsing with a dedicated library. The two viable options:

- **exif-reader** (recommended by Sharp's own documentation, ~4KB, zero dependencies, parses the buffer Sharp provides directly)
- **exifr** (faster, more versatile, supports selective tag extraction, ~30KB full bundle)

Recommendation: Use **exifr** because it supports selective parsing (only grab the 7 fields needed), handles edge cases better across camera manufacturers, and works directly with file buffers. Sharp's `metadata().exif` buffer can be passed directly to exifr.

**Where to extract:** During the BullMQ image processing worker job, right alongside derivative generation and blur placeholder creation. Parse EXIF, store the 7 relevant fields as a JSON string in a new `exifData` column on the `photos` table.

**Complexity:** Low-Medium

- Schema migration: Add `exif_data TEXT` column to photos table (use ALTER TABLE, not db:push per project lessons)
- Worker change: ~15 lines to extract and store EXIF after loading the original
- Display component: New `ExifDisplay` component shown in lightbox captions area
- Backfill: Need a one-time script to extract EXIF from existing originals

**Dependencies on existing features:**

- Image processing worker (already exists)
- Sharp library (already installed, `metadata()` already used in `imageService.ts`)
- PhotoLightbox component (already exists, uses Captions plugin)
- Photo entity and schema (need migration)

**Confidence:** HIGH -- Sharp metadata extraction verified in existing codebase (`src/infrastructure/services/imageService.ts` already calls `sharp(inputPath).metadata()`). EXIF buffer parsing with exifr is well-documented.

---

### 2. Smooth Transitions Between Photos in Lightbox

**Category:** Differentiator (enhances perceived quality significantly)

**How it typically works:**

Professional photography sites use smooth crossfade or slide transitions when navigating between photos. The key patterns:

- **Crossfade:** Current photo fades out while next fades in. Typical duration: 200-300ms. Creates an elegant, unhurried feel.
- **Slide/swipe:** Photos slide left/right like a carousel. Typical duration: 300-500ms. Feels natural, especially on touch devices.
- **Spring animation:** Slightly bouncy easing for a modern feel. Used by Apple Photos and Google Photos.

**Current state in the project:**

The existing `PhotoLightbox.tsx` already configures YARL animations:

```typescript
animation={{
  fade: 200,
  swipe: 300,
}}
```

This means basic fade and swipe transitions are already present. The "smooth transitions" enhancement would involve:

1. **Improving image loading so transitions feel smooth:** Currently the lightbox uses `600w.webp` for all slides. This means small images on large screens. Using YARL's `srcSet` feature to serve the right resolution would make transitions between fully-loaded images feel much smoother.
2. **Preloading:** YARL's `carousel.preload: 2` is already set, which preloads 2 slides ahead. This is good.
3. **Easing refinement:** Tuning the easing curves for a more cinematic feel. YARL supports custom easing strings per animation type.

**What users actually notice:**

The biggest "smoothness" issue is not animation duration -- it is the flash of loading when swiping to the next photo. A photo that takes 500ms to load with a 200ms crossfade feels janky. The fix is responsive srcSet with preloading, not animation tweaking.

**YARL srcSet support:**

YARL slides accept a `srcSet` array for responsive images:

```typescript
{
  src: '/api/images/photoId/1200w.webp',
  srcSet: [
    { src: '/api/images/photoId/600w.webp', width: 600 },
    { src: '/api/images/photoId/1200w.webp', width: 1200 },
    { src: '/api/images/photoId/2400w.webp', width: 2400 },
  ]
}
```

This is the single biggest improvement for perceived smoothness.

**Complexity:** Low

- Update slide data to include srcSet with all available widths
- Fine-tune animation easing values
- No new dependencies needed

**Dependencies on existing features:**

- PhotoLightbox component (already exists with YARL)
- Image API route serving multiple widths (already exists)
- Multiple derivative sizes already generated (300, 600, 1200, 2400)

**Confidence:** HIGH -- YARL documentation confirms srcSet support. Existing animation config just needs tuning.

---

### 3. Touch Gestures (Swipe) for Mobile

**Category:** Table Stakes (mobile users expect swipe navigation)

**How it typically works:**

On mobile photography sites:

- **Horizontal swipe:** Navigate to previous/next photo. This is the primary interaction.
- **Pinch to zoom:** Enlarge photo details. Secondary but expected.
- **Pull down to close:** Swipe down to dismiss the lightbox and return to gallery.
- **Double-tap to zoom:** Quick zoom toggle.

**Current state:**

YARL already has built-in touch support including horizontal swipe navigation. The current lightbox config explicitly disables some gestures:

```typescript
controller={{
  closeOnBackdropClick: false,
  closeOnPullDown: false,
  closeOnPullUp: false,
}}
```

So horizontal swipe for prev/next already works (this is YARL's default behavior). The enhancement is about enabling additional gestures and potentially the Zoom plugin.

**What needs to change:**

1. **Enable pull-down to close:** Set `closeOnPullDown: true`. This is the standard mobile dismiss gesture (used by Instagram, Google Photos, Apple Photos). Currently explicitly disabled.
2. **Add Zoom plugin:** YARL's Zoom plugin enables pinch-to-zoom and double-tap-to-zoom on mobile. This is a table stakes feature for photography viewing.
3. **Consider pull-up to close:** Some sites also support pull-up. Less standard; could enable for completeness.

**YARL Zoom plugin capabilities:**

- Pinch to zoom (touch)
- Double-tap to zoom (touch)
- Mouse wheel zoom (desktop)
- Configurable max zoom, scroll to zoom sensitivity
- Zoom in/out buttons in toolbar

**Complexity:** Low

- Import and add Zoom plugin to plugins array
- Flip `closeOnPullDown` to `true`
- Configure zoom limits (maxZoomPixelRatio, scrollToZoom)
- No new dependencies (Zoom is bundled with YARL)

**Dependencies on existing features:**

- PhotoLightbox component (already exists)
- YARL already installed at v3.28.0

**Confidence:** HIGH -- YARL documentation and GitHub confirm all these gestures are built-in.

---

### 4. Full-Screen Mode for Lightbox

**Category:** Differentiator (valued by photography enthusiasts, not expected by casual viewers)

**How it typically works:**

Full-screen mode uses the browser's Fullscreen API to hide all browser chrome (address bar, tabs, bookmarks). The photo fills the entire screen. Common patterns:

- **Manual entry:** A fullscreen button (expand icon) in the lightbox toolbar
- **Auto-enter on open:** Some sites go fullscreen when the lightbox opens (aggressive but immersive)
- **Exit on Escape:** Standard browser behavior, also YARL's close trigger
- **Hide on unsupported:** Safari on iPhone does not support the Fullscreen API; the button should not appear

**YARL Fullscreen plugin:**

YARL has a built-in Fullscreen plugin that handles all of this:

- Adds a fullscreen toggle button to the toolbar
- Supports `auto` mode (enter fullscreen when lightbox opens)
- Provides enter/exit lifecycle callbacks
- Automatically hides the button on unsupported browsers (Safari iOS, iframes)
- Provides a ref API for programmatic control

**Recommendation:** Enable the Fullscreen plugin but do NOT auto-enter. Auto-entering fullscreen is surprising and feels intrusive. Let the user choose. The button in the toolbar is sufficient.

**Complexity:** Very Low

- Import Fullscreen plugin
- Add to plugins array
- Optionally customize icons to match design
- No new dependencies (bundled with YARL)

**Dependencies on existing features:**

- PhotoLightbox component (already exists)
- YARL already installed

**Confidence:** HIGH -- YARL Fullscreen plugin documentation verified via official site.

---

### 5. Album Cover Image Selection

**Category:** Table Stakes (the schema and API already support this, just missing the UI)

**How it typically works:**

Admin selects which photo represents an album in the album listing. Common UI patterns:

- **Click to set as cover:** In the album management view, each photo has a "Set as Cover" button or a star/pin icon
- **Visual indicator:** The current cover photo is visually highlighted (border, badge, checkmark)
- **Fallback:** If no cover is explicitly set, use the first photo in the album
- **Grid selection modal:** A modal showing album photos as thumbnails; click one to select

**Current state:**

The infrastructure is already fully built:

- `albums.coverPhotoId` column exists in the schema
- `Album` entity has `coverPhotoId: string | null`
- `PATCH /api/admin/albums/[id]` accepts `coverPhotoId` in the update schema
- `AlbumsPage` (`src/app/albums/page.tsx`) already has fallback logic: uses `coverPhotoId` if set, otherwise first photo
- The admin album edit API validates and saves `coverPhotoId`

What is missing is only the **admin UI** to set/change the cover photo. There is no visual way for the admin to pick a cover photo from the album's photos.

**Recommended UI pattern:** Within the album edit/management page, show a thumbnail grid of the album's photos. Each photo has a "Set as Cover" action. The current cover has a visible "Cover" badge. Clicking a non-cover photo sends `PATCH /api/admin/albums/[id] { coverPhotoId: photoId }`.

**Complexity:** Low

- New client component: Cover photo picker (thumbnail grid + click handler)
- Wire to existing `PATCH` endpoint
- Visual indicator for current cover
- No schema changes, no API changes, no new dependencies

**Dependencies on existing features:**

- Album management admin UI (exists)
- Album PATCH API with coverPhotoId support (exists)
- Photo thumbnails served via image API (exists)

**Confidence:** HIGH -- All backend infrastructure verified in codebase. Only UI component is needed.

---

### 6. Drag to Reorder Photos Within Album

**Category:** Table Stakes (admin expects to control photo order in albums)

**How it typically works:**

Admin drags photo thumbnails to rearrange their order within an album. The order is saved and reflected on the public album page.

- **Drag handle or entire card:** Either a dedicated grip icon or the whole thumbnail is draggable
- **Visual feedback:** Dragged item follows cursor with opacity/scale change. Drop target shows insertion point.
- **Optimistic update:** Reorder visually immediately, then persist to backend
- **Grid layout:** Photos shown as a grid (not a list), requiring 2D sorting strategy
- **Save strategy:** Either auto-save on drop, or batch save with a "Save Order" button

**Current state:**

The project already uses `@dnd-kit/core` (v6.3.1) and `@dnd-kit/sortable` (v10.0.0) for album reordering on the albums admin page. The `SortableAlbumCard` component is a working example of the pattern.

However, the `photo_albums` junction table already has a `sortOrder` column, and `findByAlbumId` does NOT currently order by it:

```typescript
// Current: no ORDER BY on sortOrder
const results = await db
  .select({ photo: photos })
  .from(photos)
  .innerJoin(photoAlbums, eq(photos.id, photoAlbums.photoId))
  .where(eq(photoAlbums.albumId, albumId));
```

Also, `addToAlbum` always sets `sortOrder: 0`, so all photos currently have the same sort order.

**What needs to be built:**

1. **Admin album detail page** with photo grid showing sortable thumbnails
2. **Sortable photo grid component** using `@dnd-kit/sortable` (similar pattern to `SortableAlbumCard`)
3. **API endpoint** to update photo sort orders within an album (batch update `photo_albums.sortOrder`)
4. **Repository method** to update sort orders for a batch of photo-album pairs
5. **Fix `findByAlbumId`** to ORDER BY `photo_albums.sortOrder`

**Grid vs List sorting note:** dnd-kit supports grid sorting via `rectSortingStrategy` (or `rectSwappingStrategy`). For a photo grid, `rectSortingStrategy` is the right choice -- it handles 2D reordering where items wrap across rows.

**Complexity:** Medium

- New admin page/view for album photo management
- Sortable grid component (can follow SortableAlbumCard pattern)
- New API endpoint for batch sort order updates
- Repository query fix to respect sort order
- dnd-kit already installed

**Dependencies on existing features:**

- dnd-kit packages (already installed)
- SortableAlbumCard (existing pattern to follow)
- photo_albums.sortOrder column (exists but unused)
- Album management admin (exists)

**Confidence:** HIGH -- dnd-kit already in use, sortOrder column exists, proven pattern in SortableAlbumCard.

---

### 7. Direct Links to Specific Photos

**Category:** Table Stakes (users expect to share/bookmark a specific photo view)

**How it typically works:**

When a user opens a photo in the lightbox, the URL updates to include the photo identifier. If someone navigates to that URL directly, the page loads with the lightbox open on that specific photo.

**Common URL patterns:**

| Pattern            | Example                         | Pros                                                           | Cons                                             |
| ------------------ | ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Hash fragment      | `/albums/abc#photo-xyz`         | No server roundtrip, easy to implement                         | Not indexable by search engines, no SSR metadata |
| Query parameter    | `/albums/abc?photo=xyz`         | Works with Next.js useSearchParams, integrates with App Router | Slightly less clean URL                          |
| Dedicated route    | `/photos/xyz`                   | SEO-friendly, can have own metadata, proper SSR                | Requires new route, more complex navigation      |
| Intercepting route | `/albums/abc/@modal/photos/xyz` | Next.js parallel routes pattern, best of both worlds           | Complex setup                                    |

**Recommended approach for this project:** Query parameter with `window.history.pushState`.

Rationale:

- Next.js App Router integrates `pushState`/`replaceState` with `usePathname` and `useSearchParams` (confirmed since Next.js 14.1).
- URL becomes `/albums/abc?photo=xyz` when a photo is opened in the lightbox.
- On page load, check for `photo` search param. If present, find the photo's index and open the lightbox at that index.
- `window.history.replaceState` updates the URL without triggering navigation or re-rendering the page.
- When the lightbox closes, remove the `photo` param from the URL.
- No new routes needed. Works with existing album pages.

**For the homepage:** Since the homepage shows random photos, deep linking is less meaningful there. Could use `/photos/xyz` as a standalone photo page that shows the photo with its metadata, but this is a separate feature from lightbox deep linking.

**Complexity:** Low-Medium

- Update AlbumGalleryClient and HomepageClient to read/write URL search params
- Update PhotoLightbox onIndexChange callback to update URL
- On mount, check for photo param and auto-open lightbox
- Handle browser back button (popstate event)

**Dependencies on existing features:**

- AlbumGalleryClient (exists, manages lightbox state)
- HomepageClient (exists, manages lightbox state)
- PhotoLightbox (exists, provides onIndexChange callback)
- Photo IDs (already passed to client components)

**Confidence:** HIGH -- window.history.pushState integration with Next.js App Router confirmed in official docs.

---

### 8. OpenGraph Meta Tags for Social Sharing

**Category:** Table Stakes (shared links should show photo preview, not a blank card)

**How it typically works:**

When someone shares a portfolio link on Twitter/X, Facebook, Discord, iMessage, etc., the platform fetches the page's OpenGraph meta tags to render a rich preview card. The essential tags:

- `og:title` -- Page or photo title
- `og:description` -- Album description or photo description
- `og:image` -- Preview image URL (must be absolute, publicly accessible)
- `og:url` -- Canonical URL
- `og:type` -- "website" for pages, "article" for individual photos
- `twitter:card` -- "summary_large_image" for photo content

**Current state:**

The root layout has default metadata:

```typescript
export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};
```

No pages have custom metadata. No OpenGraph images are configured.

**What needs to be built:**

1. **Root layout metadata:** Site-wide defaults (portfolio name, description, default OG image)
2. **Album page metadata:** `generateMetadata` in `albums/[id]/page.tsx` returning album title, description, and cover photo as og:image
3. **Photo-specific metadata (if deep linking):** When a direct photo URL exists, use that photo as the og:image
4. **OG image serving:** The og:image URL must point to a publicly accessible image. The existing `/api/images/[photoId]/[filename]` route already serves images with proper content types. A 1200w.webp would work as the OG image.

**Next.js Metadata API approach:**

```typescript
// In albums/[id]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const album = await albumRepo.findById(params.id);
  return {
    title: album.title,
    description: album.description,
    openGraph: {
      title: album.title,
      description: album.description,
      images: [{ url: `/api/images/${coverPhotoId}/1200w.webp`, width: 1200 }],
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}
```

**OG image size considerations:**

- Facebook recommends 1200x630 pixels
- Twitter recommends 1200x675 or larger
- The existing 1200w derivative is the right size to use
- Images must be accessible without authentication (the public image API route already works this way)
- AVIF is NOT supported by all OG crawlers; use WebP or fall back to the derivative format

**Dynamic OG image generation (optional, advanced):**

Next.js supports `opengraph-image.tsx` files that dynamically generate OG images using `ImageResponse` from `next/og`. This could create a branded card with the photo overlaid on a template with the portfolio name. This is a differentiator, not table stakes.

**Complexity:** Low

- Add `generateMetadata` to album page and homepage
- Update root layout with site-wide defaults
- Point og:image to existing image API route
- No new dependencies (Next.js Metadata API is built-in)

**Dependencies on existing features:**

- Image serving API (exists, serves 1200w.webp publicly)
- Album cover photo resolution (exists or will exist via Feature 5)
- Photo and album data accessible in server components (exists)

**Confidence:** HIGH -- Next.js generateMetadata API is well-documented. Image route already serves publicly accessible images.

---

## Summary by Category

### Table Stakes

Features users expect. Missing them makes the product feel incomplete for v1.1.

| Feature                                  | Complexity | New Dependencies         | Schema Changes              |
| ---------------------------------------- | ---------- | ------------------------ | --------------------------- |
| 1. EXIF metadata extraction & display    | Low-Medium | exifr (~30KB)            | Add `exif_data` TEXT column |
| 3. Touch gestures (zoom, pull-to-close)  | Low        | None (YARL built-in)     | None                        |
| 5. Album cover image selection (UI only) | Low        | None                     | None                        |
| 6. Drag to reorder photos in album       | Medium     | None (dnd-kit installed) | None (column exists)        |
| 7. Direct links to photos                | Low-Medium | None                     | None                        |
| 8. OpenGraph meta tags                   | Low        | None (Next.js built-in)  | None                        |

### Differentiators

Features that elevate quality above typical portfolio sites.

| Feature                                 | Complexity | New Dependencies     | Schema Changes |
| --------------------------------------- | ---------- | -------------------- | -------------- |
| 2. Smooth transitions (srcSet + easing) | Low        | None                 | None           |
| 4. Full-screen mode                     | Very Low   | None (YARL built-in) | None           |

### Anti-Features

Things to deliberately NOT build for these 8 features.

| Anti-Feature                                   | Why Avoid                                                                                                 | What to Do Instead                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Display GPS coordinates from EXIF              | Privacy: reveals shooting locations. Many photographers strip GPS before sharing.                         | Extract but do not store or display GPS data             |
| Display camera serial number                   | Privacy: identifies specific physical device                                                              | Strip during extraction                                  |
| Auto-enter fullscreen on lightbox open         | Surprising, feels intrusive. Users hate unexpected fullscreen.                                            | Provide button; let user choose                          |
| Dynamic OG image generation (branded cards)    | Over-engineered for v1.1. The actual photo is better than a generated card for a portfolio.               | Use the real photo as og:image. Revisit later if wanted. |
| Custom animation library (Framer Motion, etc.) | YARL handles animations. Adding another animation library increases bundle size for marginal improvement. | Use YARL's built-in animation config                     |
| Zoom with custom gesture handler               | YARL's Zoom plugin handles pinch/double-tap. Custom gesture code is fragile on mobile.                    | Use YARL Zoom plugin                                     |
| Photo-level pages (standalone /photos/[id])    | Adds routing complexity, requires its own layout and navigation. Photos belong in album context.          | Use query param deep linking within album pages          |
| Slideshow auto-play                            | Distracting for portfolio viewing. Photographers want viewers to linger on each photo.                    | Omit. Can add later if requested.                        |

---

## Feature Dependencies

```
EXIF Extraction (1)
  |-- Depends on: Image worker (exists), Sharp metadata (exists)
  |-- Feeds into: EXIF Display component, OG description enrichment
  |-- Schema: New exif_data column on photos table
  |-- Backfill: Script needed for existing photos

Smooth Transitions (2)
  |-- Depends on: PhotoLightbox (exists), Multiple image widths (exist)
  |-- Independent: No other features depend on this

Touch Gestures (3)
  |-- Depends on: PhotoLightbox (exists), YARL (exists)
  |-- Independent: No other features depend on this

Full-Screen Mode (4)
  |-- Depends on: PhotoLightbox (exists), YARL (exists)
  |-- Independent: No other features depend on this

Album Cover Selection UI (5)
  |-- Depends on: Album PATCH API (exists), Photo thumbnails (exist)
  |-- Feeds into: OG tags (8) - cover photo used as og:image for album pages

Drag Reorder Photos (6)
  |-- Depends on: dnd-kit (exists), photo_albums.sortOrder (exists)
  |-- Feeds into: Photo display order on public pages
  |-- Requires: Admin album detail page (new view)

Direct Photo Links (7)
  |-- Depends on: AlbumGalleryClient (exists), URL search params
  |-- Feeds into: OG tags (8) - photo-specific sharing

OG Meta Tags (8)
  |-- Depends on: Album data (exists), Photo data (exists), Image API (exists)
  |-- Enhanced by: Album cover selection (5), Direct links (7), EXIF data (1)
```

### Recommended Implementation Order

Based on dependencies and effort:

**Wave 1 -- Lightbox Enhancements (features 2, 3, 4):**
All three modify the same `PhotoLightbox.tsx` component. Low complexity, no schema changes, no new pages. Can be done together.

**Wave 2 -- EXIF Pipeline (feature 1):**
Schema migration + worker change + display component + backfill script. Touches multiple layers but is self-contained.

**Wave 3 -- Album Admin (features 5, 6):**
Both require new admin UI components for album management. Feature 5 (cover selection) is simpler and could inform the UI for feature 6 (photo reordering). Both operate on the same album management admin context.

**Wave 4 -- Sharing & Links (features 7, 8):**
Feature 7 (deep links) should come before feature 8 (OG tags) because OG tags become more valuable when there are photo-specific URLs to share. Feature 8 is the capstone that ties everything together.

---

## Complexity Summary

| #   | Feature                            | Complexity | Est. Effort | New Deps | Schema Change  |
| --- | ---------------------------------- | ---------- | ----------- | -------- | -------------- |
| 1   | EXIF metadata extraction & display | Low-Medium | 1-2 days    | exifr    | Yes (1 column) |
| 2   | Smooth transitions (srcSet)        | Low        | 0.5 day     | None     | No             |
| 3   | Touch gestures (zoom, pull-close)  | Low        | 0.5 day     | None     | No             |
| 4   | Full-screen mode                   | Very Low   | 0.5 day     | None     | No             |
| 5   | Album cover selection UI           | Low        | 0.5-1 day   | None     | No             |
| 6   | Drag reorder photos in album       | Medium     | 1-2 days    | None     | No             |
| 7   | Direct links to photos             | Low-Medium | 1 day       | None     | No             |
| 8   | OpenGraph meta tags                | Low        | 0.5-1 day   | None     | No             |

**Total estimated effort:** 5-8 days of implementation

---

## Sources

- [YARL Plugins](https://yet-another-react-lightbox.com/plugins) -- Fullscreen, Zoom, Captions plugin documentation
- [YARL Fullscreen Plugin](https://yet-another-react-lightbox.com/plugins/fullscreen) -- Fullscreen API, auto mode, ref API
- [YARL Documentation](https://yet-another-react-lightbox.com/documentation) -- Animation, controller, carousel options
- [Sharp Input Metadata](https://sharp.pixelplumbing.com/api-input/) -- metadata() method, EXIF buffer output
- [exifr on npm](https://www.npmjs.com/package/exifr) -- Selective EXIF tag parsing, performance
- [Next.js Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) -- generateMetadata, ImageResponse
- [Next.js generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) -- Dynamic metadata per route
- [dnd-kit Sortable](https://docs.dndkit.com/presets/sortable) -- Grid sorting, rectSortingStrategy
- [Next.js Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating) -- history.pushState integration
- [Flickr EXIF FAQ](https://www.flickrhelp.com/hc/en-us/articles/4404078521108-EXIF-data-FAQ) -- EXIF display patterns, privacy settings
- [500px Gear Pages](https://support.500px.com/hc/en-us/articles/115000759214-Gear-Pages-FAQ) -- Camera/lens metadata display

_Research completed: 2026-02-05_
_Confidence: HIGH -- All 8 features verified against existing codebase, YARL documentation, and Next.js APIs_
