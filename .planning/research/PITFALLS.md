# Domain Pitfalls: v1.1 Enhancement Features

**Domain:** Photography portfolio enhancements (EXIF, lightbox, reordering, social sharing)
**Researched:** 2026-02-05
**Scope:** Adding features to an existing, working v1.0 system
**Confidence:** HIGH for codebase-specific pitfalls, MEDIUM for library-specific pitfalls

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or broken existing functionality.

### Pitfall 1: EXIF GPS Data Leaking to Public Visitors

**What goes wrong:** Extracting EXIF metadata from uploaded photos and displaying all of it publicly, including GPS coordinates that reveal the photographer's home, clients' locations, or private venues.

**Why it happens:** EXIF extraction returns dozens of fields. Developers display everything to look complete, not realizing GPS lat/long is embedded in most phone photos and many DSLR images with GPS modules.

**Consequences:**

- Privacy violation for the photographer and subjects
- Legal liability (GDPR, location data is PII)
- Location of private shoots exposed publicly

**Warning signs:**

- EXIF display includes "GPSLatitude", "GPSLongitude", or "GPSPosition" fields
- No explicit allowlist of which fields to show
- Using a library's "parse everything" mode without filtering output

**Prevention:**

- Use a strict allowlist approach: only display camera make, model, lens, focal length, aperture (f-stop), shutter speed, ISO, and date taken
- Never display: GPS coordinates, serial numbers, software versions, owner name, unique image ID
- Strip GPS from the EXIF buffer stored in the database (extract and discard, do not persist)
- Consider stripping EXIF from served derivative images entirely (Sharp's `withMetadata()` preserves ICC profiles without EXIF)

**Detection:** Review the stored EXIF JSON/fields and confirm GPS data is absent. Search for "GPS" in any metadata stored in the database.

**Phase relevance:** Must be addressed when implementing EXIF extraction. Build the allowlist into the extraction step, not as a display-time filter.

---

### Pitfall 2: Schema Migration Breaking Existing Data

**What goes wrong:** Adding new columns (EXIF fields, photo sort order within albums, etc.) to the SQLite database causes data loss or runtime errors.

**Why it happens:** The project has a known pattern where `db:push` (Drizzle Kit push) can fail on SQLite ALTER TABLE operations. During v1.0 Phase 6, this caused runtime errors. The project's MEMORY.md explicitly warns: "Always use ALTER TABLE directly, never db:push."

**THIS PROJECT'S SPECIFIC RISK:** The `initializeDatabase()` function in `src/infrastructure/database/client.ts` uses `CREATE TABLE IF NOT EXISTS`. If tables already exist (they do), new columns added to the schema file are NOT reflected in the actual database. The Drizzle schema already has `tags` in albums that is NOT in the `CREATE TABLE` statement -- evidence of existing schema drift.

**Consequences:**

- Adding EXIF columns to the `photos` table requires manual ALTER TABLE
- `db:push` may try to recreate the table, losing all photo records
- Runtime errors from Drizzle querying columns that do not exist in SQLite

**Warning signs:**

- "no such column" errors at runtime
- Drizzle Kit push output showing "DROP TABLE" and "CREATE TABLE" instead of "ALTER TABLE"
- Schema file says column exists but `SELECT` fails

**Prevention:**

- Write explicit `ALTER TABLE photos ADD COLUMN` SQL migration for each new field
- Run migrations BEFORE updating the Drizzle schema to match
- Add new columns as nullable (SQLite requires this for ALTER TABLE ADD COLUMN)
- Backfill existing rows after adding column
- Test migration on a copy of the production database first
- Keep the `initializeDatabase()` CREATE TABLE statements in sync with schema (or remove them in favor of migration-only approach)

**Detection:** After migration, verify with `PRAGMA table_info(photos)` that all expected columns exist.

**Phase relevance:** Must be the FIRST step of any phase that adds database columns. EXIF metadata storage is the primary trigger.

---

### Pitfall 3: Sharp EXIF Returns Raw Buffer, Not Parsed Object

**What goes wrong:** Developers call `sharp(image).metadata()` expecting parsed EXIF fields like `{ camera: "Canon EOS R5", aperture: "f/2.8" }` but receive `{ exif: <Buffer ...> }` -- a raw binary buffer requiring a second parsing step.

**Why it happens:** Sharp's `metadata()` function returns image dimensions, format, color space, and orientation as parsed fields, but EXIF, IPTC, and XMP data are returned as raw buffers. The only parsed EXIF value is the orientation integer.

**Consequences:**

- EXIF feature appears to work in testing (metadata returns something) but camera/lens/settings fields are absent
- Developers waste time trying to decode the buffer manually
- Falls back to displaying only width/height/format (not what photographers want)

**Warning signs:**

- `metadata.exif` is a Buffer, not an object
- Camera make/model fields are undefined
- Only `metadata.width`, `metadata.height`, `metadata.orientation` are populated

**Prevention:**

- Use a dedicated EXIF parsing library to decode Sharp's raw EXIF buffer:
  - `exifr` (recommended: fastest at 2.5ms/file, reads buffers directly, 497K weekly downloads)
  - `exif-reader` (lightweight alternative, 62K weekly downloads, designed to parse Sharp's EXIF buffer)
  - `exifreader` (most configurable bundle size, 91K weekly downloads)
- Extract EXIF during the image processing worker job (not at upload time, not at display time)
- Parse the buffer once, store the relevant fields as JSON in the database

**Detection:** In development, log `typeof metadata.exif` and confirm it is `Buffer`. Verify your parsing library can read it.

**Phase relevance:** EXIF extraction implementation. Choose the parsing library early and validate with real camera files.

---

### Pitfall 4: Photo Reordering Breaks Public Gallery Sort Order

**What goes wrong:** Adding drag-to-reorder for photos within an album works in the admin panel but the public album page shows photos in the wrong order (or the order keeps reverting).

**THIS PROJECT'S SPECIFIC RISK:** The `photo_albums` junction table already has a `sortOrder` column, BUT the `SQLitePhotoRepository.findByAlbumId()` method does NOT order by it. The query at line 22-28 of `SQLitePhotoRepository.ts` joins `photos` with `photo_albums` but has no `.orderBy()` clause. Similarly, `addToAlbum()` hardcodes `sortOrder: 0` for all new entries.

**Consequences:**

- Admin reorders photos, saves successfully, but public page shows arbitrary order
- Photos appear in insertion order (SQLite default) rather than explicit sort order
- Reorder state is persisted to the database but never read back

**Warning signs:**

- After reordering in admin, refreshing the public album page shows old order
- All photos in `photo_albums` have `sortOrder = 0`
- `findByAlbumId` returns results in inconsistent order

**Prevention:**

- Add `.orderBy(asc(photoAlbums.sortOrder))` to `findByAlbumId()`
- Create a `updatePhotoSortOrders(albumId, photoIds)` repository method (parallel to existing `updateSortOrders` for albums)
- When adding a photo to an album, set `sortOrder` to `MAX(sortOrder) + 1` for that album (not hardcoded 0)
- Create an API endpoint for photo reorder (similar to existing `/api/admin/albums/reorder`)
- Test: reorder photos, refresh public page, confirm order matches

**Detection:** Query `SELECT photo_id, sort_order FROM photo_albums WHERE album_id = ? ORDER BY sort_order` and verify values are sequential, not all zeros.

**Phase relevance:** Photo reordering feature. Fix `findByAlbumId` ordering BEFORE building the reorder UI, or the UI will appear broken on first test.

---

### Pitfall 5: Deep Links Break Browser Back Button

**What goes wrong:** Adding direct links to specific photos (e.g., `/albums/abc?photo=xyz`) causes the browser back button to cycle through every photo the user viewed in the lightbox instead of returning to the gallery.

**Why it happens:** Each photo navigation in the lightbox pushes a new history entry via `history.pushState()`. User opens lightbox, swipes through 15 photos, then has to press back 15 times to return to the album grid.

**Consequences:**

- Extremely frustrating user experience
- Users abandon the site rather than clicking back repeatedly
- Breaks expected browser navigation pattern

**Warning signs:**

- Each swipe/arrow-key in lightbox changes the URL
- `window.history.length` increases rapidly during lightbox use
- Back button returns to previous photo, not to gallery

**Prevention:**

- Use `history.replaceState()` for lightbox navigation (replaces current entry, does not add new entries)
- Use `history.pushState()` ONLY when opening the lightbox (so back button closes it)
- On lightbox close, `history.replaceState()` back to the clean album URL (remove photo param)
- Alternative: use URL hash (`#photo=xyz`) with `hashchange` event -- hashes do not add to history when replaced
- Test: open lightbox, navigate 10 photos, press back once -- should return to gallery grid

**Detection:** Open lightbox, navigate several photos, check `window.history.length` -- if it increased by more than 1, the history stack is polluted.

**Phase relevance:** Direct photo linking feature. Must be designed correctly from the start; retrofitting history behavior is painful.

---

## Moderate Pitfalls

Mistakes that cause delays, rework, or noticeable quality issues.

### Pitfall 6: Fullscreen Mode Fails Silently on iPhone Safari

**What goes wrong:** The fullscreen button appears but does nothing on iPhone, or worse, is hidden entirely with no explanation. Users on iPhones (a significant portion of photography portfolio visitors) cannot access fullscreen mode.

**Why it happens:** iPhone Safari does not support the Fullscreen API at all. YARL's Fullscreen plugin detects this and hides the button automatically -- but if the feature is marketed as "fullscreen mode," iPhone users feel they are missing functionality.

**Consequences:**

- Feature gap on a major platform
- User confusion about missing button
- Wasted development time if fullscreen was a primary feature goal

**Warning signs:**

- Fullscreen button disappears on iOS testing
- No console errors (it is detected and handled silently)
- Works on iPad Safari but not iPhone Safari

**Prevention:**

- Do NOT promise fullscreen as a headline feature -- it is desktop/Android only
- On iOS, implement a "cinema mode" alternative: hide navigation/header, expand image to viewport, use dark background
- YARL's Fullscreen plugin is still worth using for desktop -- just do not rely on it as the only immersive viewing mode
- Set `fullscreen.auto: false` (do not auto-enter fullscreen on lightbox open)
- Test on actual iPhone hardware, not just Chrome DevTools mobile emulation

**Detection:** Test on iPhone Safari. If the fullscreen button is absent, the browser does not support the API.

**Phase relevance:** Lightbox enhancement phase. Design the immersive viewing experience to work WITHOUT the Fullscreen API as the baseline.

---

### Pitfall 7: Touch Gesture Conflicts with dnd-kit Sortable

**What goes wrong:** In the admin photo reorder UI, touch-based drag conflicts with native scrolling. Users try to scroll the photo grid on mobile but accidentally start dragging photos, or they try to drag but the page scrolls instead.

**THIS PROJECT'S SPECIFIC RISK:** The existing album reorder in `AlbumsPageClient.tsx` uses `PointerSensor` and `KeyboardSensor` only. `PointerSensor` does not distinguish between scroll intent and drag intent on touchscreens, causing the documented dnd-kit issue where "sortable not working correctly when using touchscreens" (GitHub issue #834).

**Consequences:**

- Admin cannot reorder photos on mobile/tablet
- Scrolling becomes impossible in the reorder view
- Touch users experience janky, unpredictable behavior

**Warning signs:**

- Touching a photo card starts dragging when user intended to scroll
- Cannot scroll down in a long photo list on touch devices
- Drag starts on the first touch (no activation delay)

**Prevention:**

- Use `TouchSensor` instead of or alongside `PointerSensor` for the reorder UI
- Configure activation constraints: `{ delay: 250, tolerance: 5 }` (250ms press-and-hold before drag starts, 5px movement tolerance)
- Add visual affordance: a dedicated drag handle (grip icon) that activates dragging, while the rest of the card scrolls normally
- Use `MouseSensor` for desktop and `TouchSensor` for mobile (not `PointerSensor` for both)
- The existing album reorder may also need this fix

**Detection:** Test on a real touch device (not just Chrome DevTools). Try scrolling a list of 20+ photos.

**Phase relevance:** Photo reordering feature. Also consider retroactively fixing the album reorder while implementing photo reorder.

---

### Pitfall 8: OpenGraph Images Not Served Correctly for Crawlers

**What goes wrong:** Social media previews show a broken image, a generic fallback, or nothing at all when sharing an album or photo link.

**Why it happens:** Multiple common mistakes:

1. OG image URL is a relative path (must be absolute with domain)
2. OG image is behind authentication (crawlers cannot access `/api/images/...` if behind proxy)
3. OG image is AVIF/WebP format (some crawlers only support JPEG/PNG)
4. OG image is too large or too small for the platform

**THIS PROJECT'S SPECIFIC RISK:** The app serves images only in WebP and AVIF format through `/api/images/[photoId]/[filename]`. Social media crawlers (Facebook, Twitter, LinkedIn) have limited format support. Facebook supports WebP but Twitter/LinkedIn may not render AVIF. Additionally, the current image serving requires knowing the exact filename (e.g., `600w.webp`), which is not a pattern OG image URLs typically follow.

**Consequences:**

- Shared links look broken or generic on social media
- Reduces click-through rates dramatically
- Professional photographers need their images to preview beautifully when shared

**Warning signs:**

- Facebook Sharing Debugger shows "Could not scrape URL" or "Image not found"
- Twitter Card Validator shows no image preview
- OG image works locally but not on deployed site

**Prevention:**

- Serve OG images in JPEG or PNG format (maximum compatibility) -- generate one OG-specific derivative
- Use absolute URLs in meta tags: `https://yourdomain.com/api/og/album/[id]`
- Create a dedicated OG image API route that serves JPEG, separate from the main image API
- OG image dimensions: 1200x630 pixels (standard across all platforms)
- Ensure the OG image route is NOT behind authentication (the proxy.ts only protects `/admin/*`, so public routes should work, but verify)
- Use Next.js `generateMetadata()` in server components -- it is supported in App Router and resolves before HTML is sent
- Test with: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/), [Twitter Card Validator](https://cards-dev.twitter.com/validator)

**Detection:** Use `curl -I` on the OG image URL and verify it returns 200 with a `Content-Type` of `image/jpeg` or `image/png`.

**Phase relevance:** OpenGraph implementation. Must generate JPEG derivatives specifically for OG use, not reuse WebP/AVIF.

---

### Pitfall 9: EXIF Extraction Happening at Wrong Time in Pipeline

**What goes wrong:** EXIF metadata is extracted at upload time (in the API route) or at display time (in the server component), instead of during the background worker job.

**Why it happens:** Seems natural to extract EXIF "when we have the file" (upload) or "when we need it" (render).

**Consequences if extracted at upload time:**

- Upload API route becomes slower (EXIF parsing adds 2-50ms per file depending on library)
- Original file must be read twice (once for upload, once for processing)
- If extraction fails, the upload fails too

**Consequences if extracted at display time:**

- Original file must be accessible from the web server (it may only be on the worker machine in production)
- Reading a 50MP file's EXIF on every page load is wasteful
- Creates a dependency between the display layer and the filesystem

**THIS PROJECT'S SPECIFIC RISK:** The worker already calls `sharp(inputPath).metadata()` to get dimensions (for the no-upscale check). Adding EXIF extraction here is a natural extension. The worker has access to the original file path and already writes results back to the database.

**Prevention:**

- Extract EXIF in the image processing worker, alongside derivative generation
- Parse the EXIF buffer from `sharp(inputPath).metadata().exif` using exifr or exif-reader
- Store parsed fields as a JSON column on the `photos` table
- On display, read from database (already available in photo queries)
- If extraction fails for a particular image, log it and continue -- do not fail the entire processing job

**Detection:** Check where the EXIF extraction call lives. If it is outside the worker, move it.

**Phase relevance:** EXIF extraction implementation. Decide on extraction location before coding.

---

### Pitfall 10: Lightbox Transition Customization Fighting YARL Defaults

**What goes wrong:** Attempting to implement custom smooth transitions (crossfade, zoom-from-thumbnail) by overriding YARL's built-in animation system creates flickering, double-rendering, or animation conflicts.

**Why it happens:** YARL has its own animation system with `fade` and `swipe` timing. The existing PhotoLightbox component already configures these at lines 56-59. Adding CSS transitions on top of YARL's JavaScript-driven animations creates two animation systems fighting each other.

**Consequences:**

- Images flicker or flash white during transitions
- Animations are janky or inconsistent
- Worse visual experience than the current v1.0 defaults

**Warning signs:**

- CSS `transition` properties on elements YARL also animates
- Two animation durations visible (e.g., 200ms fade + 300ms CSS transition)
- Lightbox works smoothly with default styles but breaks with customizations

**Prevention:**

- Work WITH YARL's animation system, not against it:
  - Use the `animation` prop to control YARL's built-in timings
  - Use the `render` prop for custom slide rendering (YARL animates the container, you render the content)
  - Use YARL's `styles` prop for CSS-only visual changes (background color, padding)
- For thumbnail-to-lightbox zoom transitions, this is NOT a built-in YARL feature -- it requires:
  - Capturing the thumbnail's bounding rect before lightbox opens
  - Using CSS `transform: scale()` and `transform-origin` on the lightbox container
  - This is complex and fragile -- consider deferring to a later milestone
- Stick to YARL's built-in `fade` and `swipe` animations for v1.1, only adjusting timing values
- The Zoom plugin is for zoom-on-pinch/scroll within the lightbox, NOT for zoom-from-thumbnail transitions

**Detection:** If adding CSS transitions, check whether YARL is also animating the same element by inspecting with DevTools during transitions.

**Phase relevance:** Lightbox enhancement phase. Set realistic expectations -- smooth crossfade is easy, zoom-from-thumbnail is hard.

---

### Pitfall 11: Album Cover Selection UI Without Validation

**What goes wrong:** The admin selects a cover photo for an album, but the selected photo is later deleted. The album then references a non-existent photo as its cover, causing broken images on the public albums page.

**THIS PROJECT'S SPECIFIC RISK:** The `albums` table has `cover_photo_id` with `REFERENCES photos(id)`. The Drizzle schema says `onDelete: "set null"`, but the actual database `CREATE TABLE` statement does NOT include `ON DELETE SET NULL` -- it uses bare `REFERENCES photos(id)` which defaults to `NO ACTION` in SQLite. This is the known FK constraint mismatch documented in MEMORY.md. Deleting a photo that is an album cover will FAIL with a foreign key constraint error (if FK enforcement is enabled) or leave a dangling reference (if not).

**Consequences:**

- Deleting a photo that serves as album cover either fails or creates a broken reference
- Public albums page shows broken image for the album cover
- The fallback logic in `albums/page.tsx` (lines 42-49) tries to find the first photo as cover, but this only runs if `coverPhotoId` is null, not if it references a deleted photo

**Warning signs:**

- Broken album cover images after deleting photos
- Foreign key constraint errors when deleting photos
- `albums.cover_photo_id` contains IDs for photos that no longer exist

**Prevention:**

- Fix the FK constraint mismatch: either:
  - (a) Run `ALTER TABLE` or recreate the table with `ON DELETE SET NULL` (correct approach), or
  - (b) Add application-level cleanup: when deleting a photo, also clear `cover_photo_id` on any album referencing it
- Add null-check in the cover display logic: if `coverPhotoId` is set but the photo does not exist, treat it as null
- In the cover selection UI, only show photos that belong to the album (not all photos)
- When removing a photo from an album, check if it was the cover and clear the reference

**Detection:** Query `SELECT a.id, a.cover_photo_id FROM albums a LEFT JOIN photos p ON a.cover_photo_id = p.id WHERE a.cover_photo_id IS NOT NULL AND p.id IS NULL` to find orphaned cover references.

**Phase relevance:** Album cover selection AND photo deletion flows. Fix the FK constraint before adding the cover selection UI.

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without major rework.

### Pitfall 12: EXIF Date Format Inconsistency

**What goes wrong:** EXIF dates are stored in various formats (`"2024:03:15 14:30:00"`, ISO 8601, Unix timestamps) depending on the camera. Display shows raw strings instead of formatted dates.

**Prevention:**

- Parse EXIF `DateTimeOriginal` into a JavaScript Date object immediately upon extraction
- Store as ISO 8601 string or Unix timestamp in the database
- Format for display using `Intl.DateTimeFormat` at render time
- Handle missing dates gracefully (not all photos have EXIF dates)

**Phase relevance:** EXIF extraction and display.

---

### Pitfall 13: YARL Share Plugin Uses Web Share API (Not Universal)

**What goes wrong:** The YARL Share plugin uses the Web Share API, which is not available in all browsers (notably absent in Firefox desktop as of early 2026). The share button appears only on supported browsers, confusing users on unsupported ones.

**Prevention:**

- Implement a fallback share mechanism: copy-to-clipboard button as an alternative
- The share URL for each photo needs the deep link (from Pitfall 5) to be working first
- Consider a custom share implementation instead of the YARL plugin for more control
- Test in Firefox desktop, Chrome desktop, Safari mobile, Chrome mobile

**Phase relevance:** Social sharing feature. Deep linking must work before sharing can work.

---

### Pitfall 14: dnd-kit Grid Strategy Mismatch

**What goes wrong:** Using `verticalListSortingStrategy` (the strategy currently used for album reorder) for a photo grid layout causes incorrect drop position calculations. Photos snap to wrong positions or the grid layout breaks during drag.

**Prevention:**

- Use `rectSortingStrategy` for grid layouts (default, handles 2D positioning)
- Only use `verticalListSortingStrategy` for single-column lists (like the existing album reorder)
- If photo thumbnails have variable sizes (portrait vs landscape), drop position may be unpredictable -- consider using uniform-sized containers
- Test with a mix of portrait and landscape photos in the grid

**Phase relevance:** Photo reordering feature.

---

### Pitfall 15: Lightbox Image Quality Regression

**What goes wrong:** The current lightbox uses 600w derivatives (line 32 of PhotoLightbox.tsx: `/api/images/${photo.id}/600w.webp`). On desktop monitors, 600px wide images look blurry in full-viewport lightbox view.

**Prevention:**

- Use YARL's `srcSet` slide property to provide multiple sizes, letting the browser choose
- For lightbox slides, provide at least: `{ src: "1200w.webp", srcSet: [{ src: "600w.webp", width: 600 }, { src: "1200w.webp", width: 1200 }, { src: "2400w.webp", width: 2400 }] }`
- YARL supports responsive images via srcSet on slides
- This is already a v1.0 quality gap that should be fixed alongside lightbox enhancements

**Phase relevance:** Lightbox enhancement phase. Should be bundled with other lightbox improvements.

---

## Phase-Specific Warnings

| Phase Topic           | Likely Pitfall                            | Mitigation                                              |
| --------------------- | ----------------------------------------- | ------------------------------------------------------- |
| EXIF extraction       | Sharp returns raw buffer (Pitfall 3)      | Choose exifr or exif-reader before coding               |
| EXIF extraction       | GPS privacy leak (Pitfall 1)              | Build allowlist into extraction, not display            |
| EXIF extraction       | Schema migration (Pitfall 2)              | Write ALTER TABLE first, test on real DB                |
| EXIF display          | Date format inconsistency (Pitfall 12)    | Normalize to Date object during extraction              |
| Lightbox enhancements | Fighting YARL animations (Pitfall 10)     | Use YARL's props, not custom CSS animations             |
| Lightbox enhancements | 600w quality gap (Pitfall 15)             | Add srcSet to slides                                    |
| Fullscreen mode       | iPhone Safari unsupported (Pitfall 6)     | Design CSS-based fallback, not just Fullscreen API      |
| Touch gestures        | Scroll vs drag conflict (Pitfall 7)       | Use TouchSensor with delay, add drag handles            |
| Album cover selection | FK constraint mismatch (Pitfall 11)       | Fix DB constraint before building UI                    |
| Photo reordering      | findByAlbumId lacks ORDER BY (Pitfall 4)  | Fix query before building reorder UI                    |
| Photo reordering      | Grid strategy mismatch (Pitfall 14)       | Use rectSortingStrategy, not verticalList               |
| Direct photo links    | History stack pollution (Pitfall 5)       | Use replaceState for navigation, pushState only on open |
| OpenGraph tags        | Image format / crawler compat (Pitfall 8) | Generate JPEG derivative for OG, use absolute URLs      |
| Social sharing        | Web Share API not universal (Pitfall 13)  | Implement copy-to-clipboard fallback                    |

## Dependency Chain for Prevention

Some pitfalls must be resolved in order. The critical path is:

```
1. Fix FK constraint mismatch (Pitfall 11)
   Required before: album cover selection, photo deletion safety

2. Fix findByAlbumId sort order (Pitfall 4)
   Required before: photo reorder UI makes sense

3. Write schema migrations (Pitfall 2)
   Required before: any new database columns (EXIF, etc.)

4. Implement EXIF extraction in worker (Pitfall 9)
   Required before: EXIF display

5. Implement deep linking (Pitfall 5)
   Required before: social sharing (share needs a URL to share)

6. Generate JPEG OG derivatives (Pitfall 8)
   Required before: OpenGraph tags work on social media
```

## Sources

- Sharp metadata API: [https://sharp.pixelplumbing.com/api-input](https://sharp.pixelplumbing.com/api-input)
- YARL Fullscreen plugin: [https://yet-another-react-lightbox.com/plugins/fullscreen](https://yet-another-react-lightbox.com/plugins/fullscreen)
- YARL Share plugin: [https://yet-another-react-lightbox.com/plugins/share](https://yet-another-react-lightbox.com/plugins/share)
- YARL Plugins overview: [https://yet-another-react-lightbox.com/plugins](https://yet-another-react-lightbox.com/plugins)
- dnd-kit Sortable: [https://docs.dndkit.com/presets/sortable](https://docs.dndkit.com/presets/sortable)
- dnd-kit touch issues: [https://github.com/clauderic/dnd-kit/issues/834](https://github.com/clauderic/dnd-kit/issues/834)
- Next.js generateMetadata: [https://nextjs.org/docs/app/api-reference/functions/generate-metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- Next.js OG image conventions: [https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
- EXIF privacy implications: [https://er.educause.edu/articles/2021/6/privacy-implications-of-exif-data](https://er.educause.edu/articles/2021/6/privacy-implications-of-exif-data)
- exifr npm (EXIF parsing): [https://www.npmjs.com/package/exifr](https://www.npmjs.com/package/exifr)
- exif-reader npm: [https://www.npmjs.com/package/exif-reader](https://www.npmjs.com/package/exif-reader)
- Drizzle ORM migrations: [https://orm.drizzle.team/docs/migrations](https://orm.drizzle.team/docs/migrations)
- Drizzle push SQLite bug: [https://github.com/drizzle-team/drizzle-orm/issues/1313](https://github.com/drizzle-team/drizzle-orm/issues/1313)

---

_Research completed: 2026-02-05_
_Confidence: HIGH for codebase-specific pitfalls (verified against actual source code), MEDIUM for library-specific pitfalls (verified against official docs)_
