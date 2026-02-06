# Phase 11: EXIF Metadata Pipeline - Research

**Researched:** 2026-02-05
**Domain:** EXIF metadata extraction, storage, and display in a photography portfolio
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Metadata display

- Expandable panel in the lightbox -- hidden by default, revealed via an info icon tap/click
- Panel slides up or drops down over the photo when toggled

#### Data selection

- Extended field set: camera body, lens, focal length, aperture, shutter speed, ISO, date taken, white balance, metering mode, flash status
- Camera body displayed as full EXIF string (e.g., "Canon EOS R5", "SONY ILCE-7RM4") -- no parsing/cleanup
- Lens displayed as raw EXIF string (e.g., "EF70-200mm f/2.8L IS III USM") -- photographers will recognize their gear
- Privacy exclusions: GPS coordinates, camera serial numbers, software/editor info (e.g., "Adobe Lightroom 6.0") -- never stored

#### Backfill experience

- CLI script only (e.g., `npm run exif:backfill`) -- no admin panel button
- Summary output at the end -- totals for processed, skipped, and failed photos
- Idempotent: only processes photos with no existing EXIF data -- safe to re-run

### Claude's Discretion

- Info icon placement (toolbar vs floating on photo -- based on current lightbox layout)
- EXIF panel format (icon row vs labeled list -- based on existing design system)
- Panel behavior on photo navigation (stay open vs auto-close)
- Missing file handling during backfill (report vs skip silently)

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope

</user_constraints>

## Summary

This phase adds EXIF metadata extraction during upload processing, persistent storage in SQLite, display in the lightbox via an expandable info panel, and a CLI backfill script for existing photos. The project already uses Sharp for image processing, and Sharp returns raw EXIF buffers that need a companion parser. The recommended approach is to use `exif-reader` (the library Sharp's own test suite uses) to parse the buffer, extract the 10 required fields, strip privacy-sensitive tags (GPS, serial numbers, software), store the data as a JSON column on the `photos` table, and display it in YARL (yet-another-react-lightbox) using a custom toolbar button with a slide-up panel.

The codebase follows Clean Architecture with four layers. EXIF extraction belongs in `infrastructure/services/` alongside the existing `imageService.ts`. The EXIF data type belongs in `domain/entities/`. The database schema change requires an `ALTER TABLE photos ADD COLUMN` migration (using direct SQL, not `db:push`, per project lesson). The lightbox UI change extends `PhotoLightbox.tsx` with YARL's toolbar customization API.

The data flow is: (1) worker extracts EXIF during image processing, (2) EXIF JSON is saved to the `photos` table, (3) server components pass EXIF data through to client components via the `PhotoData` interface, (4) the lightbox reads EXIF from the current slide and renders it in a toggleable panel.

**Primary recommendation:** Use `exif-reader` to parse Sharp's raw EXIF buffer, store as a JSON text column on `photos`, display via a YARL custom toolbar button + absolute-positioned overlay panel.

## Standard Stack

### Core

| Library                    | Version       | Purpose                                                | Why Standard                                                                                   |
| -------------------------- | ------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| sharp                      | ^0.34.5       | Extract raw EXIF buffer via `metadata().exif`          | Already in project; Sharp's maintainer recommends `exif-reader` for parsing                    |
| exif-reader                | latest (^2.x) | Parse raw EXIF buffer into structured object           | Sharp's own test suite uses it; small, focused, TypeScript types included                      |
| drizzle-orm                | ^0.45.1       | Store EXIF as JSON text column                         | Already in project; handles TEXT columns natively                                              |
| yet-another-react-lightbox | ^3.28.0       | Custom toolbar button + overlay panel for EXIF display | Already in project; has `toolbar.buttons`, `IconButton`, `createIcon`, `useLightboxState` APIs |

### Supporting

| Library        | Version | Purpose                        | When to Use                                                                        |
| -------------- | ------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| better-sqlite3 | ^12.6.2 | Direct `ALTER TABLE` migration | Already in project; used for schema migration (project learned to avoid `db:push`) |

### Alternatives Considered

| Instead of       | Could Use                    | Tradeoff                                                                                                       |
| ---------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| exif-reader      | exifr                        | exifr is more feature-rich but heavier; exif-reader is what Sharp recommends and is sufficient for our tag set |
| exif-reader      | ExifReader (exifreader)      | ExifReader supports browser + node and more formats, but we only need server-side parsing of Sharp's buffer    |
| JSON text column | Separate exif_metadata table | Separate table is more normalized but adds join complexity; EXIF is 1:1 with photos, JSON column is simpler    |
| JSON text column | Individual columns per field | 10+ columns is schema bloat; JSON is flexible if fields need to change                                         |

**Installation:**

```bash
npm install exif-reader
```

Note: `@types/exif-reader` is NOT needed -- `exif-reader` ships its own `index.d.ts`.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── domain/
│   └── entities/
│       └── Photo.ts              # Add ExifData interface + optional exifData field
├── infrastructure/
│   ├── database/
│   │   ├── schema.ts             # Add exif_data TEXT column to photos table
│   │   ├── client.ts             # Add ALTER TABLE migration in initializeDatabase()
│   │   └── repositories/
│   │       └── SQLitePhotoRepository.ts  # Map exif_data JSON <-> ExifData
│   ├── services/
│   │   └── exifService.ts        # NEW: Extract + sanitize EXIF from image file
│   └── jobs/
│       └── workers/
│           └── imageProcessor.ts # Call exifService during processing
├── presentation/
│   └── components/
│       ├── PhotoLightbox.tsx     # Add toolbar button + EXIF panel
│       └── ExifPanel.tsx         # NEW: Expandable EXIF display component
├── app/
│   ├── page.tsx                  # Pass exifData in PhotoData
│   └── albums/[id]/page.tsx      # Pass exifData in PhotoData
└── scripts/
    └── backfill-exif.ts          # NEW: CLI backfill script
```

### Pattern 1: EXIF Extraction Service

**What:** A dedicated service function that takes an image path, extracts EXIF via Sharp + exif-reader, sanitizes privacy fields, and returns a typed ExifData object.
**When to use:** During upload processing (worker) and backfill script.
**Example:**

```typescript
// src/infrastructure/services/exifService.ts
import sharp from "sharp";
import exifReader from "exif-reader";

export interface ExifData {
  cameraMake: string | null; // Image.Make (e.g., "Canon")
  cameraModel: string | null; // Image.Model (e.g., "Canon EOS R5")
  lens: string | null; // Photo.LensModel (e.g., "EF70-200mm f/2.8L IS III USM")
  focalLength: number | null; // Photo.FocalLength in mm
  aperture: number | null; // Photo.FNumber (e.g., 2.8)
  shutterSpeed: string | null; // Photo.ExposureTime formatted (e.g., "1/250")
  iso: number | null; // Photo.ISOSpeedRatings (e.g., 400)
  dateTaken: string | null; // Photo.DateTimeOriginal (ISO string)
  whiteBalance: string | null; // Photo.WhiteBalance (mapped to label)
  meteringMode: string | null; // Photo.MeteringMode (mapped to label)
  flash: string | null; // Photo.Flash (mapped to label)
}

export async function extractExifData(
  imagePath: string,
): Promise<ExifData | null> {
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.exif) return null;

  try {
    const parsed = exifReader(metadata.exif);
    // Map fields, strip privacy data (GPS, serial, software never accessed)
    return {
      cameraMake: parsed.Image?.Make ?? null,
      cameraModel: parsed.Image?.Model ?? null,
      lens: parsed.Photo?.LensModel ?? null,
      focalLength: parsed.Photo?.FocalLength ?? null,
      aperture: parsed.Photo?.FNumber ?? null,
      shutterSpeed: formatShutterSpeed(parsed.Photo?.ExposureTime),
      iso: parsed.Photo?.ISOSpeedRatings ?? null,
      dateTaken: parsed.Photo?.DateTimeOriginal?.toISOString() ?? null,
      whiteBalance: mapWhiteBalance(parsed.Photo?.WhiteBalance),
      meteringMode: mapMeteringMode(parsed.Photo?.MeteringMode),
      flash: mapFlash(parsed.Photo?.Flash),
    };
  } catch {
    // Corrupted EXIF is non-fatal
    return null;
  }
}
```

### Pattern 2: JSON Column with Type Safety

**What:** Store EXIF as serialized JSON in a TEXT column, parse on read.
**When to use:** For flexible structured data that maps 1:1 with the parent row.
**Example:**

```typescript
// In schema.ts
export const photos = sqliteTable("photos", {
  // ... existing columns
  exifData: text("exif_data"),  // JSON string or null
});

// In SQLitePhotoRepository.ts toDomain():
exifData: row.exifData ? JSON.parse(row.exifData) : null,

// In toDatabase():
exifData: photo.exifData ? JSON.stringify(photo.exifData) : null,
```

### Pattern 3: YARL Custom Toolbar Button + Overlay Panel

**What:** Add an info icon to the YARL toolbar that toggles an absolutely-positioned panel.
**When to use:** For adding metadata display to the lightbox.
**Example:**

```typescript
// In PhotoLightbox.tsx
import { IconButton, createIcon, useLightboxState } from "yet-another-react-lightbox";

const InfoIcon = createIcon("InfoIcon", <path d="M12 2C6.48 2 2 6.48 2 12s..." />);

function InfoButton({ onToggle, isOpen }: { onToggle: () => void; isOpen: boolean }) {
  const { currentSlide } = useLightboxState();
  return (
    <IconButton
      label="Photo info"
      icon={InfoIcon}
      disabled={!currentSlide}
      onClick={onToggle}
      style={isOpen ? { color: "var(--yarl__color_button_active)" } : undefined}
    />
  );
}

// In the Lightbox component:
<Lightbox
  toolbar={{
    buttons: [<InfoButton key="info" onToggle={toggle} isOpen={isOpen} />, "close"],
  }}
  render={{
    slideFooter: ({ slide }) =>
      isOpen && slide.exifData ? <ExifPanel exifData={slide.exifData} /> : null,
  }}
/>
```

### Pattern 4: Extending YARL Slide Type

**What:** Augment YARL's `SlideImage` type to include EXIF data using TypeScript module augmentation.
**When to use:** To pass EXIF data through the slide object so `slideFooter` can access it.
**Example:**

```typescript
// Module augmentation for YARL
declare module "yet-another-react-lightbox" {
  interface SlideImage {
    exifData?: ExifData | null;
  }
}
```

### Anti-Patterns to Avoid

- **Storing raw EXIF buffer in the database:** The buffer can be huge (contains MakerNote, thumbnails). Extract only needed fields and store as compact JSON.
- **Parsing EXIF on every page load:** Parse once during upload/backfill, store the result. Never re-parse from the image file on read.
- **Accessing GPS/serial/software tags even to "check" them:** The privacy contract says these are never stored. Don't read them from the parsed object.
- **Using `db:push` for schema migration:** Project lesson -- always use direct `ALTER TABLE` SQL in `initializeDatabase()`.
- **Individual database columns for each EXIF field:** Creates rigid schema; JSON text column is more maintainable for metadata that may expand.

## Don't Hand-Roll

| Problem                  | Don't Build                      | Use Instead                                 | Why                                                                                                |
| ------------------------ | -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| EXIF binary parsing      | Custom buffer parser             | exif-reader                                 | EXIF format is complex (endianness, IFD offsets, rational numbers); exif-reader handles edge cases |
| Shutter speed formatting | String manipulation on raw float | Helper function using ExposureTime rational | ExposureTime is a float (e.g., 0.004); need to convert to "1/250" format properly                  |
| Metering mode labels     | Hardcoded if/else                | Lookup map from EXIF standard codes         | Standard defines ~7 metering modes with specific numeric codes                                     |
| Flash status labels      | String parsing                   | Lookup map from EXIF flash bit field        | Flash tag is a bit field with 32+ combinations (fired, red-eye, strobe, etc.)                      |
| White balance labels     | Guessing                         | Lookup map from EXIF standard codes         | Standard defines Auto (0) and Manual (1) values                                                    |
| EXIF date parsing        | Manual string parsing            | `new Date()` on DateTimeOriginal            | exif-reader returns Date objects for date fields                                                   |

**Key insight:** EXIF metadata uses numeric codes, rational numbers, and bit fields that map to human-readable labels. The extraction library handles the binary parsing, but the application needs mapping tables for display labels. These mappings are well-defined by the EXIF standard and should use const lookup objects, not switch statements.

## Common Pitfalls

### Pitfall 1: Corrupted or Missing EXIF Data

**What goes wrong:** Some photos (screenshots, heavily edited images, PNG files) have no EXIF data. Others have corrupted EXIF that causes parser exceptions.
**Why it happens:** Not all image formats carry EXIF (PNG often doesn't). Image editors may strip or corrupt EXIF. Phone screenshots never have camera EXIF.
**How to avoid:** Always wrap exif-reader in try/catch. Return `null` for the entire ExifData when parsing fails. Make every field in ExifData nullable. The lightbox should gracefully hide the info button when no EXIF exists.
**Warning signs:** Uncaught exceptions in the worker, blank EXIF panels.

### Pitfall 2: EXIF Orientation Double-Application

**What goes wrong:** Sharp's `rotate()` already handles EXIF orientation. If EXIF data is read before `rotate()` processes the image, the orientation tag in stored EXIF could mislead.
**Why it happens:** The orientation tag is an Image IFD tag, not a Photo IFD tag. We're not storing it (it's not in our field set), but worth noting.
**How to avoid:** We don't store orientation in our ExifData, so this is not a risk. Just be aware not to add it later.
**Warning signs:** N/A for this phase.

### Pitfall 3: ExposureTime Rational Number Formatting

**What goes wrong:** ExposureTime comes as a decimal (e.g., 0.004 for 1/250s, 0.5 for 1/2s, 30 for 30s). Displaying raw decimals is meaningless to photographers.
**Why it happens:** EXIF stores ExposureTime as a Rational (numerator/denominator). exif-reader converts it to a float.
**How to avoid:** Format with a helper: if value < 1, display as `1/${Math.round(1/value)}`; if value >= 1, display as `${value}s` or `${value}"`.
**Warning signs:** Displaying "0.004" instead of "1/250".

### Pitfall 4: ALTER TABLE Migration Idempotency

**What goes wrong:** `ALTER TABLE ADD COLUMN` fails if the column already exists. Running the app twice after adding the migration crashes.
**Why it happens:** SQLite doesn't support `ADD COLUMN IF NOT EXISTS` (unlike CREATE TABLE IF NOT EXISTS).
**How to avoid:** Check if column exists first using `PRAGMA table_info(photos)` before running ALTER TABLE.
**Warning signs:** "duplicate column name: exif_data" error on second launch.

### Pitfall 5: Large EXIF Data Bloating Page Payloads

**What goes wrong:** If the entire EXIF JSON is passed from server component to client, it increases page payload for every photo, even when users never open the info panel.
**Why it happens:** Server components serialize all props to JSON for client hydration.
**How to avoid:** The ExifData object is small (~500 bytes per photo) for our 11-field set. For a page with 20 photos, that's ~10KB -- acceptable. If this became a concern, EXIF could be loaded on-demand via an API route, but that's premature optimization for this phase.
**Warning signs:** Page payload growing significantly; monitor with Next.js bundle analyzer if needed.

### Pitfall 6: Backfill Script Accessing Originals That Were Deleted

**What goes wrong:** If a photo's original file was manually deleted from disk but the DB record still exists, the backfill script crashes.
**Why it happens:** The backfill iterates all photos with no EXIF data and tries to read originals.
**How to avoid:** Wrap each photo's processing in try/catch. Log missing files as errors in the summary. Follow the existing `backfill-blur-placeholders.ts` pattern which handles missing files gracefully.
**Warning signs:** Script crashes mid-run without completing.

## Code Examples

### EXIF Field Mapping Constants

```typescript
// Source: EXIF standard (https://exiv2.org/tags.html)

export const METERING_MODE_MAP: Record<number, string> = {
  0: "Unknown",
  1: "Average",
  2: "Center-weighted average",
  3: "Spot",
  4: "Multi-spot",
  5: "Pattern",
  6: "Partial",
};

export const WHITE_BALANCE_MAP: Record<number, string> = {
  0: "Auto",
  1: "Manual",
};

// Flash is a bit field - simplified mapping for common values
export const FLASH_MAP: Record<number, string> = {
  0x00: "No flash",
  0x01: "Flash fired",
  0x05: "Flash fired, strobe return not detected",
  0x07: "Flash fired, strobe return detected",
  0x08: "Flash did not fire, compulsory flash mode",
  0x09: "Flash fired, compulsory flash mode",
  0x0d: "Flash fired, compulsory mode, return not detected",
  0x0f: "Flash fired, compulsory mode, return detected",
  0x10: "Flash did not fire, compulsory flash suppression",
  0x18: "Flash did not fire, auto mode",
  0x19: "Flash fired, auto mode",
  0x1d: "Flash fired, auto mode, return not detected",
  0x1f: "Flash fired, auto mode, return detected",
  0x20: "No flash function",
  0x41: "Flash fired, red-eye reduction mode",
  0x45: "Flash fired, red-eye reduction mode, return not detected",
  0x47: "Flash fired, red-eye reduction mode, return detected",
  0x49: "Flash fired, compulsory, red-eye reduction mode",
  0x4d: "Flash fired, compulsory, red-eye, return not detected",
  0x4f: "Flash fired, compulsory, red-eye, return detected",
  0x59: "Flash fired, auto mode, red-eye reduction mode",
  0x5d: "Flash fired, auto mode, return not detected, red-eye",
  0x5f: "Flash fired, auto mode, return detected, red-eye",
};

export function formatShutterSpeed(
  exposureTime: number | undefined | null,
): string | null {
  if (exposureTime == null) return null;
  if (exposureTime >= 1) return `${exposureTime}"`;
  return `1/${Math.round(1 / exposureTime)}`;
}

export function formatFocalLength(
  mm: number | undefined | null,
): string | null {
  if (mm == null) return null;
  return `${mm}mm`;
}

export function formatAperture(
  fNumber: number | undefined | null,
): string | null {
  if (fNumber == null) return null;
  return `f/${fNumber}`;
}
```

### Database Migration (Idempotent ALTER TABLE)

```typescript
// In initializeDatabase() in client.ts
// Source: Project lesson from MEMORY.md -- always use ALTER TABLE, never db:push

// Add exif_data column to photos table (Phase 11)
const tableInfo = sqlite.prepare("PRAGMA table_info(photos)").all() as Array<{
  name: string;
}>;
const hasExifData = tableInfo.some((col) => col.name === "exif_data");
if (!hasExifData) {
  sqlite.prepare("ALTER TABLE photos ADD COLUMN exif_data TEXT").run();
}
```

### Worker Integration

```typescript
// In imageProcessor.ts worker's job handler, after generating derivatives:

// Extract EXIF metadata from original image
import { extractExifData } from "@/infrastructure/services/exifService";

const exifData = await extractExifData(originalPath);

// Return alongside existing result
return { photoId, derivatives, blurDataUrl, exifData };

// In the "completed" handler, save exifData:
if (photo) {
  photo.status = "ready";
  photo.blurDataUrl = result.blurDataUrl;
  photo.exifData = result.exifData;
  await repository.save(photo);
}
```

### Backfill Script Pattern

```typescript
// scripts/backfill-exif.ts
// Follows exact same pattern as scripts/backfill-blur-placeholders.ts

import { isNull } from "drizzle-orm";
import { db } from "@/infrastructure/database/client";
import { photos } from "@/infrastructure/database/schema";
import { extractExifData } from "@/infrastructure/services/exifService";

// Query: SELECT id FROM photos WHERE exif_data IS NULL
const photosToUpdate = await db
  .select({ id: photos.id })
  .from(photos)
  .where(isNull(photos.exifData));

// For each: find original file, extract EXIF, update DB
// Track: processed, skipped (no original), failed (error)
// Print summary at end
```

### ExifPanel Component

```typescript
// src/presentation/components/ExifPanel.tsx
"use client";

import type { ExifData } from "@/infrastructure/services/exifService";

interface ExifPanelProps {
  exifData: ExifData;
}

export function ExifPanel({ exifData }: ExifPanelProps) {
  // Build list of non-null fields to display
  const fields = [
    exifData.cameraModel && { label: "Camera", value: exifData.cameraModel },
    exifData.lens && { label: "Lens", value: exifData.lens },
    exifData.focalLength && { label: "Focal Length", value: `${exifData.focalLength}mm` },
    exifData.aperture && { label: "Aperture", value: `f/${exifData.aperture}` },
    exifData.shutterSpeed && { label: "Shutter", value: exifData.shutterSpeed },
    exifData.iso && { label: "ISO", value: String(exifData.iso) },
    // ... more fields
  ].filter(Boolean);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
        padding: "2rem 1.5rem 1.5rem",
        color: "white",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "center" }}>
        {fields.map((f) => (
          <span key={f.label} style={{ fontSize: "0.875rem" }}>
            <span style={{ opacity: 0.7 }}>{f.label}</span>{" "}
            <span style={{ fontWeight: 500 }}>{f.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

## Discretion Recommendations

### Info Icon Placement: Toolbar (recommended)

The current lightbox uses YARL's default toolbar with just a close button. Adding an info icon to the toolbar (before the close button) is the standard YARL pattern. It's consistent with how other YARL plugins (Captions, Download, Slideshow) add their controls. A floating icon on the photo would require custom absolute positioning and could overlap with photo content.

**Recommendation:** Add to toolbar using `toolbar.buttons` array, placed before "close".

### EXIF Panel Format: Compact labeled list (recommended)

The existing design system uses Tailwind CSS with clean typography. A compact layout with small labels above values, arranged in a horizontal flex-wrap row, fits well in the lightbox overlay. An icon-only row would require photographers to memorize icons for metering mode, white balance, etc. -- less usable.

**Recommendation:** Horizontal flex-wrap row with small label + value pairs. Gradient background from transparent to semi-opaque black, positioned at the bottom of the slide via `slideFooter`.

### Panel Behavior on Navigation: Keep open (recommended)

Photographers browsing a series often want to compare settings across shots (e.g., "did I change ISO between these?"). Auto-closing forces re-opening on every photo. The state is a simple boolean toggle that persists across `currentSlide` changes.

**Recommendation:** Keep panel open when navigating between photos. The `useLightboxState` hook provides `currentSlide` which updates automatically; the panel just re-renders with new data.

### Missing File Handling During Backfill: Report with count (recommended)

Following the existing `backfill-blur-placeholders.ts` pattern: log each missing file, increment a "failed" counter, and include in the summary. Silent skipping hides potential storage issues.

**Recommendation:** Log missing files to stderr, count as "failed" in summary output.

## State of the Art

| Old Approach                                              | Current Approach                             | When Changed                                               | Impact                                      |
| --------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| exif-parser (parse from buffer with create/parse pattern) | exif-reader (direct function call on buffer) | exif-reader is maintained; exif-parser last published 2014 | Use exif-reader, not exif-parser            |
| Individual DB columns for each EXIF field                 | JSON column for flexible metadata            | Common pattern for EAV-style data                          | Simpler schema, easier to extend            |
| Sharp 0.32 metadata with limited EXIF support             | Sharp 0.34 with full EXIF buffer in metadata | Stable across Sharp versions                               | metadata().exif returns Buffer consistently |

**Deprecated/outdated:**

- `exif-parser`: Last npm publish in 2014. Not maintained. Use `exif-reader` instead.
- `exif-js`: Browser-only. Not usable in Node.js server context.
- `node-exif`: Uses child process to call `exiftool`. Unnecessary dependency when we already have Sharp.

## Open Questions

1. **exif-reader exact version and TypeScript API shape**
   - What we know: exif-reader ships TypeScript types (`index.d.ts`), returns object with `Image`, `Photo`, `GPSInfo` groups. Property names match EXIF standard tag names.
   - What's unclear: Exact TypeScript generic types, whether return type is fully typed or uses `any`. The npm page returned 403 during research.
   - Recommendation: Install the package and inspect the type definitions during implementation. The API is simple (one function, one Buffer argument), so risk is low.

2. **ExifData type placement in Clean Architecture**
   - What we know: Domain entities should not depend on infrastructure. ExifData is a value object describing photo metadata.
   - What's unclear: Whether to define ExifData in domain (pure) or infrastructure (tied to exif-reader output).
   - Recommendation: Define the ExifData interface in domain (`domain/entities/Photo.ts` alongside the Photo entity). The exifService in infrastructure maps from exif-reader's output to this domain type. This maintains Clean Architecture boundaries.

## Sources

### Primary (HIGH confidence)

- Sharp API documentation (https://sharp.pixelplumbing.com/api-input/) - metadata() returns exif as raw Buffer
- Sharp GitHub Issue #285 (https://github.com/lovell/sharp/issues/285) - Sharp maintainer recommends exif-reader for parsing
- exif-reader GitHub (https://github.com/devongovett/exif-reader) - API surface: single function, returns `{Image, Photo, GPSInfo, Thumbnail}` groups
- YARL Advanced API (https://yet-another-react-lightbox.com/advanced) - `useLightboxState`, `IconButton`, `createIcon`, `addToolbarButton` APIs
- YARL Documentation (https://yet-another-react-lightbox.com/documentation) - `render.slideFooter`, `toolbar.buttons` props
- YARL Customization (https://yet-another-react-lightbox.com/customization) - Slot-based styling, CSS variables, toolbar button patterns
- EXIF Standard Tag Reference (https://exiv2.org/tags.html) - Tag numbers, names, IFD groups, value types

### Secondary (MEDIUM confidence)

- YARL GitHub Discussion #223 (https://github.com/igordanchenko/yet-another-react-lightbox/discussions/223) - Overlay div pattern using render.slide with absolute positioning
- exif-reader npm page - TypeScript types included, API is `exifReader(buffer)` returning structured object

### Tertiary (LOW confidence)

- None. All findings verified with primary sources.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Sharp is already in use; exif-reader is recommended by Sharp's maintainer; YARL is already in use with documented customization APIs
- Architecture: HIGH - Pattern follows existing codebase conventions (imageService, backfill scripts, repository pattern, worker integration)
- Pitfalls: HIGH - Based on EXIF standard documentation and project's own documented lessons (ALTER TABLE, not db:push)
- UI implementation: MEDIUM - YARL toolbar + slideFooter pattern is documented, but exact rendering behavior with the Captions plugin co-existing needs implementation testing

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30 days -- stable domain, libraries not fast-moving)
