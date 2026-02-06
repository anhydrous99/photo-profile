# Phase 10: Polish - Research

**Researched:** 2026-02-05
**Domain:** Image loading UX, web performance optimization, Docker deployment
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Smooth fade-in transition (~300ms) from placeholder to loaded image
- Target: 0.5 second initial page load, 1 second acceptable
- Aggressive HTTP caching: long cache times for images, long for pages where appropriate
- No specific pain points reported -- this is proactive optimization
- Aggressive caching desired -- prioritize speed over content freshness

### Claude's Discretion

- Blur placeholder implementation technique (blurhash, tiny image, etc.)
- Placeholder color strategy (photo-derived vs neutral)
- Where placeholders appear
- Aspect ratio handling approach
- Lazy loading strategy
- Image component choice (Next.js Image vs native)
- Image format serving priority (AVIF vs WebP)
- Performance optimization techniques
- Photo count limits per page

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

## Summary

This phase covers three distinct domains: blur placeholder generation and display, performance optimization, and Docker deployment. The research investigated the current codebase's image pipeline (Sharp generating WebP + AVIF at 300/600/1200/2400 widths), how images are served (via `/api/images/[photoId]/[filename]` route with immutable caching), how they are displayed (Next.js `Image` component with `fill`), and what the optimal approach is for each sub-plan.

For blur placeholders, the recommended approach is **CSS blur on a tiny base64 image** (LQIP) rather than blurhash or thumbhash. This avoids adding client-side JavaScript decoding libraries, renders immediately in HTML before JS loads, and produces higher visual quality than hash-based approaches. The tiny placeholder should be generated during the existing Sharp image processing pipeline and stored as a `blurDataUrl` column in the `photos` database table.

For performance, the key insight is that this project **already pre-processes images with Sharp** and serves them via an API route with `Cache-Control: public, max-age=31536000, immutable`. The Next.js `Image` component's built-in optimization would be redundant double-processing. The recommendation is to use a **custom loader** that maps directly to the existing API route, gaining `next/image`'s lazy loading, srcset, and CLS prevention without re-optimizing already-optimized images. For format serving, use the `<picture>` element with AVIF-first, WebP fallback via the existing derivatives.

For Docker, the project has three native Node.js modules (sharp, bcrypt, better-sqlite3) that require careful handling. The recommendation is a **multi-stage Dockerfile** using `node:22-slim` (Debian-based, not Alpine) to avoid musl libc compatibility issues, with `output: "standalone"` in next.config.ts.

**Primary recommendation:** Generate tiny base64 placeholders in the Sharp pipeline, use a custom next/image loader to skip double-optimization, serve AVIF-first with `<picture>` elements, and deploy with a multi-stage Docker build on node:22-slim.

## Standard Stack

### Core (Already Installed)

| Library     | Version | Purpose                                                     | Why Standard                                 |
| ----------- | ------- | ----------------------------------------------------------- | -------------------------------------------- |
| sharp       | ^0.34.5 | Blur placeholder generation (resize to 10px, base64 encode) | Already in project, no new dependency needed |
| next/image  | 16.1.6  | Image component with lazy loading, CLS prevention, srcset   | Already used throughout codebase             |
| drizzle-orm | ^0.45.1 | Store blurDataUrl in photos table                           | Already the ORM for the project              |

### Supporting (No New Dependencies Needed)

| Library          | Version | Purpose                                          | When to Use                                             |
| ---------------- | ------- | ------------------------------------------------ | ------------------------------------------------------- |
| CSS transitions  | native  | 300ms fade-in from placeholder to loaded image   | Applied via Tailwind classes on all image containers    |
| HTML `<picture>` | native  | AVIF-first with WebP fallback format negotiation | Replace direct `.webp` references in gallery components |

### Alternatives Considered

| Instead of               | Could Use           | Tradeoff                                                                                          |
| ------------------------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| LQIP (tiny base64 image) | blurhash            | Blurhash requires ~2KB JS decoding library, does not render before JS loads, lower visual quality |
| LQIP (tiny base64 image) | thumbhash           | ThumbHash also requires JS decoding, similar drawbacks to blurhash despite better quality         |
| Custom next/image loader | `unoptimized` prop  | `unoptimized` loses srcset generation; custom loader keeps responsive behavior                    |
| Custom next/image loader | Native `<img>` tags | Loses lazy loading abstraction, CLS prevention, placeholder integration                           |
| node:22-slim (Debian)    | node:22-alpine      | Alpine uses musl libc which causes issues with sharp, bcrypt, better-sqlite3 native binaries      |

**Installation:**

```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Pattern 1: Blur Placeholder Generation in Worker Pipeline

**What:** During image processing, after generating all derivative sizes, generate an additional tiny (10px wide) image and convert it to a base64 data URL. Store this in the `photos` table as a new `blurDataUrl` column.

**When to use:** Every time the image worker processes a new photo.

**Why this approach:**

- Generated once, served many times (no runtime cost)
- Stored in DB alongside photo metadata (single query to get photo + placeholder)
- ~170 bytes per placeholder, negligible storage impact
- Renders immediately in HTML without any JavaScript

**Database schema change:**

```sql
ALTER TABLE photos ADD COLUMN blur_data_url TEXT;
```

**Worker pipeline addition:**

```typescript
// In imageProcessor.ts, after generating derivatives
// Generate blur placeholder (tiny 10px wide image)
const placeholderBuffer = await sharp(inputPath)
  .rotate()
  .resize(10, null, { fit: "inside" })
  .webp({ quality: 20 })
  .toBuffer();

const blurDataUrl = `data:image/webp;base64,${placeholderBuffer.toString("base64")}`;

// Save to database
const repository = new SQLitePhotoRepository();
const photo = await repository.findById(photoId);
if (photo) {
  photo.blurDataUrl = blurDataUrl;
  await repository.save(photo);
}
```

### Pattern 2: Custom Image Loader (Skip Double-Optimization)

**What:** A custom loader function that maps `next/image` requests directly to the existing `/api/images/` route, using the pre-processed derivatives at the correct width.

**Why:** The project already generates optimized WebP/AVIF images at [300, 600, 1200, 2400] widths via Sharp. Using the default Next.js image optimizer would:

1. Fetch from the API route
2. Re-process an already-optimized image
3. Add latency and CPU overhead
4. Potentially reduce quality

**Implementation:**

```typescript
// src/lib/imageLoader.ts
export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // src format: "/api/images/{photoId}"
  // Map requested width to nearest available derivative
  const sizes = [300, 600, 1200, 2400];
  const bestSize = sizes.find((s) => s >= width) ?? sizes[sizes.length - 1];
  return `${src}/${bestSize}w.webp`;
}
```

**next.config.ts:**

```typescript
const nextConfig: NextConfig = {
  images: {
    loader: "custom",
    loaderFile: "./src/lib/imageLoader.ts",
  },
  output: "standalone",
};
```

### Pattern 3: AVIF-First Format Serving with `<picture>` Element

**What:** Wrap images in `<picture>` elements to serve AVIF to browsers that support it, with WebP fallback.

**Why:** AVIF is 20-50% smaller than WebP at comparable quality. The project already generates both formats. Currently all components hardcode `.webp` -- switching to `<picture>` with AVIF-first recovers significant bandwidth savings.

**Tradeoff with next/image:** The `next/image` component does not support `<picture>` natively. Two options:

1. Use `next/image` with the custom loader (WebP only) -- simpler, still gets lazy loading and CLS prevention
2. Use native `<img>` inside `<picture>` -- gets AVIF-first format negotiation but loses some next/image features

**Recommendation:** Use approach 1 (custom loader with WebP) for the initial implementation. The images are already well-optimized at WebP quality 82. AVIF-first can be added later if bandwidth savings are needed. This keeps the implementation simpler and avoids replacing the entire image component architecture.

### Pattern 4: Fade-In Transition on Image Load

**What:** CSS-based smooth transition from blurred placeholder to loaded image.

**Implementation approach:**

```tsx
// Image wrapper with fade-in transition
function GalleryImage({ photo }: { photo: PhotoWithBlur }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative overflow-hidden">
      {/* Blur placeholder - always present as background */}
      {photo.blurDataUrl && (
        <img
          src={photo.blurDataUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover scale-110 blur-lg"
        />
      )}
      {/* Actual image - fades in over placeholder */}
      <Image
        src={`/api/images/${photo.id}`}
        alt={photo.title || photo.originalFilename}
        fill
        className={`object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
```

**Alternative (simpler, using next/image built-in):**

```tsx
<Image
  src={`/api/images/${photo.id}`}
  alt={photo.title || photo.originalFilename}
  fill
  placeholder="blur"
  blurDataURL={photo.blurDataUrl}
  className="object-cover"
/>
```

The built-in `placeholder="blur"` in next/image automatically handles the blur-up transition. However, the transition is not customizable (no control over duration). The manual approach with `onLoad` + CSS transition gives the user's requested ~300ms fade-in.

### Pattern 5: Docker Multi-Stage Build

**What:** Three-stage Dockerfile: deps -> builder -> runner.

**Key considerations for this project:**

- Three native modules: sharp, bcrypt, better-sqlite3 (all need compilation)
- Uses `node:22-slim` (Debian-based) for compatibility with native binaries
- SQLite database file must be mounted as a Docker volume (not baked into image)
- Storage directory must be mounted as a Docker volume
- Redis connection via environment variable
- Worker process runs separately from Next.js server

**Structure:**

```dockerfile
# Stage 1: Dependencies
FROM node:22-slim AS deps
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Builder
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Runner
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### Recommended Project Structure Changes

```
src/
  lib/
    imageLoader.ts       # Custom next/image loader
  infrastructure/
    services/
      imageService.ts    # Add blur placeholder generation
    database/
      schema.ts          # Add blurDataUrl column to photos
    jobs/
      workers/
        imageProcessor.ts # Generate blur placeholder after derivatives
  presentation/
    components/
      GalleryImage.tsx   # New shared image component with fade-in
Dockerfile               # New: multi-stage production build
.dockerignore            # New: exclude node_modules, .git, storage, data
docker-compose.yml       # Update: add next app and worker services
```

### Anti-Patterns to Avoid

- **Double image optimization:** Never pass pre-processed Sharp images through Next.js image optimizer. Use custom loader or `unoptimized`.
- **Generating placeholders at request time:** Always generate during upload processing and store in DB. Runtime generation blocks page rendering.
- **Using Alpine for Docker with native modules:** Alpine uses musl libc which requires separate compilation and frequently causes issues with sharp, bcrypt, and better-sqlite3.
- **Baking data into Docker image:** Database and storage directories must be Docker volumes, not COPY'd into the image.
- **Running worker and server in same container:** They should be separate services in docker-compose for proper process management.

## Don't Hand-Roll

| Problem                  | Don't Build                       | Use Instead                                                                       | Why                                                                   |
| ------------------------ | --------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Blur placeholder display | Custom blur rendering with canvas | `next/image` `placeholder="blur"` + `blurDataURL` or CSS transition with `onLoad` | Built-in browser/React handling is more reliable                      |
| Lazy loading             | Custom Intersection Observer      | `next/image` default `loading="lazy"`                                             | Browser native lazy loading is more performant and handles edge cases |
| Image format negotiation | Custom Accept header parsing      | `<picture>` element with `<source type="">` or let browser handle via WebP        | Browser-native format selection is more reliable                      |
| CLS prevention           | Manual aspect ratio calculations  | `next/image` `fill` + parent with aspect ratio class                              | next/image handles the positioning natively                           |
| Docker health checks     | Custom health endpoint            | Docker HEALTHCHECK with `curl` to `localhost:3000`                                | Standard Docker pattern, no app code needed                           |

**Key insight:** This project already has a sophisticated image pipeline. The polish phase should leverage what exists (Sharp derivatives, immutable caching, next/image) rather than rebuilding it. The main work is connecting the pieces: generating blur data during processing, passing it through to the frontend, and wrapping everything in Docker.

## Common Pitfalls

### Pitfall 1: Forgetting Existing Photos When Adding blurDataUrl Column

**What goes wrong:** Adding `blurDataUrl` to the schema and worker pipeline only handles NEW uploads. Existing photos in the database have null blurDataUrl and show no placeholder.
**Why it happens:** Schema migration adds the column but existing rows have no data.
**How to avoid:** Write a backfill script that processes all existing photos to generate blur placeholders. Run this as a one-time migration step.
**Warning signs:** Photos uploaded before the change show no blur placeholder.

### Pitfall 2: Large blurDataURL Strings Bloating Page HTML

**What goes wrong:** If the placeholder image is too large (e.g., 100px instead of 10px), each data URL could be 2-5KB. With 20 photos on a page, that adds 40-100KB to the HTML payload.
**Why it happens:** Using too large a source image for the placeholder.
**How to avoid:** Resize to exactly 10px width. At 10px, WebP base64 is approximately 100-200 bytes per image. Even 50 photos adds only 5-10KB.
**Warning signs:** HTML document size exceeds 50KB on gallery pages.

### Pitfall 3: Next.js Image Optimizer Re-Processing Pre-Optimized Images

**What goes wrong:** Without a custom loader or `unoptimized`, `next/image` fetches images from the API route and re-processes them through its own Sharp-based optimizer. This doubles processing time and can reduce quality.
**Why it happens:** Default `next/image` behavior optimizes all images, regardless of source.
**How to avoid:** Configure a custom loader in `next.config.ts` that maps directly to the API route with the correct width derivative.
**Warning signs:** `.next/cache/images/` directory grows large; image load times are slower than expected.

### Pitfall 4: Docker Build Fails Due to Native Module Compilation

**What goes wrong:** sharp, bcrypt, and better-sqlite3 all require native compilation. If the Docker base image lacks build tools (python3, make, g++), `npm ci` fails.
**Why it happens:** Slim/Alpine images don't include build toolchain by default.
**How to avoid:** Install build dependencies in the deps stage: `apt-get install -y python3 make g++`. The builder and runner stages don't need these tools.
**Warning signs:** npm install errors mentioning `node-gyp`, `python`, or `make` not found.

### Pitfall 5: SQLite Database File Permissions in Docker

**What goes wrong:** The Next.js app runs as non-root user `nextjs` (UID 1001) but the mounted volume has root-owned files, causing SQLITE_CANTOPEN errors.
**Why it happens:** Docker volume permissions mismatch with the non-root container user.
**How to avoid:** Either: (a) create the data directory with correct ownership in the Dockerfile, (b) use `--user` flag matching the host UID, or (c) initialize the volume with correct permissions.
**Warning signs:** "SQLITE_CANTOPEN: unable to open database file" in container logs.

### Pitfall 6: Homepage force-dynamic + Aggressive Caching Conflict

**What goes wrong:** The homepage uses `force-dynamic` for random photo selection. This means every request hits the server and database. With aggressive caching goals, this conflicts -- you either get fresh random photos or fast cached pages, not both.
**Why it happens:** `force-dynamic` disables all caching for the route.
**How to avoid:** Accept the tradeoff: homepage is dynamic (random photos change each visit) but the actual image files are immutably cached. The page itself should render fast because it's just HTML + blur placeholders. Alternatively, use ISR with a short revalidation time (e.g., 60 seconds) if truly needed.
**Warning signs:** Homepage TTFB exceeds 200ms.

### Pitfall 7: Standalone Output Missing Sharp for Image Optimization

**What goes wrong:** With `output: "standalone"`, Next.js traces dependencies and copies only used files. If using the default image optimizer, sharp might not be fully traced.
**Why it happens:** Next.js file tracing doesn't always capture all native binary dependencies.
**How to avoid:** Since we're using a custom loader and bypassing the Next.js image optimizer entirely, this is less of a concern. However, the worker process still needs sharp. Ensure the worker is run from the full node_modules (or has its own package install) rather than the standalone output.
**Warning signs:** "Could not find module 'sharp'" errors in production.

## Code Examples

### Generating Blur Placeholder with Sharp

```typescript
// Source: sharp.pixelplumbing.com + verified pattern from multiple blog posts
import sharp from "sharp";

export async function generateBlurPlaceholder(
  inputPath: string,
): Promise<string> {
  const buffer = await sharp(inputPath)
    .rotate() // Auto-orient from EXIF
    .resize(10, null, { fit: "inside" }) // 10px wide, maintain aspect ratio
    .webp({ quality: 20 }) // Low quality is fine for blur
    .toBuffer();

  return `data:image/webp;base64,${buffer.toString("base64")}`;
}
```

### Custom Image Loader for Pre-Processed Images

```typescript
// src/lib/imageLoader.ts
// Source: Next.js docs - custom loader configuration
const AVAILABLE_WIDTHS = [300, 600, 1200, 2400];

export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // Map requested width to nearest available derivative (round up)
  const bestWidth =
    AVAILABLE_WIDTHS.find((w) => w >= width) ??
    AVAILABLE_WIDTHS[AVAILABLE_WIDTHS.length - 1];
  // src is expected to be "/api/images/{photoId}"
  return `${src}/${bestWidth}w.webp`;
}
```

### next.config.ts with Custom Loader and Standalone Output

```typescript
// Source: Next.js docs
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    loader: "custom",
    loaderFile: "./src/lib/imageLoader.ts",
  },
};

export default nextConfig;
```

### Image Component with Fade-In Transition

```tsx
// Approach using next/image onLoad callback + CSS transition
"use client";
import Image from "next/image";
import { useState } from "react";

interface FadeImageProps {
  photoId: string;
  alt: string;
  blurDataUrl?: string | null;
  sizes: string;
  preload?: boolean;
  className?: string;
}

export function FadeImage({
  photoId,
  alt,
  blurDataUrl,
  sizes,
  preload = false,
  className = "",
}: FadeImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Blur placeholder background */}
      {blurDataUrl && (
        <img
          src={blurDataUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
        />
      )}
      {/* Full image with fade-in */}
      <Image
        src={`/api/images/${photoId}`}
        alt={alt}
        fill
        sizes={sizes}
        preload={preload}
        className={`object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${className}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
```

### Backfill Script for Existing Photos

```typescript
// scripts/backfill-blur-placeholders.ts
import { db } from "@/infrastructure/database/client";
import { photos } from "@/infrastructure/database/schema";
import { generateBlurPlaceholder } from "@/infrastructure/services/imageService";
import { env } from "@/infrastructure/config/env";
import path from "path";
import { isNull, eq } from "drizzle-orm";

async function backfill() {
  const allPhotos = await db
    .select()
    .from(photos)
    .where(isNull(photos.blurDataUrl));

  console.log(`Found ${allPhotos.length} photos without blur placeholders`);

  for (const photo of allPhotos) {
    // Use the 300w derivative as source (faster than original)
    const sourcePath = path.join(
      env.STORAGE_PATH,
      "processed",
      photo.id,
      "300w.webp",
    );

    try {
      const blurDataUrl = await generateBlurPlaceholder(sourcePath);
      await db
        .update(photos)
        .set({ blurDataUrl })
        .where(eq(photos.id, photo.id));
      console.log(`Generated placeholder for ${photo.id}`);
    } catch (err) {
      console.error(`Failed for ${photo.id}:`, err);
    }
  }
}

backfill();
```

### Dockerfile for Production

```dockerfile
# Stage 1: Install dependencies (includes build tools for native modules)
FROM node:22-slim AS deps
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build requires env vars for validation - provide dummy values
ENV DATABASE_PATH=/tmp/build.db
ENV STORAGE_PATH=/tmp/storage
ENV AUTH_SECRET=build-time-secret-at-least-32-characters
ENV ADMIN_PASSWORD_HASH=build-time-hash
RUN npm run build

# Stage 3: Production runner
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy worker and its dependencies (runs as separate process)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Create mount points for data and storage
RUN mkdir -p /app/data /app/storage && \
    chown -R nextjs:nodejs /app/data /app/storage

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### docker-compose.yml (Updated)

```yaml
version: "3.8"

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_PATH=/app/data/portfolio.db
      - STORAGE_PATH=/app/storage
      - REDIS_URL=redis://redis:6379
      - AUTH_SECRET=${AUTH_SECRET}
      - ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}
    volumes:
      - ./data:/app/data
      - ./storage:/app/storage
    depends_on:
      redis:
        condition: service_healthy

  worker:
    build: .
    command: npx tsx src/infrastructure/jobs/worker.ts
    environment:
      - DATABASE_PATH=/app/data/portfolio.db
      - STORAGE_PATH=/app/storage
      - REDIS_URL=redis://redis:6379
      - AUTH_SECRET=${AUTH_SECRET}
      - ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}
    volumes:
      - ./data:/app/data
      - ./storage:/app/storage
    depends_on:
      redis:
        condition: service_healthy

volumes:
  redis_data:
```

## State of the Art

| Old Approach                  | Current Approach                     | When Changed        | Impact                                                          |
| ----------------------------- | ------------------------------------ | ------------------- | --------------------------------------------------------------- |
| `priority` prop on next/image | `preload` prop                       | Next.js 16          | Must use `preload` instead of `priority`                        |
| No quality config needed      | `qualities` array required in config | Next.js 16          | Build may warn/error without configuring allowed qualities      |
| blurhash for placeholders     | LQIP (tiny base64 image)             | 2024-2025 consensus | No JS dependency, renders before JS, better visual quality      |
| node:alpine for Docker        | node:22-slim for native modules      | Ongoing             | Alpine musl libc causes issues with sharp/bcrypt/better-sqlite3 |
| `next start` in Docker        | `node server.js` (standalone)        | Next.js 13+         | 75% smaller Docker images, faster startup                       |

**Deprecated/outdated:**

- `priority` prop: Replaced by `preload` in Next.js 16. The codebase currently uses `priority` on the hero image in HomepageClient.tsx -- this should be changed to `preload`.
- plaiceholder npm package: No longer maintained. Use Sharp directly for blur placeholder generation.

## Open Questions

1. **Worker process in Docker standalone mode**
   - What we know: The standalone output only includes the Next.js server. The worker needs the full `node_modules` and source TypeScript files to run via `npx tsx`.
   - What's unclear: Whether the worker Dockerfile should be a separate image or share the same image with a different CMD.
   - Recommendation: Share the same image. Copy `node_modules` and source into the runner stage alongside standalone output. Worker uses `command: npx tsx src/infrastructure/jobs/worker.ts` override.

2. **Next.js 16 `qualities` configuration requirement**
   - What we know: Next.js 16 documentation states qualities configuration is required. With a custom loader that bypasses optimization, this may not apply.
   - What's unclear: Whether the build will warn or error without it when using `loader: "custom"`.
   - Recommendation: Configure it anyway to be safe: `images: { loader: "custom", loaderFile: "...", qualities: [75] }`.

3. **Build-time environment variable validation**
   - What we know: The Zod env validation in `infrastructure/config/env.ts` runs at import time. During `next build`, it will fail if env vars aren't set.
   - What's unclear: Whether standalone build imports env.ts during build (it likely does for server components).
   - Recommendation: Provide dummy env vars during Docker build stage (shown in Dockerfile example above).

4. **Docker not installed on dev machine**
   - What we know: STATE.md notes Docker is not installed on the development machine.
   - What's unclear: Whether the user can test Docker locally.
   - Recommendation: Write the Dockerfile and docker-compose.yml but note they need Docker Desktop or similar to test. The plan should include verification steps that work without Docker for the non-Docker sub-plans.

## Sources

### Primary (HIGH confidence)

- [Next.js Image Component docs](https://nextjs.org/docs/app/api-reference/components/image) - placeholder, blurDataURL, preload, custom loader, fill, sizes, loading props
- [Next.js output: standalone docs](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output) - standalone configuration for Docker
- [Sharp API documentation](https://sharp.pixelplumbing.com/api-operation/) - resize, toBuffer, metadata operations
- Codebase analysis (direct) - current image pipeline, component structure, database schema, API routes

### Secondary (MEDIUM confidence)

- [Mux blog: Blurry Image Placeholders](https://www.mux.com/blog/blurry-image-placeholders-on-the-web) - comprehensive comparison of blurhash vs thumbhash vs LQIP, recommending LQIP for web
- [Next.js Docker example (GitHub)](https://github.com/vercel/next.js/tree/canary/examples/with-docker) - official multi-stage Dockerfile pattern
- [Nick Oates: Creating blur placeholders](https://nickoates.com/blog/blur-placeholder-nextjs-image) - Sharp resize to 10px, base64 encode pattern
- [Flinect: Next.js Standalone Docker Sharp](https://flinect.com/blog/nextjs-standalone-docker-sharp-installation) - NEXT_SHARP_PATH and native module handling

### Tertiary (LOW confidence)

- [better-sqlite3 Alpine Discussion](https://github.com/WiseLibs/better-sqlite3/discussions/1270) - Alpine compatibility notes (validates node:slim recommendation)
- [WebP vs JPEG vs AVIF 2026](https://blog.freeimages.com/post/webp-vs-jpeg-vs-avif-best-format-for-web-photos) - format comparison (validates existing format choices)

## Metadata

**Confidence breakdown:**

- Blur placeholder approach: HIGH - multiple authoritative sources agree on LQIP over blurhash for web; Sharp generation pattern well-documented
- Custom image loader: HIGH - official Next.js docs clearly document custom loader API and loaderFile config
- Docker deployment: MEDIUM - standard patterns well-documented but this project's three native modules add complexity; untestable on dev machine
- Performance optimization: HIGH - existing codebase already has immutable caching on images; main gaps are placeholder UX and page-level caching
- Fade-in transition: HIGH - standard CSS transition pattern, well-understood

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30 days -- stable patterns, Next.js 16 is current)
