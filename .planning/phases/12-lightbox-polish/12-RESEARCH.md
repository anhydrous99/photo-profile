# Phase 12: Lightbox Polish - Research

**Researched:** 2026-02-06
**Domain:** YARL lightbox responsive images, touch gestures, zoom, fullscreen
**Confidence:** HIGH

## Summary

Phase 12 enhances the existing YARL (yet-another-react-lightbox) v3.28.0 lightbox with four capabilities: responsive image derivative selection via `srcSet`, swipe-down-to-close, pinch/double-tap zoom, and fullscreen toggle. The key finding is that **YARL already provides built-in solutions for all four requirements** via its core controller settings and plugin system.

YARL's Zoom plugin includes a `ResponsiveImage` component that progressively upgrades image resolution as the user zooms in, accounting for `devicePixelRatio`. The Fullscreen plugin gracefully hides its button when the Fullscreen API is unavailable (iPhone Safari). The controller's `closeOnPullDown` implements iOS-style drag-to-dismiss with opacity fade. No custom gesture handling or hand-rolled responsive image logic is needed.

The main implementation challenge is that the photo database lacks `width`/`height` columns. YARL's `srcSet` requires `{src, width, height}` for each image source. The derivatives have known widths (300, 600, 1200, 2400) but aspect ratio must be computed to provide heights. Two approaches: add width/height to the DB schema, or compute them from the known derivative widths and a stored aspect ratio.

**Primary recommendation:** Enable YARL's Zoom plugin (which brings responsive srcSet support automatically), Fullscreen plugin, and `closeOnPullDown` controller setting. Store original image dimensions in the DB during processing so srcSet entries can include accurate width/height values.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Fullscreen button in YARL toolbar, gracefully absent on unsupported browsers (e.g., iPhone Safari)

### Claude's Discretion

All implementation decisions for this phase are at Claude's discretion. The user trusts Claude to make choices that result in a polished, native-feeling lightbox experience appropriate for a photography portfolio. Research YARL's capabilities and built-in gesture/zoom support before implementing custom solutions.

Specific discretion areas:

- **Responsive image loading:** Load strategy (direct vs progressive), device pixel ratio handling, resize behavior, format preference (AVIF vs WebP)
- **Touch gesture feel:** Swipe-down-to-close style (drag-to-dismiss vs gesture-detect), double-tap zoom level, EXIF panel behavior during zoom
- **Fullscreen experience:** Toolbar auto-hide, exit method, keyboard shortcuts

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.

</user_constraints>

## Standard Stack

### Core

| Library                                       | Version | Purpose                                                   | Why Standard                                        |
| --------------------------------------------- | ------- | --------------------------------------------------------- | --------------------------------------------------- |
| yet-another-react-lightbox                    | 3.28.0  | Base lightbox                                             | Already installed, foundation for all enhancements  |
| yet-another-react-lightbox/plugins/zoom       | 3.28.0  | Pinch, double-tap, scroll zoom + responsive image loading | Built-in plugin, includes ResponsiveImage component |
| yet-another-react-lightbox/plugins/fullscreen | 3.28.0  | Fullscreen toggle with graceful degradation               | Built-in plugin, auto-hides on unsupported browsers |

### Supporting

No additional libraries needed. All four requirements are satisfied by YARL's existing plugins and controller settings.

### Alternatives Considered

| Instead of             | Could Use                                          | Tradeoff                                                                                                 |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| YARL Zoom plugin       | Custom pinch/zoom with use-gesture + framer-motion | Massive extra complexity, conflicts with YARL's event system, not worth it                               |
| YARL closeOnPullDown   | Custom swipe-down handler                          | Would fight YARL's pointer event system, YARL's implementation already has iOS-style drag + opacity fade |
| YARL Fullscreen plugin | Direct Fullscreen API usage                        | Would need to reimplement disabled-detection, cross-browser prefixes, YARL already handles all of this   |

**Installation:**

```bash
# No new packages needed - all plugins ship with yet-another-react-lightbox
```

## Architecture Patterns

### Recommended Changes

```
src/
├── domain/entities/Photo.ts            # Add width, height to Photo interface
├── infrastructure/database/schema.ts   # Add width, height columns to photos table
├── infrastructure/services/imageService.ts  # (no change, already extracts metadata)
├── infrastructure/jobs/workers/imageProcessor.ts  # Store width/height during processing
├── presentation/components/PhotoLightbox.tsx  # Main changes: add plugins, srcSet, controller settings
├── presentation/components/HomepageClient.tsx # Pass width/height to lightbox
├── presentation/components/AlbumGalleryClient.tsx  # Pass width/height to lightbox
├── app/page.tsx                        # Pass width/height from server
├── app/albums/[id]/page.tsx            # Pass width/height from server
└── lib/imageLoader.ts                  # Consider AVIF support (optional)
```

### Pattern 1: YARL srcSet with Known Derivatives

**What:** Provide all available derivative URLs as srcSet entries to YARL slides. The Zoom plugin's `ResponsiveImage` component handles progressive loading automatically.

**When to use:** For every slide in the lightbox.

**How it works (verified from YARL source code):**

1. YARL's Zoom plugin wraps all image slides in `ZoomWrapper`
2. `ZoomWrapper` checks if the slide has `srcSet` entries
3. If yes, it renders `ResponsiveImage` instead of plain `ImageSlide`
4. `ResponsiveImage` calculates `targetWidth = rect.width * zoom * devicePixelRatio()` (lines 441-445 of zoom/index.js)
5. It finds the smallest srcSet entry whose width >= targetWidth
6. It progressively upgrades: first renders a fast initial image, then preloads the higher-res version and swaps when loaded
7. On zoom-in, the rect is multiplied by zoom level (line 493), causing higher-res derivatives to load automatically

**Example:**

```typescript
// Source: YARL v3.28.0 types.d.ts SlideImage interface + zoom plugin source
const slides = photos.map((photo) => ({
  src: `/api/images/${photo.id}/600w.webp`,
  alt: photo.title || photo.originalFilename,
  width: photo.width, // original image width
  height: photo.height, // original image height
  title: photo.title || undefined,
  description: photo.description || undefined,
  srcSet: [
    {
      src: `/api/images/${photo.id}/300w.webp`,
      width: 300,
      height: Math.round(300 * (photo.height / photo.width)),
    },
    {
      src: `/api/images/${photo.id}/600w.webp`,
      width: 600,
      height: Math.round(600 * (photo.height / photo.width)),
    },
    {
      src: `/api/images/${photo.id}/1200w.webp`,
      width: 1200,
      height: Math.round(1200 * (photo.height / photo.width)),
    },
    {
      src: `/api/images/${photo.id}/2400w.webp`,
      width: 2400,
      height: Math.round(2400 * (photo.height / photo.width)),
    },
  ],
}));
```

### Pattern 2: Controller Pull-Down Close (iOS-Style Drag-to-Dismiss)

**What:** Enable `closeOnPullDown: true` on the controller. YARL handles the entire gesture -- photo follows finger via CSS `translate`, opacity fades via CSS variable `--yarl__pull_opacity`, and closes if threshold is exceeded.

**Verified behavior (from YARL source code):**

- `usePointerSwipe` detects vertical drag gestures (lines 759-860)
- When pulling down, the carousel's CSS transform is updated via `--yarl__pull_offset` and opacity via `--yarl__pull_opacity` (lines 1252-1256)
- The photo literally follows the user's finger with opacity fading -- this IS the iOS-style drag-to-dismiss
- When `zoom > 1`, the Zoom plugin calls `event.stopPropagation()` (line 257-258), preventing the pull-down from firing during pan

**Example:**

```typescript
<Lightbox
  controller={{
    closeOnPullDown: true,  // Enable iOS-style drag-to-dismiss
    closeOnPullUp: false,
    closeOnBackdropClick: false,
  }}
/>
```

### Pattern 3: Zoom Plugin with Double-Tap and Pinch

**What:** Enable the Zoom plugin with `pinchZoomV4: true` for natural pinch feel.

**Verified behavior:**

- `pinchZoomV4: true` uses direct proportional scaling (`initialZoom / initialDistance * currentDistance`) -- feels like native iOS Photos
- Legacy pinch zoom uses logarithmic `scaleZoom()` -- feels less natural
- Double-tap cycles through zoom stops: 1x -> intermediate -> maxZoom -> 1x (lines 218-226)
- `maxZoomPixelRatio: 1` (default) limits zoom to 1:1 pixel ratio (image pixel = screen pixel) -- appropriate for photography
- `doubleClickMaxStops: 2` means double-tap goes 1x -> ~2x -> max -> 1x

**Example:**

```typescript
<Lightbox
  plugins={[Zoom, Fullscreen, Captions]}
  zoom={{
    maxZoomPixelRatio: 1,       // 1:1 pixel ratio at max zoom (see pixel-peeping detail)
    doubleClickMaxStops: 2,     // Two stops: medium zoom, full zoom
    scrollToZoom: false,        // Don't zoom on scroll (scroll navigates)
    pinchZoomV4: true,          // Natural proportional pinch feel
  }}
/>
```

### Pattern 4: Fullscreen with Graceful Degradation

**What:** Enable the Fullscreen plugin. It auto-detects `fullscreenEnabled` and hides the button when unavailable.

**Verified behavior (from fullscreen/index.js):**

- On mount, checks `document.fullscreenEnabled || document.webkitFullscreenEnabled || document.mozFullScreenEnabled || document.msFullscreenEnabled` (line 26)
- Sets `disabled = true` if none are supported
- `FullscreenButton` component returns `null` when `disabled` (line 116) -- button simply doesn't render
- iPhone Safari does NOT support the Fullscreen API for non-video elements -- button will be absent there
- Desktop browsers and most Android browsers support it

**Example:**

```typescript
<Lightbox
  plugins={[Zoom, Fullscreen, Captions]}
  fullscreen={{ auto: false }}  // User-initiated only (requirement LBOX-04)
/>
```

### Pattern 5: Toolbar Button Ordering

**What:** Control the order of toolbar buttons by placing plugin key strings in the `toolbar.buttons` array.

**Verified behavior (from `addToolbarButton` in index.js lines 103-115):**

- If the plugin key string exists in the buttons array, the plugin replaces it with its rendered button
- If not found, the button is prepended to the beginning
- We control order by placing keys explicitly

**Example:**

```typescript
toolbar={{
  buttons: [
    "zoom",           // Zoom in/out controls (left side)
    "fullscreen",     // Fullscreen toggle
    exifInfoButton,   // Custom EXIF info button
    "close",          // Close button (rightmost)
  ],
}}
```

### Anti-Patterns to Avoid

- **Don't hand-roll gesture detection alongside YARL:** YARL captures all pointer events via `subscribeSensors`. Custom touch handlers on the same elements will conflict with YARL's pointer event pipeline.
- **Don't use YARL's native `srcSet` on `<img>` (without Zoom plugin):** Without the Zoom plugin, YARL uses a basic `<img srcSet>` approach. With the Zoom plugin, it uses the superior `ResponsiveImage` component that progressively upgrades and accounts for zoom level. Always use the Zoom plugin when using srcSet.
- **Don't set `maxZoomPixelRatio` too high for photography:** Values > 1 allow zooming beyond 1:1 pixel density. For a photography portfolio, 1:1 is ideal -- it shows the sharpest the image can be. Values > 1 just show blurry upscaling.

## Don't Hand-Roll

| Problem                              | Don't Build                                                               | Use Instead                                    | Why                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive image loading in lightbox | Custom srcSet logic, IntersectionObserver, or manual derivative selection | YARL Zoom plugin's `ResponsiveImage` component | It progressively upgrades, accounts for devicePixelRatio, handles zoom-level-based resolution switching, and preloads higher-res variants invisibly |
| Swipe-down-to-close                  | Custom touch handlers, use-gesture                                        | YARL controller `closeOnPullDown: true`        | Already implements iOS-style drag-to-dismiss with CSS translate + opacity fade                                                                      |
| Pinch-to-zoom                        | Custom multi-touch handler                                                | YARL Zoom plugin with `pinchZoomV4: true`      | Handles pinch, double-tap, scroll wheel, keyboard zoom, pan while zoomed, coordinates with swipe navigation                                         |
| Fullscreen toggle                    | Direct Fullscreen API usage                                               | YARL Fullscreen plugin                         | Handles cross-browser prefixes, disabled detection, auto-hides button on unsupported browsers                                                       |
| Zoom-aware swipe prevention          | Custom conflict resolution between zoom pan and swipe-to-close            | Zoom plugin's `event.stopPropagation()`        | Already prevents pull-down close gesture from firing when zoom > 1                                                                                  |

**Key insight:** YARL is an integrated event system. Its controller, carousel, and plugins all communicate through a shared `subscribeSensors` / event pipeline. Adding external gesture handlers will break this pipeline. Use YARL's built-in solutions.

## Common Pitfalls

### Pitfall 1: Missing width/height on Slide Objects

**What goes wrong:** YARL's `ResponsiveImage` component (inside Zoom plugin) calculates `targetWidth` using the slide's width and height to determine aspect ratio. Without these, the `sizes` attribute falls back to `Number.MAX_VALUE` and always loads the largest image.

**Why it happens:** The codebase's Photo entity currently has no `width`/`height` fields. The database schema has no such columns. YARL needs them for its built-in `srcSet` sizing to work correctly (verified in index.js lines 707-720 and zoom/index.js lines 437-441).

**How to avoid:** Add `width` and `height` columns to the photos table. Populate them during image processing (Sharp already extracts metadata). Pass them through the data pipeline to the client component.

**Warning signs:** All images loading at 2400w regardless of viewport size. No progressive resolution upgrade on zoom.

### Pitfall 2: srcSet Heights Must Match Aspect Ratio

**What goes wrong:** YARL uses the srcSet entries' width/height to calculate image aspect ratio for layout. If heights don't match the actual derivative's aspect ratio, images will be sized incorrectly in the lightbox.

**Why it happens:** The derivative widths are fixed (300, 600, 1200, 2400) but heights depend on the original image's aspect ratio. Computing `height = Math.round(width * (originalHeight / originalWidth))` for each derivative is correct.

**How to avoid:** Compute srcSet heights from the original image's aspect ratio and the derivative width. The derivatives maintain the original aspect ratio (Sharp `fit: "inside"` preserves it).

**Warning signs:** Images appearing stretched or with incorrect sizing in lightbox.

### Pitfall 3: Derivatives May Not Exist for All Widths

**What goes wrong:** If the original image is smaller than a derivative width, that derivative is skipped (Sharp `withoutEnlargement: true`). Including a non-existent derivative in srcSet will cause a 404, though the API route falls back to the largest available.

**Why it happens:** A 1000px wide original will only generate 300w and 600w derivatives (not 1200w or 2400w).

**How to avoid:** Either:

- (Simpler) Include all widths in srcSet and rely on the API route's fallback behavior -- it already returns the largest available derivative for any missing size
- (Better) Store which derivatives exist and only include those in srcSet

**Recommendation:** Use the simpler approach. The API route already handles this with `findLargestDerivative()` fallback, and the performance impact is negligible (one redirect-less fallback vs one exact hit).

### Pitfall 4: Zoom Plugin Adds Zoom Toolbar Button by Default

**What goes wrong:** The Zoom plugin auto-adds a zoom in/out toggle button to the toolbar. This may not be desired for a photography portfolio where pinch/double-tap are the primary zoom methods.

**Why it happens:** The plugin calls `addToolbarButton(toolbar, PLUGIN_ZOOM, ...)` during augmentation.

**How to avoid:** To hide the zoom toolbar button, don't include `"zoom"` in the toolbar.buttons array AND the plugin will prepend it. To control it, either include `"zoom"` in the buttons array at the desired position, or render a custom empty button via `render.buttonZoom`.

**Recommendation:** Include the zoom button in the toolbar -- it provides useful zoom in/out for desktop users who don't have pinch gestures. Place it logically before fullscreen.

### Pitfall 5: EXIF Panel Z-Index Conflict with Fullscreen

**What goes wrong:** The ExifPanel uses `z-50` and `fixed` positioning. When the Fullscreen plugin wraps the controller in a fullscreen container, `fixed` positioned elements may escape or layer incorrectly.

**Why it happens:** The Fullscreen plugin wraps everything in a div that becomes the fullscreen element. If the ExifPanel is rendered outside this wrapper (currently it's a sibling of `<Lightbox>` in the JSX), it won't be visible in fullscreen mode.

**How to avoid:** Render the ExifPanel inside the Lightbox's render tree, using YARL's `render.controls` or `render.slideFooter` functions. Or, render it inside the same parent as the Lightbox and ensure the Fullscreen plugin's container wraps both.

**Warning signs:** EXIF panel disappearing when entering fullscreen.

### Pitfall 6: AVIF Format Detection Complexity

**What goes wrong:** Adding AVIF support to the srcSet doubles the number of entries and requires browser capability detection.

**Why it happens:** AVIF has better compression than WebP but is not universally supported. Adding both formats to srcSet requires using `<picture>` / `<source>` elements, which YARL doesn't support natively in its srcSet model.

**How to avoid:** Stick with WebP for the lightbox srcSet. WebP has 98%+ browser support. AVIF derivatives exist on disk for future use but the complexity of AVIF detection in YARL's srcSet model isn't worth the marginal bandwidth savings.

**Recommendation:** Use WebP only in srcSet. The existing image loader already uses WebP. AVIF can be a future optimization if YARL adds native format negotiation.

## Code Examples

### Complete PhotoLightbox Configuration (Recommended)

```typescript
// Source: Verified against YARL v3.28.0 type definitions and plugin source code
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";

const DERIVATIVE_WIDTHS = [300, 600, 1200, 2400];

function buildSrcSet(photoId: string, width: number, height: number) {
  const aspectRatio = height / width;
  return DERIVATIVE_WIDTHS.map((w) => ({
    src: `/api/images/${photoId}/${w}w.webp`,
    width: w,
    height: Math.round(w * aspectRatio),
  }));
}

// Inside component:
const slides = photos.map((photo) => ({
  src: `/api/images/${photo.id}/600w.webp`,  // Default/fallback
  alt: photo.title || photo.originalFilename,
  width: photo.width,
  height: photo.height,
  title: photo.title || undefined,
  description: photo.description || undefined,
  srcSet: buildSrcSet(photo.id, photo.width, photo.height),
}));

<Lightbox
  open={true}
  close={onClose}
  index={index}
  slides={slides}
  plugins={[Zoom, Fullscreen, Captions]}
  styles={{
    container: { backgroundColor: "rgb(0, 0, 0)" },
  }}
  carousel={{
    padding: "5%",
    spacing: "10%",
    imageFit: "contain",
    preload: 2,
  }}
  animation={{
    fade: 200,
    swipe: 300,
    zoom: 300,
  }}
  controller={{
    closeOnPullDown: true,    // LBOX-02: Swipe down to close
    closeOnPullUp: false,
    closeOnBackdropClick: false,
  }}
  zoom={{
    maxZoomPixelRatio: 1,     // 1:1 pixel density max
    doubleClickMaxStops: 2,   // Two double-tap stops
    scrollToZoom: false,
    pinchZoomV4: true,        // Natural proportional pinch zoom
  }}
  fullscreen={{
    auto: false,              // LBOX-04: User-initiated only
  }}
  captions={{
    descriptionTextAlign: "center",
    descriptionMaxLines: 5,
  }}
  toolbar={{
    buttons: [
      "zoom",
      "fullscreen",
      exifInfoButton,         // Existing custom EXIF toggle
      "close",
    ],
  }}
  on={{
    view: ({ index: newIndex }) => onIndexChange?.(newIndex),
    zoom: ({ zoom }) => setCurrentZoom(zoom),  // Track zoom for EXIF panel
  }}
/>
```

### Schema Migration for Width/Height

```sql
-- Add width and height columns to photos table
ALTER TABLE photos ADD COLUMN width INTEGER;
ALTER TABLE photos ADD COLUMN height INTEGER;
```

### Width/Height Population During Processing

```typescript
// In imageProcessor.ts worker completed handler:
// Sharp already reads metadata during generateDerivatives()
// We need to extract and store width/height

import { getImageMetadata } from "@/infrastructure/services/imageService";

// During processing, after rotating:
const metadata = await getImageMetadata(originalPath);
// Note: Sharp auto-rotates, so for rotated images, width/height swap
// The rotate() call in generateDerivatives handles this, but metadata
// reports pre-rotation dimensions. Need to account for EXIF orientation.
const pipeline = sharp(originalPath).rotate();
const rotatedMeta = await pipeline.metadata();
const width = rotatedMeta.width;
const height = rotatedMeta.height;
```

### EXIF Panel Hiding During Zoom

```typescript
// Track zoom level via YARL's on.zoom callback
const [currentZoom, setCurrentZoom] = useState(1);

// Hide EXIF panel when zoomed in
const effectiveExifVisible = exifOpen && currentZoom <= 1;

// Reset zoom tracking on slide change
// (YARL automatically resets zoom to 1 on slide change)
```

## State of the Art

| Old Approach                            | Current Approach                                       | When Changed            | Impact                                                               |
| --------------------------------------- | ------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------- |
| Legacy pinch zoom (logarithmic scaling) | `pinchZoomV4: true` (proportional scaling)             | YARL v3.27.0 (Dec 2025) | Much more natural pinch feel, matches iOS behavior                   |
| Manual srcSet on `<img>` elements       | Zoom plugin `ResponsiveImage` with progressive upgrade | YARL v3.x (built-in)    | Automatic resolution switching as user zooms, devicePixelRatio-aware |
| Custom fullscreen implementations       | YARL Fullscreen plugin with `disabled` detection       | YARL v3.x (built-in)    | Cross-browser, graceful degradation, no custom code needed           |

**Deprecated/outdated:**

- `doubleTapDelay`: Deprecated in YARL, still functional but not recommended to configure
- `doubleClickDelay`: Deprecated in YARL, still functional but not recommended to configure
- `pinchZoomDistanceFactor`: Deprecated in favor of `pinchZoomV4: true`

## Discretionary Recommendations

Based on research, here are recommendations for all areas at Claude's discretion:

### Responsive Image Loading

- **Load strategy:** Use YARL Zoom plugin's built-in `ResponsiveImage` progressive upgrade. It starts with the derivative matching viewport width, then upgrades as user zooms. This is YARL's native pattern and works seamlessly.
- **Device pixel ratio:** Account for it. YARL's `ResponsiveImage` already multiplies `targetWidth * devicePixelRatio()`. On a 2x retina display showing a 600px-wide slide, it will request 1200w.webp. This is correct behavior for a photography portfolio.
- **Resize behavior:** YARL re-selects on resize automatically via `useLayoutEffect(handleResize, [rect.width, rect.height, ...])`. No custom handling needed.
- **Format preference:** Stick with WebP. AVIF is already generated and stored, but YARL's srcSet model doesn't support format negotiation. WebP has 98%+ support and the quality difference is marginal at the configured quality levels (WebP 82, AVIF 80).

### Touch Gesture Feel

- **Swipe-down-to-close:** Use `closeOnPullDown: true`. YARL already implements iOS-style drag-to-dismiss (photo follows finger via CSS translate, opacity fades). This IS the drag-to-dismiss pattern, not gesture-detect-then-animate. Verified from source code.
- **Swipe left/right navigation:** YARL provides this out of the box via the carousel. No configuration needed. When zoomed in, the Zoom plugin stops propagation of pointer events, so swipe navigation is automatically disabled during pan.
- **Double-tap zoom level:** Use `doubleClickMaxStops: 2`. First double-tap zooms to an intermediate level (~2x depending on image), second double-tap goes to max (1:1 pixel ratio). Third double-tap returns to 1x. This progressive zoom is ideal for photography -- viewers can quickly see composition at 2x or pixel-peep at 1:1.
- **EXIF panel during zoom:** Hide the EXIF panel when zoom > 1. When viewing details at zoom, the EXIF panel covers image content and is distracting. Track zoom via `on.zoom` callback and conditionally hide.

### Fullscreen Experience

- **Toolbar auto-hide:** Don't implement auto-hide for now. YARL doesn't have built-in toolbar auto-hide, and implementing it custom would require hooking into YARL's event system. The toolbar is unobtrusive with the dark background.
- **Exit method:** Escape key (YARL default) + click the fullscreen toggle button. Both work out of the box.
- **Keyboard shortcuts:** YARL's Zoom plugin already handles `+`/`-`/`Ctrl+0` for zoom. Fullscreen has no built-in keyboard shortcut beyond Escape (which closes the lightbox, not just fullscreen). The `F` key is not bound. Consider adding `F` for fullscreen toggle if feasible, but this is low priority.

## Open Questions

1. **Width/height for existing photos**
   - What we know: New photos will get width/height stored during processing. Existing photos in the DB don't have these fields.
   - What's unclear: How many existing photos are in the database? Is a backfill script needed?
   - Recommendation: Add a migration that sets width/height to NULL for existing rows. Create a backfill script that reads the original files and populates dimensions. The lightbox should gracefully handle NULL width/height by falling back to the current behavior (600w.webp, no srcSet).

2. **ExifPanel rendering inside vs outside Lightbox**
   - What we know: The ExifPanel is currently rendered as a sibling of `<Lightbox>` in the JSX. The Fullscreen plugin wraps the controller in a fullscreen container. Fixed-position elements outside this container may not be visible in fullscreen.
   - What's unclear: Whether `position: fixed` elements rendered outside the fullscreen container are visible. CSS spec says they should be relative to the initial containing block, which in fullscreen mode is the fullscreen element.
   - Recommendation: Move ExifPanel rendering inside YARL's render tree using `render.controls` to ensure it works in fullscreen mode. Alternatively, test current behavior first.

3. **Sharp metadata orientation vs actual dimensions**
   - What we know: `sharp(file).metadata()` returns the raw EXIF dimensions (before rotation). For a portrait photo shot on a phone, width/height from raw metadata may be swapped. `sharp(file).rotate().metadata()` returns post-rotation dimensions.
   - What's unclear: Whether chaining `.rotate().metadata()` consistently returns the display-correct dimensions.
   - Recommendation: Use `sharp(file).rotate().toBuffer()` then read metadata from the rotated buffer, or use the existing derivative file (which is already rotated) to get dimensions.

## Sources

### Primary (HIGH confidence)

- YARL v3.28.0 installed source code at `node_modules/yet-another-react-lightbox/dist/`:
  - `types.d.ts` - SlideImage, ImageSource, ControllerSettings interfaces
  - `index.js` lines 700-730 - srcSet/sizes calculation in ImageSlide
  - `plugins/zoom/index.js` lines 80-120 - maxZoom calculation from srcSet
  - `plugins/zoom/index.js` lines 412-465 - ResponsiveImage component with progressive upgrade
  - `plugins/zoom/index.js` lines 126-288 - Zoom sensors (pinch, double-tap, keyboard, wheel)
  - `plugins/zoom/index.js` lines 500-517 - Zoom plugin augmentation
  - `plugins/fullscreen/index.js` lines 1-132 - Full plugin source with disabled detection
  - `index.js` lines 759-860 - usePointerSwipe pull-down gesture handling
  - `styles.css` - pull_offset and pull_opacity CSS variables for drag-to-dismiss
- YARL official documentation: https://yet-another-react-lightbox.com/documentation
- YARL zoom plugin docs: https://yet-another-react-lightbox.com/plugins/zoom
- YARL fullscreen plugin docs: https://yet-another-react-lightbox.com/plugins/fullscreen

### Secondary (MEDIUM confidence)

- YARL GitHub releases: https://github.com/igordanchenko/yet-another-react-lightbox/releases - pinchZoomV4 introduced in v3.27.0

### Tertiary (LOW confidence)

- iPhone Safari Fullscreen API support - confirmed unsupported via CanIUse and Apple Developer Forums (https://caniuse.com/fullscreen, https://developer.apple.com/forums/thread/770080)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All solutions come from YARL's own installed source code, verified line by line
- Architecture: HIGH - Pattern follows YARL's documented plugin model, verified from source
- Pitfalls: HIGH - Identified from reading actual implementation code, not just documentation

**Research date:** 2026-02-06
**Valid until:** 2026-03-08 (30 days -- YARL is stable, v3.28.0 is current)
