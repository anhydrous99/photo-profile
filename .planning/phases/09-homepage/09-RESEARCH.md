# Phase 9: Homepage - Research

**Researched:** 2026-02-01
**Domain:** Next.js homepage with random photo selection and hero + grid layout
**Confidence:** HIGH

## Summary

This phase implements a curated homepage displaying random photos from across all albums with a hero + grid layout. The project already has all the infrastructure needed: SQLite database with photos/albums, Drizzle ORM repositories, image derivatives at multiple sizes (300/600/1200/2400 widths), existing PhotoLightbox component for full-screen viewing, and Tailwind CSS for styling.

The standard approach uses SQLite's `ORDER BY RANDOM()` with Drizzle's `sql` template operator to fetch a random selection of photos. For the expected dataset size (hundreds to low thousands of photos), `ORDER BY RANDOM()` is performant enough (< 50ms for 10K rows). The hero + grid layout uses CSS Grid with a featured large image followed by a smaller 2-3 column grid below. Photos are filtered to only include those from published albums with status "ready".

The homepage follows the same Server/Client component split pattern established in Phase 8: a Server Component fetches random photos and passes them to a Client Component that handles lightbox state. The existing PhotoLightbox component is reused with dynamic import. Per phase decisions, the design is minimalist with white background, no borders/shadows, and spacious whitespace.

**Primary recommendation:** Use `sql\`RANDOM()\`` in Drizzle query to fetch 7-9 random photos, display first photo as hero (aspect-ratio: 3/2 or 4/3), remaining photos in 2-3 column grid below, reuse PhotoLightbox with navigation scoped to homepage photos only.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library            | Version | Purpose                           | Why Standard                      |
| ------------------ | ------- | --------------------------------- | --------------------------------- |
| Next.js App Router | 16.1.6  | Server Components, page structure | Already in project                |
| Drizzle ORM        | 0.45.1  | Random photo query with sql``     | Already in project, type-safe SQL |
| Tailwind CSS       | 4.x     | Hero + grid layout, whitespace    | Already in project, utility-first |
| YARL               | 3.28.0  | Lightbox for photo viewing        | Already installed (Phase 8)       |

### Supporting

| Library      | Version    | Purpose                 | When to Use               |
| ------------ | ---------- | ----------------------- | ------------------------- |
| next/image   | (built-in) | Optimized image display | All photo rendering       |
| next/dynamic | (built-in) | Defer lightbox loading  | Lightbox component import |
| next/link    | (built-in) | Navigation to /albums   | Header navigation         |

### Alternatives Considered

| Instead of         | Could Use              | Tradeoff                                            |
| ------------------ | ---------------------- | --------------------------------------------------- |
| ORDER BY RANDOM()  | Pre-shuffled cache     | Overkill for < 10K photos; adds complexity          |
| CSS Grid           | Masonry layout library | Masonry more complex; uniform grid cleaner for hero |
| Server-side random | Client-side shuffle    | SEO worse; flash of different content on hydration  |

**Installation:**
No new packages required - all dependencies already installed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Homepage - Server Component (replaces default)
│   └── layout.tsx                  # Add minimal header with Albums link
├── presentation/
│   └── components/
│       ├── HomepageClient.tsx      # Client Component - hero + grid + lightbox state
│       ├── PhotoLightbox.tsx       # Existing - reused as-is
│       └── Header.tsx              # Minimal nav with Albums link + logo/initials
├── domain/
│   └── repositories/
│       └── PhotoRepository.ts      # Add findRandomPublished() method
├── infrastructure/
│   └── database/
│       └── repositories/
│           └── SQLitePhotoRepository.ts  # Implement findRandomPublished()
```

### Pattern 1: Random Photo Selection with Drizzle

**What:** Query random photos from published albums only
**When to use:** Homepage photo selection
**Example:**

```typescript
// Source: Drizzle ORM sql operator docs + SQLite RANDOM() function
// src/infrastructure/database/repositories/SQLitePhotoRepository.ts
import { sql, eq, and, inArray } from "drizzle-orm";
import { db } from "../client";
import { photos, photoAlbums, albums } from "../schema";

async findRandomFromPublishedAlbums(limit: number): Promise<Photo[]> {
  // Get IDs of photos in published albums with status "ready"
  const results = await db
    .select({ photo: photos })
    .from(photos)
    .innerJoin(photoAlbums, eq(photos.id, photoAlbums.photoId))
    .innerJoin(albums, eq(photoAlbums.albumId, albums.id))
    .where(
      and(
        eq(photos.status, "ready"),
        eq(albums.isPublished, true)
      )
    )
    .groupBy(photos.id) // Dedupe photos in multiple albums
    .orderBy(sql`RANDOM()`)
    .limit(limit);

  return results.map((r) => this.toDomain(r.photo));
}
```

### Pattern 2: Hero + Grid Layout

**What:** Large featured photo followed by smaller grid
**When to use:** Homepage layout (phase decision)
**Example:**

```typescript
// Hero section - first photo prominently displayed
<section className="w-full">
  <div className="relative aspect-[3/2] w-full">
    <Image
      src={`/api/images/${heroPhoto.id}/1200w.webp`}
      alt={heroPhoto.title || heroPhoto.originalFilename}
      fill
      sizes="100vw"
      className="object-cover"
      priority  // Hero is LCP element
    />
  </div>
</section>

// Grid section - remaining photos
<section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-6">
  {gridPhotos.map((photo, index) => (
    <button
      key={photo.id}
      onClick={() => handlePhotoClick(index + 1)} // +1 for hero offset
      className="relative aspect-square"
    >
      <Image
        src={`/api/images/${photo.id}/600w.webp`}
        alt={photo.title || photo.originalFilename}
        fill
        sizes="(max-width: 768px) 50vw, 33vw"
        className="object-cover"
      />
    </button>
  ))}
</section>
```

### Pattern 3: Server/Client Component Split

**What:** Server fetches data, Client handles interaction
**When to use:** Homepage with lightbox
**Example:**

```typescript
// src/app/page.tsx (Server Component)
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { HomepageClient } from "@/presentation/components/HomepageClient";

export default async function HomePage() {
  const photoRepo = new SQLitePhotoRepository();
  const photos = await photoRepo.findRandomFromPublishedAlbums(8);

  // No photos available - show placeholder
  if (photos.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">No photos available yet.</p>
      </main>
    );
  }

  return (
    <HomepageClient
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

### Pattern 4: Minimal Header

**What:** Simple navigation with Albums link and logo/initials
**When to use:** Site-wide header (phase decision)
**Example:**

```typescript
// src/presentation/components/Header.tsx
import Link from "next/link";

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      {/* Logo/Initials - links to home */}
      <Link href="/" className="text-lg font-medium text-gray-900">
        {/* Could be initials, small logo, or text */}
        Portfolio
      </Link>

      {/* Albums link */}
      <nav>
        <Link
          href="/albums"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Albums
        </Link>
      </nav>
    </header>
  );
}
```

### Anti-Patterns to Avoid

- **Client-side random shuffle:** Causes hydration mismatch and flash of different content; use server-side ORDER BY RANDOM()
- **Including unpublished album photos:** Always filter by `albums.isPublished = true`
- **Including processing/error photos:** Always filter by `photos.status = 'ready'`
- **Not setting priority on hero image:** Hero is LCP element; needs priority loading
- **Adding hover effects:** Phase decision specifies no borders, shadows, or hover effects
- **Complex header:** Phase decision specifies minimal header with just Albums link + logo

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem            | Don't Build               | Use Instead             | Why                                             |
| ------------------ | ------------------------- | ----------------------- | ----------------------------------------------- |
| Random selection   | JS shuffle after fetching | SQL ORDER BY RANDOM()   | Database-level is more efficient for large sets |
| Lightbox           | Custom modal              | Existing PhotoLightbox  | Already built in Phase 8 with all features      |
| Image optimization | Manual srcset             | next/image              | Automatic optimization, srcset generation       |
| Layout             | Complex CSS positioning   | Tailwind Grid utilities | Simpler, responsive out of the box              |

**Key insight:** The homepage is primarily a composition of existing patterns. Use the PhotoLightbox from Phase 8, the grid patterns from Phase 7, and standard Drizzle queries with `sql` operator for random selection.

## Common Pitfalls

### Pitfall 1: Photos from Unpublished Albums Showing

**What goes wrong:** Homepage shows photos from draft/unpublished albums
**Why it happens:** Querying photos table directly without join to albums
**How to avoid:** Always JOIN with albums table and filter `isPublished = true`
**Warning signs:** Photos visible on homepage but not in any public album

### Pitfall 2: Duplicate Photos When in Multiple Albums

**What goes wrong:** Same photo appears multiple times in grid
**Why it happens:** Photo is in multiple albums; JOIN creates duplicates
**How to avoid:** Use `GROUP BY photos.id` in query to deduplicate
**Warning signs:** Recognizable photos appearing 2-3 times in random selection

### Pitfall 3: Random Selection Not Changing on Refresh

**What goes wrong:** Same photos on every page load
**Why it happens:** Next.js caching the page or query result
**How to avoid:**

- For development: `export const dynamic = 'force-dynamic'`
- For production: Consider revalidation strategy or keep dynamic
  **Warning signs:** Identical photos after multiple refreshes

### Pitfall 4: Hero Image Slow to Load

**What goes wrong:** Large Contentful Paint (LCP) poor score
**Why it happens:** Hero image not prioritized, or using wrong size
**How to avoid:**

- Set `priority` prop on hero Image
- Use 1200w for hero (good balance of quality/speed)
- Use 600w for grid images
  **Warning signs:** Lighthouse LCP warnings, visible loading delay on hero

### Pitfall 5: Lightbox Navigation Escaping Homepage Photos

**What goes wrong:** User can navigate to photos not on homepage
**Why it happens:** Passing wrong photo array to lightbox
**How to avoid:** Pass only the 7-9 homepage photos to PhotoLightbox, not all photos
**Warning signs:** Navigating to unexpected photos in lightbox

### Pitfall 6: Layout Shift When Images Load

**What goes wrong:** Content jumps around as images load
**Why it happens:** No aspect ratio set, images change dimensions on load
**How to avoid:** Use `aspect-[3/2]` for hero, `aspect-square` for grid
**Warning signs:** Visible layout shifts, poor CLS score

## Code Examples

Verified patterns from official sources:

### Random Photo Repository Method

```typescript
// Source: Drizzle ORM sql operator + SQLite RANDOM()
// src/infrastructure/database/repositories/SQLitePhotoRepository.ts

import { sql, eq, and } from "drizzle-orm";
import { db } from "../client";
import { photos, photoAlbums, albums } from "../schema";
import type { Photo } from "@/domain/entities/Photo";

// Add to existing SQLitePhotoRepository class:

async findRandomFromPublishedAlbums(limit: number): Promise<Photo[]> {
  const results = await db
    .select({ photo: photos })
    .from(photos)
    .innerJoin(photoAlbums, eq(photos.id, photoAlbums.photoId))
    .innerJoin(albums, eq(photoAlbums.albumId, albums.id))
    .where(
      and(
        eq(photos.status, "ready"),
        eq(albums.isPublished, true)
      )
    )
    .groupBy(photos.id)
    .orderBy(sql`RANDOM()`)
    .limit(limit);

  return results.map((r) => this.toDomain(r.photo));
}
```

### Homepage Server Component

```typescript
// Source: Next.js App Router data fetching patterns
// src/app/page.tsx

import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { HomepageClient } from "@/presentation/components/HomepageClient";
import { Header } from "@/presentation/components/Header";

// Force dynamic rendering so random changes on each request
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const photoRepo = new SQLitePhotoRepository();

  // Fetch 8 random photos (1 hero + 7 grid = 8 total)
  const photos = await photoRepo.findRandomFromPublishedAlbums(8);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {photos.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-gray-500">No photos available yet.</p>
          </div>
        ) : (
          <HomepageClient
            photos={photos.map((p) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              originalFilename: p.originalFilename,
            }))}
          />
        )}
      </main>
    </>
  );
}
```

### Homepage Client Component

```typescript
// Source: Phase 8 AlbumGalleryClient pattern adapted for homepage
// src/presentation/components/HomepageClient.tsx

"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";

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

interface HomepageClientProps {
  photos: PhotoData[];
}

export function HomepageClient({ photos }: HomepageClientProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // First photo is hero, rest are grid
  const heroPhoto = photos[0];
  const gridPhotos = photos.slice(1);

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      {/* Hero section - featured photo */}
      <section className="mb-8">
        <button
          type="button"
          onClick={() => handlePhotoClick(0)}
          className="relative aspect-[3/2] w-full cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          aria-label={`View ${heroPhoto.title || heroPhoto.originalFilename}`}
        >
          <Image
            src={`/api/images/${heroPhoto.id}/1200w.webp`}
            alt={heroPhoto.title || heroPhoto.originalFilename}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </button>
      </section>

      {/* Grid section - remaining photos */}
      {gridPhotos.length > 0 && (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-6">
          {gridPhotos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => handlePhotoClick(index + 1)}
              className="relative aspect-square cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              aria-label={`View ${photo.title || photo.originalFilename}`}
            >
              <Image
                src={`/api/images/${photo.id}/600w.webp`}
                alt={photo.title || photo.originalFilename}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
              />
            </button>
          ))}
        </section>
      )}

      {/* Lightbox - navigation stays within homepage photos */}
      {lightboxOpen && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}
```

### Minimal Header Component

```typescript
// Source: Phase context decisions
// src/presentation/components/Header.tsx

import Link from "next/link";

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link
        href="/"
        className="text-lg font-medium tracking-tight text-gray-900"
      >
        {/* Logo/initials - Claude's discretion */}
        AP
      </Link>

      <nav>
        <Link
          href="/albums"
          className="text-sm text-gray-600 transition-colors hover:text-gray-900"
        >
          Albums
        </Link>
      </nav>
    </header>
  );
}
```

## State of the Art

| Old Approach          | Current Approach              | When Changed     | Impact                                     |
| --------------------- | ----------------------------- | ---------------- | ------------------------------------------ |
| Client-side shuffle   | Server-side ORDER BY RANDOM() | Always preferred | No hydration mismatch, better SEO          |
| priority prop         | preload prop on next/image    | Next.js 16       | Clearer semantics for LCP images           |
| Manual srcset         | next/image sizes prop         | Always           | Automatic srcset based on device sizes     |
| Complex shuffle algos | SQL RANDOM()                  | Always for < 10K | Database handles randomization efficiently |

**Deprecated/outdated:**

- `priority` on Image: Use `preload` in Next.js 16 (though priority still works)
- Client-side data fetching for homepage: Use Server Components for better SEO
- Shuffle after fetch: Let database handle randomization for efficiency

## Open Questions

Things that couldn't be fully resolved:

1. **Hero photo aspect ratio choice**
   - What we know: Common choices are 16:9, 3:2, 4:3
   - What's unclear: Optimal ratio for photography portfolio
   - Recommendation: Use 3:2 (standard photo aspect ratio) with `object-cover` to handle varying source ratios. Adjust if testing shows 16:9 works better for horizontal impact.

2. **Grid photo count exact number**
   - What we know: Phase context says "6-8 photos below hero"
   - What's unclear: Optimal for layout balance
   - Recommendation: Fetch 8 total (1 hero + 7 grid). On 2-col mobile this is 4 rows, on 3-col desktop this is 3 rows with one short. Could adjust to 7 total for cleaner 3x2 grid on desktop.

3. **Logo/initials design**
   - What we know: Header should have logo/initials per phase context
   - What's unclear: What text/initials to use
   - Recommendation: Use simple text placeholder ("Portfolio" or initials like "AP") - can be customized later. Keep it minimal and text-based per phase aesthetic.

4. **Cache strategy for random selection**
   - What we know: `export const dynamic = 'force-dynamic'` ensures fresh random on each request
   - What's unclear: Is per-request randomization desired, or should there be some stability?
   - Recommendation: Start with `force-dynamic` per requirement "changes on page refresh". If performance becomes an issue, consider revalidate period.

## Sources

### Primary (HIGH confidence)

- [Drizzle ORM sql operator](https://orm.drizzle.team/docs/sql) - Custom SQL expressions including ORDER BY
- [SQLite RANDOM() Function](https://www.sqlitetutorial.net/sqlite-functions/sqlite-random/) - Random ordering in SQLite
- [Next.js Image Component](https://nextjs.org/docs/app/api-reference/components/image) - priority, fill, sizes props
- [Next.js App Router Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching/patterns) - Server Component patterns
- Existing codebase: AlbumGalleryClient.tsx, PhotoLightbox.tsx - Established patterns

### Secondary (MEDIUM confidence)

- [Fast SQLite Sampling](https://alexwlchan.net/2025/fast-sqlite-samples/) - ORDER BY RANDOM() performance analysis
- [Tailwind CSS Grid](https://tailwindcss.com/docs/grid-template-columns) - Responsive grid utilities

### Tertiary (LOW confidence)

- WebSearch results on photo gallery layouts - general design patterns

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Using existing project dependencies only
- Architecture: HIGH - Follows established Phase 7/8 patterns exactly
- Random selection: HIGH - Drizzle sql operator verified in official docs
- Pitfalls: MEDIUM - Some derived from general Next.js/photo gallery experience

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (30 days - patterns stable, stack unchanged)
