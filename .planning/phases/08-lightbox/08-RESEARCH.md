# Phase 8: Lightbox - Research

**Researched:** 2026-01-31
**Domain:** React lightbox component with keyboard/touch navigation
**Confidence:** HIGH

## Summary

This phase implements an immersive full-size photo viewing experience. The project already has public gallery pages (`/albums/[id]`) with photo grids prepared for lightbox integration (photos have `cursor-pointer` and `data-photo-id` attributes). The Photo entity includes `title` and `description` fields ready for caption display.

The standard approach uses **yet-another-react-lightbox** (YARL), the most actively maintained React lightbox library with React 19 support, TypeScript definitions, built-in keyboard/swipe navigation, and a Captions plugin for displaying photo descriptions. The library handles scroll locking, focus trapping, and intelligent image preloading out of the box.

The implementation follows Next.js App Router patterns: extract lightbox into a client component (requires `useState` for open/close), convert the album detail page to a client/server component split, and use dynamic imports to defer lightbox bundle loading until user interaction.

**Primary recommendation:** Use yet-another-react-lightbox v3.28+ with the Captions plugin, loaded via `next/dynamic` to minimize initial bundle size. Configure with solid black background, contain image fit, and hover-triggered navigation arrows.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library                    | Version | Purpose                          | Why Standard                                                                         |
| -------------------------- | ------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| yet-another-react-lightbox | 3.28.0  | Lightbox overlay with navigation | Most maintained React lightbox, React 19 support, built-in accessibility, TS support |

### Supporting

| Library              | Version    | Purpose                         | When to Use                                         |
| -------------------- | ---------- | ------------------------------- | --------------------------------------------------- |
| YARL Captions plugin | (bundled)  | Display photo title/description | Always - photo descriptions are a phase requirement |
| next/dynamic         | (built-in) | Defer lightbox bundle loading   | Always - lightbox not needed on initial page load   |

### Alternatives Considered

| Instead of                 | Could Use             | Tradeoff                                                                        |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| yet-another-react-lightbox | lightGallery          | More features but heavier bundle, license fees for commercial                   |
| yet-another-react-lightbox | react-photo-view      | Smaller (7KB) but fewer features, less Next.js documentation                    |
| yet-another-react-lightbox | Custom implementation | Full control but complex: scroll lock, focus trap, touch gestures, keyboard nav |

**Installation:**

```bash
npm install yet-another-react-lightbox
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   └── albums/
│       └── [id]/
│           └── page.tsx            # Server Component - fetches data, passes to client
├── presentation/
│   └── components/
│       ├── AlbumGallery.tsx        # Client Component - grid + lightbox state
│       └── PhotoLightbox.tsx       # Client Component - YARL wrapper (dynamically imported)
```

### Pattern 1: Server/Client Component Split

**What:** Server Component fetches data, Client Component handles interaction
**When to use:** Album detail page with lightbox
**Example:**

```typescript
// src/app/albums/[id]/page.tsx (Server Component)
import { notFound } from "next/navigation";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories/SQLiteAlbumRepository";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { AlbumGallery } from "@/presentation/components/AlbumGallery";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AlbumPage({ params }: PageProps) {
  const { id } = await params;
  const albumRepo = new SQLiteAlbumRepository();
  const photoRepo = new SQLitePhotoRepository();

  const [album, allPhotos] = await Promise.all([
    albumRepo.findById(id),
    photoRepo.findByAlbumId(id),
  ]);

  if (!album || !album.isPublished) {
    notFound();
  }

  const photos = allPhotos.filter((photo) => photo.status === "ready");

  // Pass serializable data to client component
  return (
    <AlbumGallery
      album={album}
      photos={photos.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        originalFilename: p.originalFilename,
      }))}
    />
  );
}
```

### Pattern 2: Dynamic Import for Lightbox

**What:** Defer lightbox bundle loading until user clicks a photo
**When to use:** Always - lightbox is not needed on initial page render
**Example:**

```typescript
// src/presentation/components/AlbumGallery.tsx
"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// Dynamically import lightbox - only loads when needed
const PhotoLightbox = dynamic(
  () => import("./PhotoLightbox").then((mod) => mod.PhotoLightbox),
  { ssr: false }
);

interface PhotoData {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
}

interface AlbumGalleryProps {
  album: { id: string; title: string; description: string | null };
  photos: PhotoData[];
}

export function AlbumGallery({ album, photos }: AlbumGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      {/* Photo grid with click handlers */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            onClick={() => handlePhotoClick(index)}
            className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg"
          >
            {/* Image content */}
          </div>
        ))}
      </div>

      {/* Lightbox - only rendered when open */}
      {lightboxOpen && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
```

### Pattern 3: YARL Component Wrapper

**What:** Encapsulate yet-another-react-lightbox configuration
**When to use:** Single place to configure lightbox behavior
**Example:**

```typescript
// src/presentation/components/PhotoLightbox.tsx
"use client";

import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";

interface PhotoData {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
}

interface PhotoLightboxProps {
  photos: PhotoData[];
  index: number;
  onClose: () => void;
}

export function PhotoLightbox({ photos, index, onClose }: PhotoLightboxProps) {
  const slides = photos.map((photo) => ({
    src: `/api/images/${photo.id}/2400w.webp`,
    alt: photo.title || photo.originalFilename,
    title: photo.title || undefined,
    description: photo.description || undefined,
  }));

  return (
    <Lightbox
      open={true}
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Captions]}
      // Visual configuration per phase decisions
      styles={{
        container: { backgroundColor: "rgba(0, 0, 0, 1)" },
      }}
      carousel={{
        padding: "5%",
        spacing: "10%",
        imageFit: "contain",
      }}
      // Behavior configuration
      controller={{
        closeOnBackdropClick: false, // User decision: X button only
      }}
      captions={{
        descriptionTextAlign: "center",
        descriptionMaxLines: 5,
      }}
    />
  );
}
```

### Anti-Patterns to Avoid

- **Importing lightbox in Server Component:** YARL requires client-side React hooks; always use "use client" directive
- **Static lightbox import:** Loading the full YARL bundle on page load when user may never click a photo; use dynamic import
- **Ignoring index prop:** Not passing current index causes lightbox to always open at first photo
- **Missing CSS imports:** Forgetting `yet-another-react-lightbox/styles.css` causes unstyled/broken lightbox
- **Using transparency for background:** Phase decision specifies solid black background, not transparent

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem             | Don't Build                   | Use Instead       | Why                                                         |
| ------------------- | ----------------------------- | ----------------- | ----------------------------------------------------------- |
| Scroll locking      | CSS `overflow: hidden` toggle | YARL built-in     | iOS Safari edge cases, scroll position restoration          |
| Focus trapping      | Manual focus management       | YARL built-in     | Tab order, focus restoration on close, ARIA compliance      |
| Swipe gestures      | Touch event handlers          | YARL built-in     | Velocity detection, animation physics, multi-touch handling |
| Keyboard navigation | onKeyDown handler             | YARL built-in     | Arrow keys, Escape, edge cases (first/last slide)           |
| Image preloading    | Manual Image() preload        | YARL preload prop | Limited preloading (default 2), no partial image display    |

**Key insight:** A quality lightbox requires handling scroll lock (especially iOS Safari quirks), focus trapping (a11y compliance), touch gesture physics, and keyboard navigation edge cases. YARL solves all of these with 4+ years of production battle-testing.

## Common Pitfalls

### Pitfall 1: Missing Captions CSS Import

**What goes wrong:** Captions plugin enabled but no text visible
**Why it happens:** Plugin has separate CSS file that must be imported
**How to avoid:** Always import both CSS files:

```typescript
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
```

**Warning signs:** Lightbox works but no title/description shown despite data being present

### Pitfall 2: Not Handling Empty Description

**What goes wrong:** Empty caption area takes up space or shows "null"
**Why it happens:** Passing null/empty string to description prop
**How to avoid:** Convert null to undefined:

```typescript
description: photo.description || undefined,
```

**Warning signs:** Empty caption bar visible, "null" text displayed

### Pitfall 3: Wrong Image Size for Lightbox

**What goes wrong:** Blurry photos in full-screen view
**Why it happens:** Using 600w thumbnail instead of 2400w for lightbox
**How to avoid:** Use largest processed size (2400w) for lightbox slides:

```typescript
src: `/api/images/${photo.id}/2400w.webp`,
```

**Warning signs:** Pixelated images when viewing full-size

### Pitfall 4: Dynamic Import Without SSR Disabled

**What goes wrong:** Hydration mismatch errors in console
**Why it happens:** YARL uses browser-only APIs; SSR renders different than client
**How to avoid:** Always set `ssr: false` in dynamic import:

```typescript
const PhotoLightbox = dynamic(() => import("./PhotoLightbox"), { ssr: false });
```

**Warning signs:** Console errors about hydration, flickering on page load

### Pitfall 5: State Not Synced with Lightbox Index

**What goes wrong:** Lightbox navigation doesn't update parent state
**Why it happens:** Not using `on.view` callback to sync index
**How to avoid:** Sync state if needed for URL updates or analytics:

```typescript
on={{
  view: ({ index }) => setCurrentIndex(index),
}}
```

**Warning signs:** Browser back button doesn't work as expected with lightbox

### Pitfall 6: Click-Outside Closing When Not Desired

**What goes wrong:** Lightbox closes when user clicks photo or caption
**Why it happens:** `closeOnBackdropClick: true` is triggered by click anywhere
**How to avoid:** Disable backdrop click per phase decision (X button only):

```typescript
controller={{
  closeOnBackdropClick: false,
}}
```

**Warning signs:** Accidental closes while trying to interact with photo

## Code Examples

Verified patterns from official sources:

### Complete Lightbox Component

```typescript
// Source: yet-another-react-lightbox.com/documentation + /plugins/captions
// src/presentation/components/PhotoLightbox.tsx
"use client";

import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";

interface PhotoData {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
}

interface PhotoLightboxProps {
  photos: PhotoData[];
  index: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: PhotoLightboxProps) {
  // Transform photo data to YARL slide format
  const slides = photos.map((photo) => ({
    src: `/api/images/${photo.id}/2400w.webp`,
    alt: photo.title || photo.originalFilename,
    // Only include title/description if they exist
    ...(photo.title && { title: photo.title }),
    ...(photo.description && { description: photo.description }),
  }));

  return (
    <Lightbox
      open={true}
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Captions]}
      // Solid black background (phase decision)
      styles={{
        container: { backgroundColor: "rgb(0, 0, 0)" },
      }}
      // Image display configuration
      carousel={{
        padding: "5%", // Breathing room (phase decision: 5-10%)
        spacing: "10%",
        imageFit: "contain", // Fit entirely, preserve aspect ratio
        preload: 2, // Preload adjacent slides
      }}
      // Animation timing
      animation={{
        fade: 200,
        swipe: 300,
      }}
      // Controller behavior
      controller={{
        closeOnBackdropClick: false, // X button only (phase decision)
        closeOnPullDown: false, // No swipe-down close (phase decision)
        closeOnPullUp: false,
      }}
      // Captions configuration
      captions={{
        descriptionTextAlign: "center",
        descriptionMaxLines: 5,
      }}
      // Lifecycle callbacks
      on={{
        view: ({ index: newIndex }) => onIndexChange?.(newIndex),
      }}
    />
  );
}
```

### Album Gallery Client Component

```typescript
// Source: Next.js App Router + yet-another-react-lightbox patterns
// src/presentation/components/AlbumGallery.tsx
"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { Breadcrumb } from "@/presentation/components/Breadcrumb";

// Dynamic import - lightbox bundle only loads when user clicks
const PhotoLightbox = dynamic(
  () => import("./PhotoLightbox").then((mod) => mod.PhotoLightbox),
  { ssr: false }
);

interface PhotoData {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
}

interface AlbumGalleryProps {
  album: {
    id: string;
    title: string;
    description: string | null;
  };
  photos: PhotoData[];
}

export function AlbumGallery({ album, photos }: AlbumGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleLightboxClose = () => {
    setLightboxOpen(false);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Albums", href: "/albums" },
          { label: album.title },
        ]}
      />

      <h1 className="text-3xl font-semibold text-gray-900">{album.title}</h1>

      {album.description && (
        <p className="mt-2 mb-8 text-gray-600">{album.description}</p>
      )}

      {!album.description && <div className="mb-8" />}

      {photos.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
          No photos in this album yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => handlePhotoClick(index)}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={`View ${photo.title || photo.originalFilename}`}
            >
              <Image
                src={`/api/images/${photo.id}/600w.webp`}
                alt={photo.title || photo.originalFilename}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox portal - only rendered when open */}
      {lightboxOpen && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={handleLightboxClose}
          onIndexChange={setLightboxIndex}
        />
      )}
    </main>
  );
}
```

### Custom Navigation Arrow Styling (Optional)

```typescript
// If hover-triggered arrows need custom styling
// Source: yet-another-react-lightbox.com/documentation (render prop)
render={{
  buttonPrev: photos.length <= 1 ? () => null : undefined,
  buttonNext: photos.length <= 1 ? () => null : undefined,
}}
// Navigation arrows hidden when only one photo
```

## State of the Art

| Old Approach         | Current Approach              | When Changed | Impact                                          |
| -------------------- | ----------------------------- | ------------ | ----------------------------------------------- |
| react-image-lightbox | yet-another-react-lightbox    | 2023         | Old library archived, YARL actively maintained  |
| Class components     | Hooks-based API               | React 16.8+  | Simpler state management, better tree-shaking   |
| Manual scroll lock   | Built-in scroll lock          | YARL v1+     | No iOS Safari bugs, proper position restoration |
| Static bundle import | Dynamic import with ssr:false | Next.js 13+  | Smaller initial bundle, faster page load        |

**Deprecated/outdated:**

- `react-image-lightbox`: Archived January 2023, no React 18/19 support
- `simple-react-lightbox`: Deprecated, no longer maintained
- CSS-only scroll lock: iOS Safari issues make JS solution necessary

## Open Questions

Things that couldn't be fully resolved:

1. **Loading indicator style during image load**
   - What we know: YARL has built-in loading spinner, can customize via `render.iconLoading`
   - What's unclear: Should we match app's design system or use YARL default?
   - Recommendation: Use YARL default initially; customize if needed for visual consistency

2. **Photo description maximum length**
   - What we know: `descriptionMaxLines: 5` limits visible lines with ellipsis
   - What's unclear: Optimal line count for mobile vs desktop
   - Recommendation: Start with 5 lines; adjust based on testing

3. **Navigation button hover behavior on mobile**
   - What we know: Hover-triggered visibility doesn't apply to touch devices
   - What's unclear: Should buttons be always-visible on mobile or gesture-only?
   - Recommendation: YARL handles this automatically - buttons show on touch, hide after timeout

## Sources

### Primary (HIGH confidence)

- [yet-another-react-lightbox.com](https://yet-another-react-lightbox.com/) - Official documentation
- [yet-another-react-lightbox.com/documentation](https://yet-another-react-lightbox.com/documentation) - Full API reference
- [yet-another-react-lightbox.com/plugins/captions](https://yet-another-react-lightbox.com/plugins/captions) - Captions plugin API
- [yet-another-react-lightbox.com/examples/nextjs](https://yet-another-react-lightbox.com/examples/nextjs) - Next.js integration guide
- [GitHub: igordanchenko/yet-another-react-lightbox](https://github.com/igordanchenko/yet-another-react-lightbox) - v3.28.0 (Dec 2025)

### Secondary (MEDIUM confidence)

- [Next.js Dynamic Import](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading) - Official lazy loading docs
- [WAI-ARIA Modal Best Practices](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) - Accessibility patterns

### Tertiary (LOW confidence)

- WebSearch results on React lightbox comparison - general ecosystem awareness

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - YARL is clearly the most maintained option, verified with official docs and GitHub
- Architecture: HIGH - Dynamic import pattern from official Next.js docs, YARL Next.js guide
- Pitfalls: HIGH - Documented in YARL issues/discussions and official migration guide

**Research date:** 2026-01-31
**Valid until:** 2026-03-01 (30 days - YARL stable, patterns established)
