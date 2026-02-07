# Phase 14: Shareability - Research

**Researched:** 2026-02-06
**Domain:** Next.js App Router metadata, URL management, OpenGraph tags, deep linking
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Path segment URLs** (not hash or query param): `/photo/{slug}` for homepage photos, `/albums/{albumId}/photo/{slug}` for album photos
2. **Short slug** = first 8 characters of the UUID (e.g., `/photo/a1b2c3d4`)
3. **No share affordances** in this phase (no copy-link button or share icon). Users share via browser URL bar.

### Claude's Discretion

Claude has wide latitude on this phase. Key discretion areas:

- **History management:** replaceState vs pushState (pick what avoids excessive history entries per success criteria)
- **Deep link landing view:** lightbox over gallery vs dedicated page
- **Album photo deep link navigation:** full album navigation in lightbox or single photo only
- **Missing/deleted photo URLs:** 404 vs redirect
- **Context cues:** breadcrumb, album name based on existing design language
- **Photo OG card content:** whether to include EXIF data in description
- **Homepage OG:** whether site name/description come from env vars or defaults
- **OG image sizing:** whether to generate 1200x630 OG-specific derivative or reuse existing derivatives
- **Twitter/X card format:** summary_large_image vs summary

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.

**Additional Out of Scope (from REQUIREMENTS.md):**

- Standalone `/photos/[id]` page -- "Photos belong in album context; query param deep linking sufficient"
- Dynamic OG image generation -- "The actual photo is a better OG image than a generated card"

</user_constraints>

## Summary

This phase adds shareability to the photography portfolio through two complementary features: (1) URL-based photo deep linking that updates the browser URL when navigating photos in the lightbox and resolves those URLs back to the correct photo, and (2) OpenGraph meta tags on the homepage, album pages, and photo deep links so shared URLs produce rich previews on social media.

The codebase already has all the infrastructure needed. The existing YARL lightbox has an `on.view` callback for detecting slide changes. Next.js App Router natively supports `window.history.replaceState` for URL updates without re-renders. The `generateMetadata` function provides dynamic OG tags with full access to route params and database queries. The existing image API at `/api/images/[photoId]/[filename]` already serves WebP derivatives at multiple widths with immutable caching -- the 1200w derivative is ideal for OG images.

The key architectural decision is how to handle deep link landing: when a user navigates directly to `/albums/{albumId}/photo/{slug}`, what renders? The recommended approach is to reuse the existing album page server component and pass the photo slug as context, so the `AlbumGalleryClient` opens the lightbox immediately on mount at the correct index. This avoids creating new page routes, stays consistent with the "photos belong in album context" design principle, and leverages existing code. For homepage photos at `/photo/{slug}`, a new thin page route resolves the slug to a photo, determines which album it belongs to, and either renders a minimal lightbox view or redirects to the album context.

**Primary recommendation:** Use `window.history.replaceState` for URL updates in the lightbox (avoiding excessive history entries), `generateMetadata` for dynamic OG tags on album and photo routes, and reuse the 1200w WebP derivative as the OG image (no new image generation needed).

## Standard Stack

No new libraries are needed. This phase uses existing dependencies and built-in Next.js APIs exclusively.

### Core

| Library/API                   | Version            | Purpose                                       | Why Standard                                                             |
| ----------------------------- | ------------------ | --------------------------------------------- | ------------------------------------------------------------------------ |
| Next.js `generateMetadata`    | 16.1.6 (installed) | Dynamic OG meta tags per route                | Built-in, server-side, type-safe Metadata API                            |
| Next.js `metadata` export     | 16.1.6 (installed) | Static OG meta tags (homepage)                | Built-in for static metadata on layouts/pages                            |
| `window.history.replaceState` | Browser native     | Update URL without navigation/re-render       | Officially supported by Next.js App Router, syncs with usePathname       |
| `yet-another-react-lightbox`  | 3.28.0 (installed) | `on.view` callback for slide change detection | Already used; `on.view` fires with `{ index }` on every slide transition |

### Supporting

| Library/API                       | Version            | Purpose                                   | When to Use                                         |
| --------------------------------- | ------------------ | ----------------------------------------- | --------------------------------------------------- |
| Drizzle ORM                       | 0.45.1 (installed) | Query photos by slug prefix, albums by ID | Deep link resolution in server components           |
| `usePathname` / `useSearchParams` | Next.js built-in   | Read current URL in client components     | Detecting photo slug on mount for deep link landing |

### Alternatives Considered

| Instead of                      | Could Use                       | Tradeoff                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replaceState`                  | `pushState`                     | pushState adds history entries per photo -- user pressing Back navigates through every photo viewed instead of leaving the gallery. replaceState is better.                                                                                                                                                                               |
| `replaceState`                  | Next.js `router.replace`        | router.replace triggers server-side navigation and re-renders. replaceState is client-only, no re-render.                                                                                                                                                                                                                                 |
| Parallel + intercepting routes  | Client-side lightbox URL sync   | Parallel/intercepting routes are the "standard" Next.js modal pattern but require significant restructuring (new `@modal` slot, `(..)photo` intercepting route). The project already has a working YARL-based lightbox. Adding replaceState to the existing lightbox is simpler, less disruptive, and achieves the same URL-sharing goal. |
| OG-specific 1200x630 derivative | Reuse existing 1200w derivative | Generating a cropped 1200x630 image requires extending the image pipeline (new Sharp job, new storage). The existing 1200w.webp derivative works perfectly as og:image -- social platforms crop to fit. Photography portfolios benefit from showing the actual photo aspect ratio rather than a forced crop.                              |

**Installation:**

```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

New and modified files:

```
src/
├── app/
│   ├── layout.tsx                          # ADD: metadataBase, default OG tags
│   ├── page.tsx                            # ADD: static metadata export for homepage OG
│   ├── photo/
│   │   └── [slug]/
│   │       └── page.tsx                    # NEW: homepage photo deep link resolver
│   └── albums/
│       └── [id]/
│           ├── page.tsx                    # MODIFY: add generateMetadata for album OG
│           └── photo/
│               └── [slug]/
│                   └── page.tsx            # NEW: album photo deep link page
├── domain/
│   └── repositories/
│       └── PhotoRepository.ts              # ADD: findBySlug(slug: string) method
├── infrastructure/
│   └── database/
│       └── repositories/
│           └── SQLitePhotoRepository.ts    # ADD: findBySlug implementation (LIKE query)
└── presentation/
    └── components/
        ├── HomepageClient.tsx              # MODIFY: add replaceState on lightbox navigation
        ├── AlbumGalleryClient.tsx           # MODIFY: add replaceState + deep link detection
        └── PhotoLightbox.tsx               # MODIFY: accept onSlideChange callback
```

### Pattern 1: URL Update on Lightbox Navigation (replaceState)

**What:** When a user opens/navigates photos in the lightbox, the browser URL updates to reflect the current photo without adding history entries.
**When to use:** Every time the lightbox `on.view` fires with a new index.

```typescript
// Source: Next.js docs - window.history.replaceState integration
// In AlbumGalleryClient.tsx

"use client";

import { usePathname } from "next/navigation";

// Inside the component:
const pathname = usePathname(); // e.g., "/albums/abc123"

const handleLightboxView = (index: number) => {
  onIndexChange?.(index);
  const photo = photos[index];
  const slug = photo.id.slice(0, 8);
  // Update URL to /albums/{albumId}/photo/{slug}
  window.history.replaceState(null, "", `/albums/${album.id}/photo/${slug}`);
};

const handleLightboxClose = () => {
  setLightboxOpen(false);
  // Restore the album URL when lightbox closes
  window.history.replaceState(null, "", `/albums/${album.id}`);
};
```

### Pattern 2: Deep Link Resolution (Server Component)

**What:** When a user navigates directly to a photo URL, the server component resolves the slug to a photo and renders the gallery with the lightbox pre-opened.
**When to use:** Direct navigation to `/albums/{albumId}/photo/{slug}` or `/photo/{slug}`.

```typescript
// Source: Next.js App Router conventions
// src/app/albums/[id]/photo/[slug]/page.tsx

import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id, slug } = await params;
  const photo = await photoRepo.findBySlug(slug);
  const album = await albumRepo.findById(id);

  if (!photo || !album) return {};

  return {
    title: photo.title || album.title,
    description: photo.description || album.description,
    openGraph: {
      title: photo.title || album.title,
      description: buildOgDescription(photo),
      type: "article",
      images: [
        {
          url: `/api/images/${photo.id}/1200w.webp`,
          width: 1200,
          height:
            photo.height && photo.width
              ? Math.round(1200 * (photo.height / photo.width))
              : undefined,
          type: "image/webp",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: photo.title || album.title,
      images: [`/api/images/${photo.id}/1200w.webp`],
    },
  };
}

export default async function AlbumPhotoPage({ params }: PageProps) {
  const { id, slug } = await params;
  // Reuse album page logic -- fetch album + photos, pass initialPhotoSlug
  // The client component detects initialPhotoSlug and opens lightbox on mount
}
```

### Pattern 3: generateMetadata for Album OG Tags

**What:** Dynamic metadata generation for album pages using route params and database queries.
**When to use:** Album detail pages at `/albums/[id]`.

```typescript
// Source: Next.js docs - generateMetadata
// src/app/albums/[id]/page.tsx (add to existing file)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const album = await albumRepo.findById(id);
  if (!album || !album.isPublished) return {};

  const coverPhotoId = album.coverPhotoId;

  return {
    title: album.title,
    description: album.description || `Photo album: ${album.title}`,
    openGraph: {
      title: album.title,
      description: album.description || `Photo album: ${album.title}`,
      type: "website",
      ...(coverPhotoId
        ? {
            images: [
              {
                url: `/api/images/${coverPhotoId}/1200w.webp`,
                width: 1200,
                type: "image/webp",
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: album.title,
      ...(coverPhotoId
        ? {
            images: [`/api/images/${coverPhotoId}/1200w.webp`],
          }
        : {}),
    },
  };
}
```

### Pattern 4: Static Homepage Metadata

**What:** Static metadata export for the homepage with site name and description.
**When to use:** Root page.tsx.

```typescript
// Source: Next.js docs - static metadata
// src/app/page.tsx (add to existing file)

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Photography portfolio",
  openGraph: {
    title: "Portfolio",
    description: "Photography portfolio",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};
```

Note: The homepage uses `export const dynamic = "force-dynamic"` and returns random photos each load. Static metadata is appropriate here because the site name and description don't change. The homepage OG image is optional since the content is randomized.

### Pattern 5: metadataBase in Root Layout

**What:** Set `metadataBase` in root layout so OG image URLs are resolved to absolute URLs automatically.
**When to use:** Once in `src/app/layout.tsx`.

```typescript
// Source: Next.js docs - metadataBase
// src/app/layout.tsx

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: "Portfolio",
  description: "Photography portfolio",
};
```

### Anti-Patterns to Avoid

- **Using `router.push` or `router.replace` for lightbox URL updates:** These trigger server-side navigation, cause re-renders, and may reset component state. Use `window.history.replaceState` instead.
- **Creating parallel/intercepting routes for the lightbox:** Massive structural change for minimal benefit. The YARL lightbox already works; just sync its state to the URL.
- **Generating 1200x630 cropped OG images:** The actual photo at its natural aspect ratio is better for a photography portfolio. Social platforms handle cropping. This also avoids extending the image pipeline.
- **Using AVIF for OG images:** Many social media crawlers don't support AVIF. Always use WebP (widely supported) or JPEG as the OG image format.
- **Using `pushState` for per-photo URL updates:** Creates a history entry for every photo the user swipes through. Pressing Back should leave the gallery, not go to the previous photo.

## Discretion Recommendations

Based on research, here are the recommended choices for Claude's discretion areas:

### History Management: Use `replaceState`

`replaceState` is clearly better than `pushState` for lightbox navigation. Success criteria #1 explicitly says "without adding excessive history entries." With `replaceState`, pressing Back exits the gallery entirely rather than stepping through every viewed photo. This matches user expectations for a lightbox/carousel experience.

### Deep Link Landing View: Lightbox Over Gallery

When navigating to `/albums/{albumId}/photo/{slug}`, render the album gallery page with the lightbox pre-opened at the target photo. This:

- Reuses existing `AlbumGalleryClient` component (no new UI to build)
- Provides immediate context (user sees they're in an album)
- Allows natural exit (close lightbox = see full album)
- Matches the "photos belong in album context" principle

For `/photo/{slug}` (homepage context), resolve the photo's album and redirect to `/albums/{albumId}/photo/{slug}`. If the photo belongs to multiple albums, pick the first published one. This ensures every photo deep link has album context.

### Album Photo Deep Link Navigation: Full Album Navigation

The lightbox should allow navigating through all album photos, not just show a single photo. The user landed on a photo in an album context -- they should be able to browse the album. The gallery is already loaded server-side, so all photos are available.

### Missing/Deleted Photo: Return 404

Use `notFound()` from `next/navigation`. This is standard Next.js behavior, triggers the nearest `not-found.tsx`, and is the expected behavior for a dead link. Redirecting would be confusing (redirect to where?).

### Context Cues: Minimal

The lightbox already renders over the album page, which has breadcrumbs (`Home / Albums / Album Title`). No additional context cues needed. When the lightbox opens from a deep link, the gallery is visible behind it.

### Photo OG Description: Include Key EXIF Data

Include camera model, focal length, and aperture in the OG description when available. Example: "Shot on Canon R5 -- 85mm -- f/1.4". This is valuable for photography portfolios where viewers care about the technical details. Keep it concise -- don't include every EXIF field.

### Homepage OG: Use env var with Sensible Defaults

Add `NEXT_PUBLIC_SITE_NAME` and `NEXT_PUBLIC_SITE_DESCRIPTION` to `.env.example`. Default to "Portfolio" and "Photography portfolio" if not set. This lets the user customize without code changes.

### OG Image Sizing: Reuse 1200w Derivative

The existing 1200w.webp derivative is the correct choice. Social platforms (Facebook, Twitter, LinkedIn, Slack, Discord) all handle non-standard aspect ratios by center-cropping. For a photography portfolio, showing the actual photo composition is more important than fitting a 1200x630 box. The 1200px width exceeds all platform minimum requirements.

### Twitter/X Card Format: `summary_large_image`

Use `summary_large_image` for photo and album pages (the large image preview is essential for a photography portfolio). Use `summary` for the homepage (no guaranteed hero image since photos are random).

## Don't Hand-Roll

| Problem                      | Don't Build                              | Use Instead                             | Why                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL update without re-render | Custom router wrapper                    | `window.history.replaceState`           | Next.js App Router officially supports it and syncs with usePathname                                                                                                                                        |
| Dynamic OG meta tags         | Manual `<meta>` tag injection            | `generateMetadata` / `metadata` export  | Next.js handles HTML head injection, deduplication, and bot-specific streaming                                                                                                                              |
| OG image generation          | Custom Sharp pipeline for 1200x630 crops | Existing 1200w.webp derivatives         | Social platforms crop automatically; real photo is better than forced crop                                                                                                                                  |
| Photo slug collision check   | UUID uniqueness validation               | SQLite `LIKE` query with `slug%` prefix | With 8 hex chars (4 bytes of UUID), collision is theoretically possible but astronomically unlikely for a personal portfolio. If it occurs, the LIKE query returns the first match, which is deterministic. |
| Metadata for crawlers        | Custom bot detection + SSR               | Next.js built-in metadata streaming     | Next.js automatically detects bots (Twitterbot, Slackbot, etc.) and sends metadata in `<head>` while streaming for real users                                                                               |

**Key insight:** This phase requires zero new dependencies. Every capability needed is already in the project (YARL callbacks, Next.js metadata API, existing image derivatives) or native to the browser (`replaceState`).

## Common Pitfalls

### Pitfall 1: OG Images Must Be Absolute URLs

**What goes wrong:** Social media crawlers see relative URLs like `/api/images/abc/1200w.webp` and can't fetch them.
**Why it happens:** OpenGraph spec requires absolute URLs. Relative URLs work in browsers but not in crawlers.
**How to avoid:** Set `metadataBase` in root layout to the site's public URL. Next.js automatically prepends it to relative OG image URLs. Add `NEXT_PUBLIC_SITE_URL` env var.
**Warning signs:** OG validator tools (ogcheck.com, opengraph.dev) show blank image previews.

### Pitfall 2: AVIF Not Supported by OG Crawlers

**What goes wrong:** OG image specified as AVIF; social platforms show no preview image.
**Why it happens:** Many social media crawlers (Facebook, Twitter, LinkedIn, Slack) don't support AVIF decoding. They support JPEG, PNG, GIF, and WebP.
**How to avoid:** Always use WebP (`.webp`) for OG images. The existing image pipeline generates WebP derivatives at all widths.
**Warning signs:** OG preview works locally but not on social platforms.

### Pitfall 3: Lightbox State Lost on Deep Link Mount

**What goes wrong:** Deep link renders album page but lightbox doesn't open, or opens at wrong index.
**Why it happens:** The `initialPhotoSlug` prop needs to be consumed on mount with proper index calculation, and the lightbox open state needs to be set before the first render completes.
**How to avoid:** Use `useState(() => initialPhotoSlug ? findIndex : -1)` for initial index and `useState(() => !!initialPhotoSlug)` for initial open state. This runs during the initial render, not after.
**Warning signs:** Deep link shows gallery grid instead of lightbox; requires a click to open.

### Pitfall 4: replaceState Not Syncing with Next.js

**What goes wrong:** URL updates but `usePathname` returns stale value, or Back button behavior is unexpected.
**Why it happens:** Older Next.js versions or incorrect usage of `replaceState`.
**How to avoid:** Use the pattern exactly as documented: `window.history.replaceState(null, '', newPath)`. The first argument (state) should be `null`. Next.js 14+ automatically syncs `replaceState` with its internal router state. This project uses Next.js 16.1.6, which fully supports this.
**Warning signs:** Console errors about hydration mismatches or unexpected navigation.

### Pitfall 5: UUID Slug Collision

**What goes wrong:** Two photos have the same first 8 UUID characters. Deep link resolves to wrong photo.
**Why it happens:** UUID v4 uses random bytes, but 8 hex characters = 32 bits = ~4 billion possible values. For a personal portfolio with hundreds or low thousands of photos, collision probability is negligible (birthday problem: ~0.01% at 10,000 photos).
**How to avoid:** Implement `findBySlug` as a `LIKE '{slug}%'` query. If multiple matches exist, return the first (deterministic by ID sort). For a personal portfolio, this is a non-issue. If worried, the slug could be extended to 12 characters later.
**Warning signs:** Two photos resolve to the same URL.

### Pitfall 6: generateMetadata and Page Component Duplicate DB Queries

**What goes wrong:** `generateMetadata` fetches album + photos, then the page component fetches the same data again.
**Why it happens:** They're separate functions that don't share scope.
**How to avoid:** Use React's `cache()` function to memoize repository calls. Next.js automatically deduplicates `fetch` calls, but since this project uses direct SQLite queries (not fetch), wrap the query functions in `cache()`.
**Warning signs:** Slow page loads on photo deep links; duplicate SQL queries in logs.

### Pitfall 7: Homepage Uses `force-dynamic` But Metadata Is Static

**What goes wrong:** The homepage metadata export conflicts with `force-dynamic`.
**Why it happens:** Static `metadata` exports work fine with `force-dynamic`. The confusion is thinking they conflict -- they don't. The metadata is static (site name doesn't change), the page content is dynamic (random photos).
**How to avoid:** This is a non-issue. Both `export const dynamic = "force-dynamic"` and `export const metadata = { ... }` can coexist in the same file. `generateMetadata` is only needed when metadata depends on request-time data.
**Warning signs:** None -- this just works.

### Pitfall 8: Homepage Photo Deep Links Have No Album Context

**What goes wrong:** Homepage shows random photos from published albums. A deep link to `/photo/{slug}` needs to know which album to show.
**Why it happens:** Homepage photos are a random mix; they don't belong to a single album context.
**How to avoid:** The `/photo/[slug]` route should resolve the photo, find its first published album, and render that album's gallery with the lightbox open. If the photo has no published album, return 404.
**Warning signs:** Deep link works for album photos but 404s for homepage photos.

## Code Examples

### Slug-Based Photo Lookup (Repository)

```typescript
// Source: Project architecture - domain/repositories pattern
// Add to PhotoRepository interface:
findBySlug(slug: string): Promise<Photo | null>;

// Implementation in SQLitePhotoRepository:
async findBySlug(slug: string): Promise<Photo | null> {
  // slug is first 8 chars of UUID
  const result = await db
    .select()
    .from(photos)
    .where(sql`${photos.id} LIKE ${slug + '%'}`)
    .limit(1);
  return result[0] ? this.toDomain(result[0]) : null;
}
```

### Album Photo Deep Link Page (Full Example)

```typescript
// Source: Next.js App Router + project conventions
// src/app/albums/[id]/photo/[slug]/page.tsx

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories/SQLiteAlbumRepository";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";
import { AlbumGalleryClient } from "@/presentation/components/AlbumGalleryClient";

interface PageProps {
  params: Promise<{ id: string; slug: string }>;
}

const getAlbumData = cache(async (albumId: string) => {
  const albumRepo = new SQLiteAlbumRepository();
  const photoRepo = new SQLitePhotoRepository();
  const [album, photos] = await Promise.all([
    albumRepo.findById(albumId),
    photoRepo.findByAlbumId(albumId),
  ]);
  return { album, photos: photos.filter((p) => p.status === "ready") };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, slug } = await params;
  const { album, photos } = await getAlbumData(id);
  if (!album || !album.isPublished) return {};

  const photo = photos.find((p) => p.id.startsWith(slug));
  if (!photo) return {};

  const description = buildPhotoDescription(photo);

  return {
    title: photo.title || album.title,
    description,
    openGraph: {
      title: photo.title || album.title,
      description,
      type: "article",
      images: [{
        url: `/api/images/${photo.id}/1200w.webp`,
        width: 1200,
        height: photo.width && photo.height
          ? Math.round(1200 * (photo.height / photo.width))
          : undefined,
        type: "image/webp",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: photo.title || album.title,
      images: [`/api/images/${photo.id}/1200w.webp`],
    },
  };
}

export default async function AlbumPhotoPage({ params }: PageProps) {
  const { id, slug } = await params;
  const { album, photos } = await getAlbumData(id);

  if (!album || !album.isPublished) notFound();

  const photoIndex = photos.findIndex((p) => p.id.startsWith(slug));
  if (photoIndex === -1) notFound();

  return (
    <AlbumGalleryClient
      album={{ id: album.id, title: album.title, description: album.description }}
      photos={photos.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        originalFilename: p.originalFilename,
        blurDataUrl: p.blurDataUrl,
        exifData: p.exifData,
        width: p.width,
        height: p.height,
      }))}
      initialPhotoIndex={photoIndex}
    />
  );
}

function buildPhotoDescription(photo: Photo): string {
  const parts: string[] = [];
  if (photo.description) parts.push(photo.description);
  if (photo.exifData) {
    const exif = photo.exifData;
    const techParts: string[] = [];
    if (exif.cameraModel) techParts.push(exif.cameraModel);
    if (exif.focalLength) techParts.push(`${exif.focalLength}mm`);
    if (exif.aperture) techParts.push(`f/${exif.aperture}`);
    if (techParts.length > 0) parts.push(techParts.join(" - "));
  }
  return parts.join(" | ") || "Photo";
}
```

### AlbumGalleryClient with URL Sync (Modified)

```typescript
// Source: Project codebase + Next.js replaceState docs
// Key modifications to existing AlbumGalleryClient.tsx

interface AlbumGalleryClientProps {
  album: { id: string; title: string; description: string | null };
  photos: PhotoData[];
  initialPhotoIndex?: number; // NEW: for deep links
}

export function AlbumGalleryClient({
  album,
  photos,
  initialPhotoIndex,
}: AlbumGalleryClientProps) {
  // Initialize state based on deep link
  const [lightboxOpen, setLightboxOpen] = useState(
    () => initialPhotoIndex !== undefined && initialPhotoIndex >= 0,
  );
  const [lightboxIndex, setLightboxIndex] = useState(
    () => initialPhotoIndex ?? 0,
  );

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    const slug = photos[index].id.slice(0, 8);
    window.history.replaceState(null, "", `/albums/${album.id}/photo/${slug}`);
  };

  const handleLightboxClose = () => {
    setLightboxOpen(false);
    // Restore album URL
    window.history.replaceState(null, "", `/albums/${album.id}`);
  };

  const handleSlideChange = (index: number) => {
    setLightboxIndex(index);
    const slug = photos[index].id.slice(0, 8);
    window.history.replaceState(null, "", `/albums/${album.id}/photo/${slug}`);
  };

  // ... rest of component (gallery grid rendering unchanged)
  // Pass handleSlideChange to PhotoLightbox's onIndexChange
}
```

### Homepage Photo Deep Link Resolver

```typescript
// Source: Next.js App Router conventions
// src/app/photo/[slug]/page.tsx

import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const photo = await photoRepo.findBySlug(slug);
  if (!photo) return {};

  // Find the photo's first published album for context
  const albumIds = await photoRepo.getAlbumIds(photo.id);
  const albums = await Promise.all(
    albumIds.map((id) => albumRepo.findById(id)),
  );
  const publishedAlbum = albums.find((a) => a?.isPublished);

  return {
    title: photo.title || "Photo",
    openGraph: {
      title: photo.title || "Photo",
      type: "article",
      images: [
        {
          url: `/api/images/${photo.id}/1200w.webp`,
          width: 1200,
          type: "image/webp",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: [`/api/images/${photo.id}/1200w.webp`],
    },
  };
}

export default async function PhotoPage({ params }: PageProps) {
  const { slug } = await params;
  const photo = await photoRepo.findBySlug(slug);
  if (!photo) notFound();

  // Find first published album containing this photo
  const albumIds = await photoRepo.getAlbumIds(photo.id);
  for (const albumId of albumIds) {
    const album = await albumRepo.findById(albumId);
    if (album?.isPublished) {
      redirect(`/albums/${albumId}/photo/${slug}`);
    }
  }

  // Photo exists but not in any published album
  notFound();
}
```

### metadataBase Configuration

```typescript
// Source: Next.js docs - metadataBase
// src/app/layout.tsx (modifications)

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: {
    default: process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio",
    template: `%s | ${process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio"}`,
  },
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "Photography portfolio",
};
```

## State of the Art

| Old Approach                                        | Current Approach                           | When Changed            | Impact                                                                              |
| --------------------------------------------------- | ------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| `router.push` with `shallow: true` (Pages Router)   | `window.history.replaceState` (App Router) | Next.js 14.0 (Oct 2023) | No shallow routing in App Router; native history API is the official replacement    |
| Manual `<meta>` tags via `<Head>`                   | `generateMetadata` / `metadata` export     | Next.js 13.2 (Feb 2023) | Type-safe, automatic dedup, bot-aware streaming                                     |
| File-based `opengraph-image.tsx` with ImageResponse | Existing photo as OG image                 | N/A                     | For photography portfolios, the actual photo is always better than a generated card |

**Deprecated/outdated:**

- `next/head` `<Head>` component: Replaced by metadata API in App Router. Do not use.
- `router.push({ shallow: true })`: Does not exist in App Router. Use `window.history.replaceState`.
- `next-seo` package: Unnecessary with built-in metadata API. Do not add.

## Open Questions

1. **`NEXT_PUBLIC_SITE_URL` for metadataBase**
   - What we know: `metadataBase` needs an absolute URL to resolve relative OG image paths. The env var doesn't exist yet.
   - What's unclear: Whether the user has a domain name configured. In development, `http://localhost:3000` works.
   - Recommendation: Add `NEXT_PUBLIC_SITE_URL` to `.env.example` with a comment explaining it's needed for social sharing. Default to `http://localhost:3000`. OG images will work correctly once a real domain is set.

2. **Homepage photo context for deep links**
   - What we know: Homepage shows random photos from published albums. A photo could belong to multiple albums.
   - What's unclear: Whether the photo's album context should be the album where it has the lowest sort order, or just any published album.
   - Recommendation: Use the first published album found. For a personal portfolio, the distinction is negligible. The important thing is that the deep link resolves to _some_ valid album context.

3. **React `cache()` behavior with direct SQLite queries**
   - What we know: Next.js automatically deduplicates `fetch()` calls between `generateMetadata` and the page component. But this project uses direct Drizzle/SQLite queries, not `fetch()`.
   - What's unclear: Whether React's `cache()` function works as expected with synchronous-looking better-sqlite3 calls wrapped in async functions.
   - Recommendation: Use `cache()` from React. It works with any async function in server components. The Drizzle queries are async (returning Promises), so they'll be cached correctly within the same request.

## Sources

### Primary (HIGH confidence)

- [Next.js generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) - OpenGraph fields, dynamic metadata, metadataBase, params API
- [Next.js Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating) - `window.history.replaceState` integration with App Router
- [Next.js Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) - Static vs dynamic metadata, file conventions, `cache()` memoization
- [Next.js Intercepting Routes](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes) - Evaluated and rejected for this project
- [YARL Documentation](https://yet-another-react-lightbox.com/documentation) - `on.view` callback, `index` prop, lifecycle events
- Project codebase - All existing components, schema, repositories, image pipeline

### Secondary (MEDIUM confidence)

- [OG Image Size Guide 2026](https://myogimage.com/blog/og-image-size-meta-tags-complete-guide) - 1200x630 standard, Twitter minimum dimensions, format support
- [Next.js GitHub Discussion #18072](https://github.com/vercel/next.js/discussions/18072) - Community confirmation of replaceState pattern
- [YARL Next.js Integration](https://yet-another-react-lightbox.com/examples/nextjs) - Dynamic import pattern, custom render

### Tertiary (LOW confidence)

- UUID collision probability estimates for 8-char truncation - Based on birthday problem math, not empirically verified for this UUID generation approach

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - No new dependencies; all APIs verified against official Next.js 16 docs
- Architecture: HIGH - Patterns verified against official docs and existing codebase; replaceState officially documented
- Pitfalls: HIGH - OG absolute URL requirement, AVIF crawler support, replaceState sync all verified with official sources
- Discretion recommendations: HIGH - Each recommendation grounded in success criteria, existing architecture, and project philosophy

**Research date:** 2026-02-06
**Valid until:** 2026-03-08 (30 days - stable technologies, no fast-moving dependencies)
