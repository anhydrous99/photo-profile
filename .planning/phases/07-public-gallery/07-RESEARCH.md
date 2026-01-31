# Phase 7: Public Gallery - Research

**Researched:** 2026-01-31
**Domain:** Next.js App Router public gallery with responsive image serving
**Confidence:** HIGH

## Summary

This phase implements a public-facing gallery for visitors to browse albums and view photos. The project already has a solid foundation: SQLite database with albums/photos tables, Drizzle ORM repositories, Sharp-based image processing generating WebP and AVIF derivatives at 300/600/1200/2400 widths, and Tailwind CSS for styling.

The standard approach uses Next.js App Router with Server Components for data fetching, dynamic routes for album pages (`/albums/[id]`), and a dedicated API route to serve processed images from the storage directory (since files are outside `/public`). The existing `THUMBNAIL_SIZES` (300, 600, 1200, 2400) map directly to srcset breakpoints. For the responsive grid, Tailwind's built-in grid utilities with responsive prefixes (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) provide clean, CSS-only responsive layouts.

**Primary recommendation:** Use Next.js Server Components with direct database access for album/photo fetching, serve processed images via an API route that returns file streams with proper Content-Type headers, and implement responsive grids using Tailwind CSS grid utilities with `sizes` attribute for srcset optimization.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library            | Version | Purpose                                        | Why Standard                                |
| ------------------ | ------- | ---------------------------------------------- | ------------------------------------------- |
| Next.js App Router | 16.1.6  | Server Components, routing, Image optimization | Already in project, first-class SSR support |
| Tailwind CSS       | 4.x     | Responsive grid layouts                        | Already in project, utility-first approach  |
| Drizzle ORM        | 0.45.1  | Database queries for albums/photos             | Already in project, type-safe SQL           |

### Supporting

| Library        | Version    | Purpose                                | When to Use                         |
| -------------- | ---------- | -------------------------------------- | ----------------------------------- |
| next/image     | (built-in) | Image component with srcset generation | Responsive images with optimization |
| React Suspense | (built-in) | Streaming for photo grids              | Loading states while data fetches   |

### Alternatives Considered

| Instead of           | Could Use              | Tradeoff                                                      |
| -------------------- | ---------------------- | ------------------------------------------------------------- |
| Native Tailwind grid | next-gallery package   | Adds dependency; native solution sufficient for uniform grids |
| API route for images | Symlink to public/     | Symlinks fragile in Docker/Vercel; API route more portable    |
| next/image           | Custom img with srcset | Lose automatic optimization; more manual work                 |

**Installation:**
No new packages required - all dependencies already installed.

## Architecture Patterns

### Recommended Project Structure

```
src/app/
├── albums/
│   ├── page.tsx           # Album listing (Server Component)
│   └── [id]/
│       └── page.tsx       # Album detail with photo grid (Server Component)
├── api/
│   └── images/
│       └── [photoId]/
│           └── [filename]/
│               └── route.ts  # Serve processed images from storage
├── page.tsx               # Homepage (Phase 9, not this phase)
```

### Pattern 1: Server Component Data Fetching

**What:** Fetch album and photo data directly in Server Components using repositories
**When to use:** All public gallery pages (album list, album detail)
**Example:**

```typescript
// Source: Next.js App Router docs - Server Component fetching
// src/app/albums/page.tsx
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories/SQLiteAlbumRepository";

export default async function AlbumsPage() {
  const albumRepo = new SQLiteAlbumRepository();
  const albums = await albumRepo.findPublished(); // Already sorted by sortOrder

  return (
    <main>
      <h1>Albums</h1>
      <AlbumList albums={albums} />
    </main>
  );
}
```

### Pattern 2: API Route for Image Serving

**What:** Serve processed images from storage directory via streaming API route
**When to use:** All image requests for photos stored outside /public
**Example:**

```typescript
// Source: Next.js API Routes docs + GitHub discussions
// src/app/api/images/[photoId]/[filename]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { env } from "@/infrastructure/config/env";

const MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string; filename: string }> },
) {
  const { photoId, filename } = await params;
  const ext = filename.substring(filename.lastIndexOf("."));
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  const filePath = join(env.STORAGE_PATH, "processed", photoId, filename);

  try {
    const [file, stats] = await Promise.all([
      readFile(filePath),
      stat(filePath),
    ]);

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stats.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
```

### Pattern 3: Responsive Grid with Tailwind

**What:** CSS Grid with responsive breakpoints matching phase requirements
**When to use:** Photo grid on album detail pages
**Example:**

```typescript
// Phase context: 1 col phone, 2 col tablet, 3 col desktop
<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
  {photos.map((photo) => (
    <div key={photo.id} className="relative aspect-square">
      <Image
        src={`/api/images/${photo.id}/600w.webp`}
        alt={photo.title || "Photo"}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="object-cover"
      />
    </div>
  ))}
</div>
```

### Pattern 4: Breadcrumb Navigation

**What:** Accessible breadcrumb with semantic HTML and ARIA
**When to use:** Album detail pages
**Example:**

```typescript
// Source: WAI-ARIA breadcrumb best practices
interface BreadcrumbProps {
  items: { label: string; href?: string }[];
}

function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center gap-2 text-sm text-gray-600">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-gray-900">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-gray-900">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

### Anti-Patterns to Avoid

- **Client-side data fetching:** Don't use useEffect/useState for album data; use Server Components for better performance and SEO
- **Symlinks to public:** Don't symlink storage/ to public/; fragile in containerized environments, use API route
- **Hardcoded image URLs:** Don't hardcode widths; use the existing THUMBNAIL_SIZES constant for consistency
- **Missing sizes attribute:** Without sizes, browser downloads 100vw images; always specify sizes for responsive images

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                | Don't Build                   | Use Instead                              | Why                                             |
| ---------------------- | ----------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Responsive srcset      | Manual srcset string building | next/image with sizes prop               | Automatic srcset generation, format negotiation |
| Image format selection | Content negotiation logic     | Browser Accept header + multiple formats | Serve both WebP and AVIF, let browser choose    |
| Grid responsiveness    | Custom CSS media queries      | Tailwind responsive prefixes             | Consistent breakpoints, less code               |
| Route params typing    | Manual type casting           | Next.js typed params (Promise<>)         | Type safety, proper async handling              |

**Key insight:** Next.js App Router and Tailwind already solve responsive image and layout problems. Focus on wiring them to your data, not reimplementing their features.

## Common Pitfalls

### Pitfall 1: Blocking on Image API Route

**What goes wrong:** Reading entire file into memory before responding causes latency for large images
**Why it happens:** Using `readFile` instead of streaming for simplicity
**How to avoid:** For processed thumbnails (< 2MB typically), `readFile` is acceptable. For originals, use `fs.createReadStream` with ReadableStream. Since we're serving processed thumbnails (max ~500KB), `readFile` is fine.
**Warning signs:** Memory spikes when serving many concurrent requests

### Pitfall 2: Missing Cache Headers on Image Route

**What goes wrong:** Browser re-fetches images on every page navigation
**Why it happens:** Forgetting to set Cache-Control headers on API route
**How to avoid:** Always include `Cache-Control: public, max-age=31536000, immutable` for processed images (they never change)
**Warning signs:** Slow page transitions, high bandwidth usage in network tab

### Pitfall 3: Wrong sizes Attribute

**What goes wrong:** Browser downloads larger images than needed, wasting bandwidth
**Why it happens:** Copy-pasting sizes without thinking about actual layout
**How to avoid:** Match sizes to grid columns: 100vw for 1-col, 50vw for 2-col, 33vw for 3-col
**Warning signs:** Network tab shows 1200w images loading on mobile

### Pitfall 4: Forgetting isPublished Filter

**What goes wrong:** Unpublished albums visible to public visitors
**Why it happens:** Using findAll() instead of findPublished()
**How to avoid:** Always use `findPublished()` on public pages; repo already has this method
**Warning signs:** Seeing draft albums on public gallery

### Pitfall 5: Not Handling Missing Cover Photos

**What goes wrong:** Album list crashes or shows broken images
**Why it happens:** Album.coverPhotoId can be null; Photo might be deleted
**How to avoid:** Fallback to first photo in album, or show placeholder icon
**Warning signs:** Broken image icons or React errors in console

### Pitfall 6: Async Params in Next.js 16

**What goes wrong:** TypeScript errors, params undefined
**Why it happens:** Next.js 16 changed params to Promise<>
**How to avoid:** Always `await params` in page/route handlers
**Warning signs:** "params is not iterable" or undefined errors

## Code Examples

Verified patterns from official sources:

### Album Listing Page (Server Component)

```typescript
// Source: Next.js App Router data fetching patterns
// src/app/albums/page.tsx
import Link from "next/link";
import Image from "next/image";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories/SQLiteAlbumRepository";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";

export default async function AlbumsPage() {
  const albumRepo = new SQLiteAlbumRepository();
  const albums = await albumRepo.findPublished();

  // Pre-fetch cover photos for albums without coverPhotoId
  const photoRepo = new SQLitePhotoRepository();
  const albumsWithCovers = await Promise.all(
    albums.map(async (album) => {
      let coverId = album.coverPhotoId;
      if (!coverId) {
        const photos = await photoRepo.findByAlbumId(album.id);
        coverId = photos[0]?.id || null;
      }
      return { ...album, resolvedCoverId: coverId };
    })
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-semibold">Albums</h1>
      <ul className="space-y-4">
        {albumsWithCovers.map((album) => (
          <li key={album.id}>
            <Link
              href={`/albums/${album.id}`}
              className="flex items-center gap-4 rounded-lg p-2 transition-colors hover:bg-gray-50"
            >
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                {album.resolvedCoverId ? (
                  <Image
                    src={`/api/images/${album.resolvedCoverId}/300w.webp`}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <span className="font-medium text-gray-900">{album.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

### Album Detail Page with Photo Grid

```typescript
// Source: Next.js App Router + Tailwind grid patterns
// src/app/albums/[id]/page.tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories/SQLiteAlbumRepository";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { Breadcrumb } from "@/presentation/components/Breadcrumb";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AlbumPage({ params }: PageProps) {
  const { id } = await params;

  const albumRepo = new SQLiteAlbumRepository();
  const photoRepo = new SQLitePhotoRepository();

  const [album, photos] = await Promise.all([
    albumRepo.findById(id),
    photoRepo.findByAlbumId(id),
  ]);

  if (!album || !album.isPublished) {
    notFound();
  }

  // Filter to only ready photos
  const readyPhotos = photos.filter((p) => p.status === "ready");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Albums", href: "/albums" },
          { label: album.title },
        ]}
      />

      <h1 className="mb-2 text-3xl font-semibold">{album.title}</h1>
      {album.description && (
        <p className="mb-8 text-gray-600">{album.description}</p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {readyPhotos.map((photo) => (
          <div
            key={photo.id}
            className="relative aspect-square overflow-hidden rounded-lg bg-gray-100"
          >
            <Image
              src={`/api/images/${photo.id}/600w.webp`}
              alt={photo.title || ""}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform hover:scale-105"
            />
          </div>
        ))}
      </div>

      {readyPhotos.length === 0 && (
        <p className="text-center text-gray-500">No photos in this album yet.</p>
      )}
    </main>
  );
}
```

### Image Serving API Route

```typescript
// src/app/api/images/[photoId]/[filename]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join, extname } from "path";
import { env } from "@/infrastructure/config/env";

const MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

interface RouteParams {
  params: Promise<{ photoId: string; filename: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { photoId, filename } = await params;

  // Validate filename to prevent directory traversal
  if (filename.includes("..") || filename.includes("/")) {
    return new NextResponse("Invalid filename", { status: 400 });
  }

  const ext = extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) {
    return new NextResponse("Unsupported format", { status: 400 });
  }

  const filePath = join(env.STORAGE_PATH, "processed", photoId, filename);

  try {
    const [file, stats] = await Promise.all([
      readFile(filePath),
      stat(filePath),
    ]);

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stats.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return new NextResponse("Not found", { status: 404 });
  }
}
```

## State of the Art

| Old Approach       | Current Approach             | When Changed           | Impact                                       |
| ------------------ | ---------------------------- | ---------------------- | -------------------------------------------- |
| getServerSideProps | Server Components with async | Next.js 13+ App Router | Simpler data fetching, no prop drilling      |
| priority prop      | preload prop on next/image   | Next.js 16             | Clearer semantics for LCP images             |
| untyped params     | Promise-based params         | Next.js 15+            | Must await params in handlers                |
| srcset manual      | next/image sizes prop        | Always                 | Automatic srcset based on deviceSizes config |

**Deprecated/outdated:**

- `getServerSideProps`/`getStaticProps`: Use Server Components instead
- `priority` on Image: Use `preload` in Next.js 16
- `layout="responsive"`: Use `fill` with container styling

## Open Questions

Things that couldn't be fully resolved:

1. **Photo aspect ratio handling**
   - What we know: Project generates fixed-width derivatives; original aspect ratios vary
   - What's unclear: Should grid use uniform squares (crop) or preserve aspect ratio (masonry)?
   - Recommendation: Start with uniform squares (`aspect-square` + `object-cover`) for clean grid; masonry is more complex and can be added later. Context says "Claude's discretion" on grid arrangement.

2. **Photo click behavior (lightbox stub)**
   - What we know: Phase 8 handles lightbox; Phase 7 needs to prepare for it
   - What's unclear: Stub vs no-op? Data attributes for lightbox?
   - Recommendation: Make photos clickable with `cursor-pointer` and pass through to parent; Phase 8 can add lightbox logic. Consider adding `data-photo-id` attribute.

3. **Album URL structure (id vs slug)**
   - What we know: Albums have id (UUID) but no slug field; Context says "Claude's discretion"
   - What's unclear: Add slug to schema or use id?
   - Recommendation: Use `/albums/[id]` for simplicity; slug would require schema migration and uniqueness handling. IDs work fine and are already available.

## Sources

### Primary (HIGH confidence)

- [Next.js Image Component](https://nextjs.org/docs/app/api-reference/components/image) - srcset, sizes, fill, quality, loaders
- [Next.js Data Fetching Patterns](https://nextjs.org/docs/14/app/building-your-application/data-fetching/patterns) - Server Component fetching, parallel fetching, Suspense
- [Next.js Dynamic Routes](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes) - Route segments, params Promise type
- [Tailwind CSS Grid](https://tailwindcss.com/docs/grid-template-columns) - Responsive grid utilities

### Secondary (MEDIUM confidence)

- [GitHub Discussion: Serve files outside public](https://github.com/vercel/next.js/discussions/48647) - API route approach for external storage
- [WAI-ARIA Breadcrumb](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/) - Accessibility best practices

### Tertiary (LOW confidence)

- Various blog posts on photo galleries - general patterns, verified against official docs

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Using existing project dependencies
- Architecture: HIGH - Based on official Next.js App Router documentation
- Pitfalls: HIGH - Derived from official docs and known Next.js 16 changes
- Image serving: MEDIUM - API route pattern verified in GitHub discussions

**Research date:** 2026-01-31
**Valid until:** 2026-03-01 (30 days - Next.js stable, patterns established)
