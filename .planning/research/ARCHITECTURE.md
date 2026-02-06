# Architecture Patterns: v1.1 Feature Integration

**Domain:** Photography Portfolio Enhancement (v1.1)
**Researched:** 2026-02-05
**Overall confidence:** HIGH (features integrate with well-understood existing architecture)

## Executive Summary

The v1.1 features integrate into the existing Clean Architecture without requiring structural changes. Every new capability maps cleanly to existing layers: EXIF extraction extends the worker pipeline, lightbox enhancements are purely presentation-layer YARL plugin additions, album management features extend existing repository methods and admin UI patterns, and shareability features add new routes and metadata generation. No new external dependencies are needed beyond `exif-reader` (a small library the Sharp maintainer recommends for parsing Sharp's raw EXIF buffers).

The key architectural insight is that **five of eight features are isolated within a single layer**, making them independently buildable. Only EXIF metadata spans all four layers (infrastructure extraction, domain entity changes, database schema migration, and presentation display).

## Existing Architecture Reference

```
src/
  domain/
    entities/         Photo.ts, Album.ts (interfaces)
    repositories/     PhotoRepository.ts, AlbumRepository.ts (interfaces)
  application/
    services/         (empty - repositories instantiated directly in routes)
  infrastructure/
    auth/             JWT session, bcrypt password, rate limiter
    config/           Environment variables
    database/         SQLite client, Drizzle schema, repository implementations
    jobs/             BullMQ queues, worker entry, imageProcessor worker
    services/         imageService.ts (Sharp derivative generation)
    storage/          fileStorage.ts (save/delete originals and processed)
  presentation/
    components/       PhotoLightbox, AlbumGalleryClient, HomepageClient, etc.
    hooks/            (empty)
    lib/              uploadFile.ts
  app/
    (pages)           Public: /, /albums, /albums/[id]
    admin/            Protected: dashboard, photos/[id], albums, upload
    api/              admin/upload, admin/photos/[id], admin/albums/[id], images/[photoId]/[filename]
    actions/          auth.ts
```

**Critical existing patterns to preserve:**

- Server Components fetch data, pass serializable props to Client Components
- PhotoLightbox is dynamically imported (`ssr: false`) to avoid bundle bloat
- Image API route serves processed files from filesystem with immutable caching
- Worker updates photo status via repository after processing completes
- `photo_albums.sortOrder` column EXISTS in schema but is always set to 0 (never used yet)
- Album `coverPhotoId` column EXISTS and the PATCH API already accepts it

## Feature-by-Feature Integration Analysis

### Feature 1: EXIF Metadata Extraction and Display

**Layers touched:** All four (domain, infrastructure, database, presentation)
**Complexity:** MEDIUM - spans full stack but each layer change is straightforward

#### Domain Layer Changes

Extend the `Photo` entity with EXIF fields:

```typescript
// domain/entities/Photo.ts - ADD these optional fields
export interface Photo {
  // ... existing fields ...

  // EXIF metadata (populated by worker, null until processed)
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  focalLength: string | null; // e.g., "85mm"
  aperture: string | null; // e.g., "f/1.8"
  shutterSpeed: string | null; // e.g., "1/250"
  iso: number | null;
  takenAt: Date | null;
}
```

**Decision: Store EXIF as individual columns, not a JSON blob.** Individual columns enable future querying/filtering, are type-safe with Drizzle, and the set of fields is fixed and small (8 fields). A JSON blob would be simpler to add but sacrifices queryability.

#### Database Layer Changes

Add columns to `photos` table via ALTER TABLE migration:

```sql
ALTER TABLE photos ADD COLUMN camera_make TEXT;
ALTER TABLE photos ADD COLUMN camera_model TEXT;
ALTER TABLE photos ADD COLUMN lens_model TEXT;
ALTER TABLE photos ADD COLUMN focal_length TEXT;
ALTER TABLE photos ADD COLUMN aperture TEXT;
ALTER TABLE photos ADD COLUMN shutter_speed TEXT;
ALTER TABLE photos ADD COLUMN iso INTEGER;
ALTER TABLE photos ADD COLUMN taken_at INTEGER;  -- timestamp_ms
```

**CRITICAL:** Use `ALTER TABLE` directly, NOT `db:push`. The v1.0 project learned this the hard way -- `db:push` caused runtime errors in Phase 6. Write a migration script in `scripts/` that runs the ALTER TABLE statements.

Update Drizzle schema to include new columns, and update `toDomain`/`toDatabase` mappers in `SQLitePhotoRepository`.

#### Infrastructure Layer Changes

**New file:** `infrastructure/services/exifService.ts`

```typescript
// Extract EXIF from Sharp's raw buffer using exif-reader
import exifReader from "exif-reader";
import { getImageMetadata } from "./imageService";

export interface ExifData {
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: number | null;
  takenAt: Date | null;
}

export async function extractExif(originalPath: string): Promise<ExifData> {
  const metadata = await getImageMetadata(originalPath);
  if (!metadata.exif) return nullExifData();

  const exif = exifReader(metadata.exif);
  // Parse exif.image (Make, Model), exif.photo (FNumber, ExposureTime, ISO, LensModel, etc.)
  // Format human-readable strings: "f/1.8", "1/250", "85mm"
}
```

**Worker integration:** Add EXIF extraction to the existing `imageProcessor.ts` worker's job handler, between derivative generation and status update. The worker already has access to `originalPath` and already updates the photo record on completion. EXIF extraction adds ~50ms per image (negligible vs. derivative generation).

```
Current worker flow:          Proposed worker flow:
1. Generate derivatives       1. Generate derivatives
2. Generate blur placeholder  2. Generate blur placeholder
3. Update status to "ready"   3. Extract EXIF metadata
                              4. Update photo with EXIF + status "ready"
```

**New dependency:** `exif-reader` (npm package, recommended by Sharp's maintainer for parsing Sharp's raw EXIF buffer). Zero native dependencies, pure JavaScript, small footprint.

#### Presentation Layer Changes

Extend `PhotoLightbox` captions to show EXIF data below the description. YARL's Captions plugin already renders `description` text -- we can compose an EXIF summary string into the description, or use a custom render function.

**Better approach:** Use YARL's custom `render.slideFooter` to add an EXIF metadata bar below the image, separate from the description caption. This keeps concerns separated.

The `PhotoData` interface passed to lightbox components needs EXIF fields added. The Server Component in `albums/[id]/page.tsx` already fetches photos -- just include the new fields in the serialized props.

**Confidence:** HIGH -- Sharp metadata API is documented, exif-reader is the officially recommended parser, YARL supports custom render functions.

---

### Feature 2: Lightbox Smooth Transitions

**Layers touched:** Presentation only
**Complexity:** LOW - configuration change

The existing `PhotoLightbox.tsx` already configures YARL's animation settings:

```typescript
animation={{
  fade: 200,
  swipe: 300,
}}
```

This feature is about tuning these values for a smoother feel. Options:

- Increase `fade` to 250-350ms for smoother cross-fade
- Adjust `swipe` timing for gesture completion
- Add `easing` configuration if YARL supports it

**No new components needed.** This is a CSS/config tuning task on the existing PhotoLightbox component.

**Confidence:** HIGH -- Already using YARL animation config, just needs tuning.

---

### Feature 3: Touch Gestures (Swipe) for Mobile

**Layers touched:** Presentation only
**Complexity:** LOW - YARL has built-in support

YARL already supports swipe gestures out of the box. The current configuration explicitly disables some:

```typescript
controller={{
  closeOnBackdropClick: false,
  closeOnPullDown: false,   // <-- swipe down to close
  closeOnPullUp: false,     // <-- swipe up to close
}}
```

To enable touch gestures:

1. Set `closeOnPullDown: true` for swipe-down-to-close
2. YARL's carousel already supports swipe left/right for navigation (enabled by default)
3. Consider enabling `closeOnBackdropClick: true` for mobile tap-to-close

**No new dependencies needed.** YARL handles touch events internally.

**Confidence:** HIGH -- YARL docs confirm built-in gesture support.

---

### Feature 4: Full-Screen Mode for Lightbox

**Layers touched:** Presentation only
**Complexity:** LOW - add YARL Fullscreen plugin

YARL ships a Fullscreen plugin that uses the browser's Fullscreen API. Integration:

```typescript
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";

<Lightbox
  plugins={[Captions, Fullscreen]}
  // Optional: auto-enter fullscreen on open
  fullscreen={{ auto: false }}
/>
```

The Fullscreen plugin adds an enter/exit button to the toolbar automatically. No custom UI needed.

**Existing YARL version (3.28.0) includes this plugin** -- no version upgrade needed.

**Confidence:** HIGH -- YARL official documentation, plugin is bundled with the installed package.

---

### Feature 5: Album Cover Image Selection

**Layers touched:** Presentation (admin UI), API (already exists)
**Complexity:** LOW - API endpoint already handles this

**The PATCH API for albums already accepts `coverPhotoId`:**

```typescript
// api/admin/albums/[id]/route.ts - ALREADY EXISTS
const updateAlbumSchema = z.object({
  coverPhotoId: z.string().nullable().optional(),
  // ... other fields
});
```

**The public albums page already resolves cover photos:**

```typescript
// app/albums/page.tsx - ALREADY EXISTS
let coverPhotoId = album.coverPhotoId;
if (!coverPhotoId) {
  const photos = await photoRepo.findByAlbumId(album.id);
  coverPhotoId = readyPhoto?.id ?? null;
}
```

What's MISSING is an admin UI to select the cover photo. Options:

**Option A (Recommended): Add "Set as Cover" button on each photo in the album view.**
The admin photo detail page (`admin/photos/[id]`) shows album membership. But cover selection is more natural from the album context -- seeing all photos and picking one.

**Option B: Dropdown/modal in album edit form.**
Less visual but simpler to implement within the existing `AlbumCreateModal` component.

**Recommended approach:** Add a dedicated admin album detail page (`admin/albums/[id]`) that shows the album's photos as a grid. Each photo gets a "Set as Cover" button. This page also serves as the foundation for Feature 6 (photo reordering within album).

**New components needed:**

- `app/admin/(protected)/albums/[id]/page.tsx` -- Server Component, fetches album + photos
- `presentation/components/AlbumDetailClient.tsx` -- Client Component with cover selection UI

**Confidence:** HIGH -- API already supports this, just needs admin UI.

---

### Feature 6: Drag to Reorder Photos Within Album

**Layers touched:** Domain (repository interface), Infrastructure (repository implementation, schema), Presentation (admin UI), API (new endpoint)
**Complexity:** MEDIUM - requires new admin page + new API endpoint + leveraging unused schema column

#### Key Finding: photo_albums.sortOrder Already Exists But Is Unused

The junction table `photo_albums` already has a `sortOrder` column (integer, default 0). Currently:

- `addToAlbum()` always sets `sortOrder: 0`
- `findByAlbumId()` does NOT order by `sortOrder`

This means the schema is ready but the data access ignores ordering.

#### Changes Needed

**1. Repository interface:** Add method to `PhotoRepository`:

```typescript
updatePhotoSortOrdersInAlbum(albumId: string, photoIds: string[]): Promise<void>;
```

**2. Repository implementation:** Update `findByAlbumId` to ORDER BY `photo_albums.sortOrder`:

```typescript
// SQLitePhotoRepository.ts - MODIFY existing method
async findByAlbumId(albumId: string): Promise<Photo[]> {
  const results = await db
    .select({ photo: photos })
    .from(photos)
    .innerJoin(photoAlbums, eq(photos.id, photoAlbums.photoId))
    .where(eq(photoAlbums.albumId, albumId))
    .orderBy(photoAlbums.sortOrder);  // <-- ADD THIS
  return results.map((r) => this.toDomain(r.photo));
}
```

Add new method to update sort orders (same pattern as `AlbumRepository.updateSortOrders`):

```typescript
async updatePhotoSortOrdersInAlbum(albumId: string, photoIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < photoIds.length; i++) {
      await tx
        .update(photoAlbums)
        .set({ sortOrder: i })
        .where(and(eq(photoAlbums.albumId, albumId), eq(photoAlbums.photoId, photoIds[i])));
    }
  });
}
```

**3. API endpoint:** New route `POST /api/admin/albums/[id]/reorder` accepting `{ photoIds: string[] }`.

**4. Admin UI:** Reuse the existing dnd-kit pattern from `AlbumsPageClient` (already uses `@dnd-kit/core` + `@dnd-kit/sortable`). The admin album detail page from Feature 5 gets a draggable photo grid.

**No new dependencies needed.** `@dnd-kit/core` and `@dnd-kit/sortable` already installed.

**Confidence:** HIGH -- Schema column exists, dnd-kit pattern already proven in the codebase.

---

### Feature 7: Direct Links to Specific Photos

**Layers touched:** App Router (new route), Presentation (lightbox opening logic)
**Complexity:** MEDIUM - requires careful URL design and route architecture

#### URL Scheme Design

**Option A: Query parameter approach** (simpler)

```
/albums/[albumId]?photo=[photoId]
```

- Pro: No new routes needed, lightbox opens from existing album page
- Pro: Easy to implement -- read query param, find photo index, open lightbox
- Con: Less clean URL for sharing

**Option B: Nested route approach** (cleaner)

```
/albums/[albumId]/photos/[photoId]
```

- Pro: Clean, semantic URL
- Pro: Can render dedicated photo page for SEO/OG tags
- Con: Requires new route files

**Option C: Intercepting routes** (most sophisticated)

```
/photos/[photoId]           -- Direct access: full page render
/albums/[albumId]           -- Clicking photo: modal overlay via intercepting route
```

- Pro: Instagram-like UX (modal in gallery, full page on direct link)
- Con: Complex route structure, harder to maintain

**Recommendation: Option B** -- Clean URLs for sharing, dedicated page enables OG tags (Feature 8), and the implementation is straightforward. When accessed directly, render a full page with photo + lightbox open. Include a "Back to Album" link for context.

#### Route Structure

```
app/
  albums/
    [id]/
      page.tsx                    -- Existing album gallery
      photos/
        [photoId]/
          page.tsx                -- NEW: direct photo page
```

The new photo page:

1. Server Component fetches photo + album context
2. Renders with lightbox pre-opened at the correct index
3. Includes `generateMetadata()` for OG tags (Feature 8)
4. "Back to Album" navigation link

**Alternative approach for the lightbox integration:** Rather than pre-opening the lightbox, the direct photo page could render a dedicated single-photo view (large image + EXIF + description) and link back to the album. This might be better UX since the lightbox carousel doesn't make as much sense without the gallery context.

#### Client-Side URL Sync

Update `AlbumGalleryClient` to sync the lightbox state with the URL using `window.history.pushState`:

- Opening lightbox: push `/albums/[id]/photos/[photoId]` to history
- Navigating between photos: replace state with new photoId
- Closing lightbox: pop back to `/albums/[id]`

This gives shareable URLs while maintaining the SPA lightbox experience.

**Confidence:** MEDIUM -- URL scheme choice is a design decision, implementation patterns are well-established.

---

### Feature 8: OpenGraph Meta Tags for Social Sharing

**Layers touched:** App Router (metadata generation), Infrastructure (OG image generation)
**Complexity:** MEDIUM - Next.js has excellent built-in support

#### Approach: generateMetadata + opengraph-image.tsx

Next.js App Router provides two mechanisms:

**1. `generateMetadata()` for text metadata:**

```typescript
// app/albums/[id]/photos/[photoId]/page.tsx
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id: albumId, photoId } = await params;
  const photo = await photoRepo.findById(photoId);
  const album = await albumRepo.findById(albumId);

  return {
    title: photo.title || `Photo - ${album.title}`,
    description: photo.description || `View this photo in ${album.title}`,
    openGraph: {
      title: photo.title || album.title,
      description: photo.description || undefined,
      images: [`/api/images/${photoId}/1200w.webp`],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}
```

**2. For OG images, point directly to existing processed images.**
The processed derivatives at 1200w are ideal for OG images (1200px width matches Facebook's recommended 1200x630). No need for a custom `opengraph-image.tsx` that generates images with Satori -- the actual photo IS the OG image.

**Key insight:** Unlike blog posts that need generated OG images (title text overlaid on background), a photo portfolio's OG image IS the photo itself. Just reference the existing 1200w derivative.

#### Pages That Need OG Tags

| Route                           | OG Title                  | OG Image                          |
| ------------------------------- | ------------------------- | --------------------------------- |
| `/` (homepage)                  | Portfolio name            | Hero photo or site default        |
| `/albums`                       | "Albums"                  | First album cover or site default |
| `/albums/[id]`                  | Album title               | Album cover photo                 |
| `/albums/[id]/photos/[photoId]` | Photo title or album name | The photo itself (1200w)          |

**For the homepage and album listing**, use static metadata or `generateMetadata` with the first available photo.

**For album pages**, add `generateMetadata` to the existing `albums/[id]/page.tsx` Server Component.

**For direct photo links**, `generateMetadata` in the new photo page (Feature 7).

**Confidence:** HIGH -- Next.js generateMetadata is well-documented, existing processed images serve as OG images.

---

## New Components Summary

### New Files to Create

| File                                            | Layer          | Feature         | Purpose                                         |
| ----------------------------------------------- | -------------- | --------------- | ----------------------------------------------- |
| `infrastructure/services/exifService.ts`        | Infrastructure | EXIF            | Parse EXIF from Sharp's raw buffer              |
| `scripts/migrate-exif-columns.ts`               | Infrastructure | EXIF            | ALTER TABLE migration script                    |
| `app/admin/(protected)/albums/[id]/page.tsx`    | App Router     | Cover + Reorder | Admin album detail page                         |
| `presentation/components/AlbumDetailClient.tsx` | Presentation   | Cover + Reorder | Drag-to-reorder photo grid with cover selection |
| `app/albums/[id]/photos/[photoId]/page.tsx`     | App Router     | Direct Links    | Public direct photo page                        |
| `api/admin/albums/[id]/reorder/route.ts`        | App Router     | Reorder         | Photo reorder endpoint                          |

### Existing Files to Modify

| File                                                            | Feature                                    | Change                                                       |
| --------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `domain/entities/Photo.ts`                                      | EXIF                                       | Add 8 optional EXIF fields                                   |
| `infrastructure/database/schema.ts`                             | EXIF                                       | Add EXIF columns to Drizzle schema                           |
| `infrastructure/database/repositories/SQLitePhotoRepository.ts` | EXIF + Reorder                             | Add EXIF to mappers, add reorder method, order findByAlbumId |
| `domain/repositories/PhotoRepository.ts`                        | Reorder                                    | Add `updatePhotoSortOrdersInAlbum` method                    |
| `infrastructure/jobs/workers/imageProcessor.ts`                 | EXIF                                       | Add EXIF extraction step to worker                           |
| `infrastructure/jobs/queues.ts`                                 | EXIF                                       | Add EXIF fields to `ImageJobResult`                          |
| `presentation/components/PhotoLightbox.tsx`                     | Transitions + Gestures + Fullscreen + EXIF | Add plugins, tune animation, add EXIF display                |
| `presentation/components/AlbumGalleryClient.tsx`                | Direct Links                               | URL sync with lightbox state                                 |
| `presentation/components/HomepageClient.tsx`                    | Direct Links                               | URL sync with lightbox state (optional)                      |
| `app/albums/[id]/page.tsx`                                      | OG Tags                                    | Add `generateMetadata` export                                |
| `app/layout.tsx`                                                | OG Tags                                    | Update default metadata                                      |
| `app/page.tsx`                                                  | OG Tags                                    | Add `generateMetadata` export                                |
| `app/albums/page.tsx`                                           | OG Tags                                    | Add `generateMetadata` export                                |

### No Changes Needed

| Component                                      | Reason                    |
| ---------------------------------------------- | ------------------------- |
| `infrastructure/auth/`                         | No auth changes           |
| `infrastructure/storage/fileStorage.ts`        | No storage format changes |
| `infrastructure/config/env.ts`                 | No new env vars needed    |
| `proxy.ts`                                     | No middleware changes     |
| `app/api/admin/upload/route.ts`                | Upload flow unchanged     |
| `app/api/images/[photoId]/[filename]/route.ts` | Image serving unchanged   |

---

## Data Flow Changes

### EXIF Flow (New)

```
Upload (unchanged)
       |
       v
Worker picks up job
       |
       v
Generate derivatives (existing)
       |
       v
Generate blur placeholder (existing)
       |
       v
Extract EXIF metadata (NEW)  <-- exifService.ts
  |-- sharp.metadata() returns raw EXIF buffer
  |-- exif-reader parses buffer into structured data
  |-- Format human-readable strings
       |
       v
Update photo record with EXIF + status "ready" (modified)
  |-- Existing: blurDataUrl, status
  |-- New: cameraMake, cameraModel, lensModel, etc.
       |
       v
Server Component fetches photo (unchanged query, more fields)
       |
       v
Client Component receives EXIF in props (new data)
       |
       v
Lightbox displays EXIF bar (new UI element)
```

### Direct Photo Link Flow (New)

```
User shares URL: /albums/abc/photos/xyz
       |
       v
Server Component (new page):
  |-- Fetch photo by ID
  |-- Fetch album by ID
  |-- Fetch all album photos (for navigation context)
  |-- Verify photo is in album, album is published
  |-- generateMetadata() returns OG tags
       |
       v
Render dedicated photo page:
  |-- Large photo display
  |-- EXIF metadata
  |-- Description
  |-- "View in Album" link
  |-- Next/Previous navigation to adjacent photos
```

### Photo Reorder Flow (New, modeled on existing album reorder)

```
Admin opens album detail page
       |
       v
Server Component fetches album photos (sorted by sortOrder)
       |
       v
Client Component renders draggable photo grid
       |
       v
Admin drags photo to new position
       |
       v
Optimistic UI update (same pattern as AlbumsPageClient)
       |
       v
POST /api/admin/albums/[id]/reorder { photoIds: [...] }
       |
       v
Repository updates photo_albums.sortOrder in transaction
       |
       v
Public album page automatically reflects new order
```

---

## Suggested Build Order

The build order is driven by two factors: (1) dependency chains between features, and (2) risk/complexity ordering (hardest first).

### Phase 1: EXIF Metadata (hardest, spans all layers, foundation for display features)

**Why first:** EXIF touches every layer and requires a database migration. Building this first establishes the migration pattern for subsequent changes. The EXIF data is also needed for the lightbox display (Phase 2) and OG tags (Phase 4).

**Subtasks:**

1. Database migration script (ALTER TABLE)
2. Update Drizzle schema + Photo entity + repository mappers
3. Create exifService.ts
4. Integrate EXIF extraction into worker
5. Verify end-to-end: upload photo, check EXIF in database

### Phase 2: Lightbox Polish (transitions, gestures, fullscreen, EXIF display)

**Why second:** All presentation-layer changes to the existing PhotoLightbox component. Grouped together because they all modify the same file. EXIF display depends on Phase 1 data being available.

**Subtasks:**

1. Add Fullscreen + Zoom plugins to PhotoLightbox
2. Tune animation timings (transitions)
3. Enable gesture controls (swipe to close)
4. Add EXIF metadata display in lightbox (depends on Phase 1)

### Phase 3: Album Management (cover selection, photo reordering)

**Why third:** Both features require a new admin album detail page. Building them together avoids creating the page twice. Neither depends on Phase 1 or 2.

**Subtasks:**

1. Create admin album detail page with photo grid
2. Add "Set as Cover" functionality
3. Add drag-to-reorder with dnd-kit
4. Create reorder API endpoint
5. Fix findByAlbumId to ORDER BY sortOrder

### Phase 4: Shareability (direct links, OG tags)

**Why last:** Direct photo links require the new route structure, and OG tags benefit from having EXIF data (Phase 1) available. These are the most user-facing polish features.

**Subtasks:**

1. Create direct photo page route
2. Add URL sync to lightbox in album gallery
3. Add generateMetadata to all public pages
4. Test OG tags with social media preview tools

### Dependency Graph

```
Phase 1: EXIF Metadata
    |
    +--> Phase 2: Lightbox Polish (needs EXIF data for display)
    |
    +--> Phase 4: Shareability (OG tags benefit from EXIF/photo data)

Phase 3: Album Management (independent, can run in parallel with Phase 2)
    |
    +--> Phase 4: Shareability (direct links need album photo ordering to work)
```

**Phases 2 and 3 are independent of each other** and could theoretically run in parallel, but sequential execution is recommended for a single-developer project.

---

## Anti-Patterns to Avoid

### Anti-Pattern: JSON Blob for EXIF Data

**What:** Storing all EXIF as a single JSON column instead of individual fields.
**Why tempting:** Fewer ALTER TABLE statements, flexible schema.
**Why bad:** Cannot query by camera model, cannot sort by date taken, Drizzle type safety lost. The set of display fields is fixed (8 fields) and will not grow unpredictably.
**Instead:** Use individual typed columns.

### Anti-Pattern: Custom Lightbox Gestures

**What:** Implementing swipe/pinch gesture handlers from scratch.
**Why tempting:** More control over behavior.
**Why bad:** Touch event handling is notoriously complex (preventing default scroll, handling multi-touch, momentum). YARL already handles this well.
**Instead:** Use YARL's built-in gesture support and plugin system.

### Anti-Pattern: Intercepting Routes for Direct Links

**What:** Using Next.js intercepting routes (`(.)photos/[id]`) for the modal-overlay pattern.
**Why tempting:** Instagram-like UX where clicking opens a modal but direct URL shows a full page.
**Why bad:** Intercepting routes add significant complexity to the route structure, are harder to reason about, and have edge cases with back/forward navigation. The portfolio is a simple gallery, not a social media app.
**Instead:** Use dedicated photo pages with clean URLs. Keep the lightbox as the in-page viewing experience.

### Anti-Pattern: Running db:push for Schema Changes

**What:** Using `drizzle-kit push` to apply schema changes to existing database.
**Why bad:** Learned in v1.0 Phase 6 -- `db:push` caused runtime errors. It may drop and recreate tables, losing data.
**Instead:** Always use `ALTER TABLE` migration scripts for existing databases.

---

## Sources

### Authoritative (HIGH confidence)

- [Sharp API - metadata()](https://sharp.pixelplumbing.com/api-input/) -- Returns raw EXIF buffer, requires separate parsing
- [Sharp GitHub Issue #285](https://github.com/lovell/sharp/issues/285) -- Sharp maintainer recommends exif-reader for parsing EXIF buffers
- [YARL Plugins Documentation](https://yet-another-react-lightbox.com/plugins) -- Fullscreen, Zoom, Slideshow, Captions all bundled
- [YARL Fullscreen Plugin](https://yet-another-react-lightbox.com/plugins/fullscreen) -- Configuration options, ref API
- [YARL Zoom Plugin](https://yet-another-react-lightbox.com/plugins/zoom) -- Pinch zoom, scroll zoom, double-click zoom
- [YARL Next.js Example](https://yet-another-react-lightbox.com/examples/nextjs) -- Custom render.slide with next/image
- [Next.js generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) -- Dynamic OG metadata generation
- [Next.js Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) -- File conventions, ImageResponse API

### Project-Specific (HIGH confidence -- verified by reading codebase)

- `photo_albums.sortOrder` exists in schema but is unused (always 0, findByAlbumId unordered)
- Album PATCH API already accepts `coverPhotoId` updates
- YARL v3.28.0 installed, includes Fullscreen/Zoom/Slideshow plugins bundled
- @dnd-kit/core + @dnd-kit/sortable already installed (used for album reordering)
- Sharp v0.34.5 installed, metadata() API returns raw EXIF buffer
- v1.0 established ALTER TABLE migration pattern (Phase 6 lesson learned)
